#!/usr/bin/env node
/**
 * Copies the commercial focus from digitalizemeunegocio into this repo so the
 * sales tool deploys on its own: server/config/foco/verticais.json (as-is) and
 * server/config/foco/tipos.json (id → display name of every type it mentions).
 *
 * digitalizemeunegocio stays the source of truth. After editing its
 * verticais.json, run `npm run foco:sync` here and commit the result.
 *   DMN_DIR=/path/to/digitalizemeunegocio npm run foco:sync
 */
const fs = require('fs');
const path = require('path');

const DMN_DIR = process.env.DMN_DIR
    || path.resolve(__dirname, '../../../../../yourlab_company/drive/03_WORK/digitalizemeunegocio');
const origem = path.join(DMN_DIR, 'server/config/verticais.json');
const destino = path.join(__dirname, '..', 'config', 'foco');

if (!fs.existsSync(origem)) {
    console.error(`Não encontrei ${origem}. Defina DMN_DIR com o caminho do repositório digitalizemeunegocio.`);
    process.exit(1);
}
const texto = fs.readFileSync(origem, 'utf8');
const cfg = JSON.parse(texto);
const tipos = {};
[...new Set(cfg.verticais.flatMap((v) => v.tipos || []))].sort().forEach((id) => {
    try {
        tipos[id] = JSON.parse(fs.readFileSync(path.join(DMN_DIR, 'server/config/business-types', `${id}.json`), 'utf8')).nome || id;
    } catch (_) {
        tipos[id] = id;
    }
});
fs.mkdirSync(destino, { recursive: true });
fs.writeFileSync(path.join(destino, 'verticais.json'), texto);
fs.writeFileSync(path.join(destino, 'tipos.json'), `${JSON.stringify(tipos, null, 2)}\n`);
console.log(`verticais ${cfg.versao}: ${cfg.verticais.length} segmentos, ${Object.keys(tipos).length} tipos → ${destino}`);
