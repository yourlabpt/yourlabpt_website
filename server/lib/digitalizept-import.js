/**
 * Imports a closed deal pushed from the standalone digitalizemeunegocio repo
 * (see that repo's server/lib/export-deal.js for the payload shape it sends,
 * and its README for the "simple click or copy and paste" transfer flow).
 *
 * Mirrors what server/lib/digitalize-app.js's finalizeSelfServeDeal already
 * writes for a same-system self-serve deal (proposta/cliente_legal/contrato/
 * assinatura/projeto + scaffoldClosedDeal) — an imported deal ends up
 * indistinguishable from one closed here directly. The one difference: there
 * is no pre-existing `lead` row to update, so this creates one from scratch.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { scaffoldClosedDeal } = require('./digitalizept-work');
const { allocateDemoSlug } = require('./digitalizept-business-identity');
const { PACOTE_CODIGO } = require('./digitalize-app');

const CONTRACTS_DIR = path.join(__dirname, '..', 'data', 'digitalizept-contracts');

function nowIso() {
    return new Date().toISOString();
}

function cleanText(value, max = 1200) {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function slugLike(value) {
    return String(value || 'negocio')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'negocio';
}

function saveIncomingContract(contratoId, html, pdfBase64) {
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
    let htmlPath = '';
    let pdfPath = '';
    if (html) {
        htmlPath = path.join(CONTRACTS_DIR, `${contratoId}.html`);
        fs.writeFileSync(htmlPath, html);
    }
    if (pdfBase64) {
        try {
            pdfPath = path.join(CONTRACTS_DIR, `${contratoId}.pdf`);
            fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, 'base64'));
        } catch (_) { pdfPath = ''; }
    }
    return { htmlPath, pdfPath };
}

/**
 * Idempotent by `payload.negocioId`: replaying the same push (a retried
 * "Sync now", or a double webhook on the sending side) must not create a
 * second lead. Requires the `lead.origem_externa_id` column — see the
 * migration in digitalizept-db.js.
 */
function importExternalDeal(db, payload, businessType) {
    const negocioId = cleanText(payload.negocioId, 80);
    if (!negocioId) throw new Error('negocioId em falta no payload.');

    const existing = db.prepare('SELECT id, demo_slug FROM lead WHERE origem_externa_id = ?').get(negocioId);
    if (existing) {
        return { leadId: existing.id, demoSlug: existing.demo_slug, alreadyImported: true };
    }

    const dados = (payload.dados && typeof payload.dados === 'object') ? payload.dados : {};
    const nome = dados.nome_negocio || payload.clienteNome || 'Negócio';
    const totalCentimos = Number(payload.valorCentimos) || 0;
    const now = nowIso();
    const pagoEm = payload.pagoEm || now;

    const leadId = crypto.randomUUID();
    const dadosNegocioId = crypto.randomUUID();
    const propostaId = crypto.randomUUID();
    const clienteId = crypto.randomUUID();
    const contratoId = crypto.randomUUID();
    const assinaturaId = crypto.randomUUID();
    const projetoId = crypto.randomUUID();

    const demoSlug = allocateDemoSlug(db, {
        nome,
        existingSlug: cleanText(payload.demoSlug, 80),
        leadId,
        cidade: dados.cidade || '',
        makeSlug: slugLike
    });

    const { htmlPath, pdfPath } = saveIncomingContract(contratoId, payload.contratoHtml || '', payload.contratoPdfBase64 || '');

    db.transaction(() => {
        db.prepare(`
            INSERT INTO lead (
                id, business_type, nome, morada, telefone, whatsapp, estado, criado_em,
                demo_json, identidade_json, demo_slug, cobertura, resultado,
                origem_externa, origem_externa_id, atualizado_em
            ) VALUES (?, ?, ?, ?, ?, ?, 'fechado', ?, ?, ?, ?, 'demo_apresentada', 'digitalizado', 'digitalizemeunegocio', ?, ?)
        `).run(
            leadId, (businessType && businessType.id) || 'generico', nome,
            cleanText(dados.morada, 300), cleanText(dados.telefone, 40), cleanText(dados.whatsapp, 40),
            payload.criadoEm || now,
            JSON.stringify(payload.demo || {}), JSON.stringify(payload.identidade || {}),
            demoSlug, negocioId, now
        );

        db.prepare(`
            INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
            VALUES (?, ?, ?, '{}', ?)
        `).run(dadosNegocioId, leadId, JSON.stringify(dados), now);

        db.prepare(`
            INSERT INTO proposta (id, lead_id, itens_json, subtotal_centimos, desconto_pct, desconto_centimos,
                total_centimos, iva_rate, iva_centimos, total_com_iva_centimos, contrapartida, estado, criado_em)
            VALUES (?, ?, ?, ?, 0, 0, ?, 0, 0, ?, '', 'assinada', ?)
        `).run(
            propostaId, leadId,
            JSON.stringify({ pacote: PACOTE_CODIGO, planoId: cleanText(payload.planoId, 40), origem: 'digitalizemeunegocio-import' }),
            totalCentimos, totalCentimos, totalCentimos, pagoEm
        );

        db.prepare(`
            INSERT INTO cliente_legal (id, lead_id, nome, nif, morada, email, telefone)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(clienteId, leadId, cleanText(payload.clienteNome, 200) || nome, cleanText(payload.clienteNif, 20), cleanText(dados.morada, 300), cleanText(payload.clienteEmail, 200), cleanText(dados.telefone, 40));

        db.prepare(`
            INSERT INTO contrato (id, proposta_id, template_versao, pdf_path, hash_sha256, assinado_em, estado, criado_em)
            VALUES (?, ?, 'digitalizemeunegocio-import-v1', ?, ?, ?, 'assinado', ?)
        `).run(contratoId, propostaId, pdfPath, cleanText(payload.contratoHash, 128), pagoEm, pagoEm);

        db.prepare(`
            INSERT INTO assinatura (id, contrato_id, png_path, geo, ip, dispositivo, timestamp, hash_documento)
            VALUES (?, ?, '', '', ?, ?, ?, ?)
        `).run(assinaturaId, contratoId, cleanText(payload.assinaturaIp, 80), cleanText(payload.assinaturaUserAgent, 300), pagoEm, cleanText(payload.contratoHash, 128));

        db.prepare(`
            INSERT INTO projeto (id, contrato_id, estado, estado_google, estado_dominio, criado_em)
            VALUES (?, ?, 'demonstracao_criada', 'por_criar', 'comprado', ?)
        `).run(projetoId, contratoId, pagoEm);
    })();

    try {
        const workPath = scaffoldClosedDeal({
            projetoId,
            negocio: nome,
            clienteNome: payload.clienteNome || nome,
            clienteEmail: payload.clienteEmail || '',
            verified: { totalComIva: totalCentimos, totalSemIva: totalCentimos, iva: 0 },
            contractHtmlPath: htmlPath,
            contractPdfPath: pdfPath,
            dados,
            proposta: { pacote: PACOTE_CODIGO, origem: 'digitalizemeunegocio-import' },
            googlePresence: null,
            googleDiagnostico: null
        });
        db.prepare('UPDATE lead SET work_path = ? WHERE id = ?').run(workPath, leadId);
    } catch (err) {
        console.error('digitalizept-import: work scaffold failed:', err.message);
    }

    return { leadId, propostaId, projetoId, demoSlug, alreadyImported: false };
}

module.exports = { importExternalDeal };
