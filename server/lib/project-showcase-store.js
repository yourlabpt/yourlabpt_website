const fs = require('fs');

function cleanText(value, max = 1200) {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

function normalizeProjectId(value, fallback = '') {
    const raw = cleanText(value, 160).toLowerCase();
    const normalized = raw
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || cleanText(fallback, 160).toLowerCase() || '';
}

function normalizeProjectLangValue(value, fallback = '') {
    if (typeof value === 'string') {
        const text = cleanText(value, 600);
        return { pt: text, en: text };
    }

    if (!value || typeof value !== 'object') {
        return { pt: fallback, en: fallback };
    }

    const pt = cleanText(
        typeof value.pt === 'string'
            ? value.pt
            : typeof value.en === 'string'
                ? value.en
                : fallback,
        600
    );

    const en = cleanText(
        typeof value.en === 'string'
            ? value.en
            : typeof value.pt === 'string'
                ? value.pt
                : fallback,
        600
    );

    return { pt, en };
}

function normalizeProjectLangList(value, fallback = []) {
    const fallbackList = ensureArray(fallback);

    if (Array.isArray(value)) {
        const cleaned = value.map((item) => cleanText(String(item || ''), 320)).filter(Boolean);
        return { pt: cleaned, en: [...cleaned] };
    }

    if (typeof value === 'string') {
        const cleaned = cleanText(value, 320);
        const list = cleaned ? [cleaned] : [];
        return { pt: list, en: [...list] };
    }

    if (!value || typeof value !== 'object') {
        const fallbackCleaned = fallbackList.map((item) => cleanText(String(item || ''), 320)).filter(Boolean);
        return { pt: fallbackCleaned, en: [...fallbackCleaned] };
    }

    const sourcePt = ensureArray(value.pt);
    const sourceEn = ensureArray(value.en);
    const shared = sourcePt.length || sourceEn.length ? [] : fallbackList;

    const pt = (sourcePt.length ? sourcePt : shared).map((item) => cleanText(String(item || ''), 320)).filter(Boolean);
    const en = (sourceEn.length ? sourceEn : shared).map((item) => cleanText(String(item || ''), 320)).filter(Boolean);

    return { pt, en };
}

function firstAvailable(source, keys, fallback = '') {
    for (const key of keys) {
        const value = source[key];
        if (value == null) continue;
        if (typeof value === 'string' && value.trim()) return value;
        if (typeof value === 'object') return value;
        if (Array.isArray(value) && value.length) return value;
    }
    return fallback;
}

function normalizeProjectEntry(input, index = 0) {
    if (!input || typeof input !== 'object') return null;

    const source = (input.project && typeof input.project === 'object')
        ? input.project
        : input;

    const title = normalizeProjectLangValue(
        firstAvailable(source, ['title', 'name', 'projectTitle', 'caseTitle', 'headline'], ''),
        ''
    );

    if (!title.pt && !title.en) return null;

    const solutionDeliveredRaw = firstAvailable(
        source,
        ['solutionDelivered', 'finalResult', 'solution', 'deliverables', 'delivery'],
        []
    );
    let solutionDelivered = normalizeProjectLangList(solutionDeliveredRaw, []);
    const finalResultText = normalizeProjectLangValue(firstAvailable(source, ['finalResult'], ''), '');

    if (!solutionDelivered.pt.length && finalResultText.pt) {
        solutionDelivered.pt = [finalResultText.pt];
    }
    if (!solutionDelivered.en.length && finalResultText.en) {
        solutionDelivered.en = [finalResultText.en];
    }

    const fallbackId = `project-${index + 1}`;
    const id = normalizeProjectId(source.id, fallbackId) || fallbackId;

    return {
        id,
        title,
        clientProfile: normalizeProjectLangValue(
            firstAvailable(source, ['clientProfile', 'client', 'audience', 'targetClient', 'customerProfile'], ''),
            ''
        ),
        sector: normalizeProjectLangValue(firstAvailable(source, ['sector', 'industry', 'market', 'vertical'], ''), ''),
        timeline: normalizeProjectLangValue(firstAvailable(source, ['timeline', 'duration', 'deliveryWindow'], ''), ''),
        strategicRequest: normalizeProjectLangValue(
            firstAvailable(source, ['strategicRequest', 'request', 'objective', 'goal', 'challenge'], ''),
            ''
        ),
        painSnapshot: normalizeProjectLangValue(
            firstAvailable(source, ['painSnapshot', 'requestPain', 'pain', 'problem', 'initialPain'], ''),
            ''
        ),
        businessImpact: normalizeProjectLangValue(
            firstAvailable(source, ['businessImpact', 'impact', 'painImpact', 'risk'], ''),
            ''
        ),
        approach: normalizeProjectLangList(
            firstAvailable(source, ['approach', 'processProposal', 'process', 'execution', 'steps'], []),
            []
        ),
        solutionDelivered,
        results: normalizeProjectLangList(firstAvailable(source, ['results', 'outcomes', 'result', 'kpis'], []), []),
        dailyUse: normalizeProjectLangList(
            firstAvailable(source, ['dailyUse', 'operations', 'dayToDay', 'adoption'], []),
            []
        ),
        ctaText: normalizeProjectLangValue(firstAvailable(source, ['ctaText', 'cta', 'callToAction'], ''), '')
    };
}

function normalizeProjectCollection(input) {
    const source = Array.isArray(input)
        ? input
        : (input && Array.isArray(input.projects))
            ? input.projects
            : [input];

    return source
        .map((entry, index) => normalizeProjectEntry(entry, index))
        .filter(Boolean);
}

function createProjectShowcaseStore(options = {}) {
    const filePath = options.filePath;
    if (!filePath) {
        throw new Error('Project showcase store requires a filePath.');
    }

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]\n');
    }

    function read() {
        try {
            if (!fs.existsSync(filePath)) return [];
            const raw = fs.readFileSync(filePath, 'utf8').trim();
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return normalizeProjectCollection(parsed);
        } catch (error) {
            console.error('Failed to read project showcase data:', error.message);
            return [];
        }
    }

    function write(projects) {
        const normalized = normalizeProjectCollection(projects);
        fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
        return normalized;
    }

    function applyPayload(currentProjects, payload) {
        let next = [...currentProjects];
        const actions = [];

        function upsertProject(project, targetId = '') {
            const normalized = normalizeProjectEntry(project, next.length);
            if (!normalized) return;

            const normalizedTarget = normalizeProjectId(targetId, '');
            const effectiveId = normalizedTarget || normalized.id;
            normalized.id = effectiveId;

            const index = next.findIndex((item) => item.id === effectiveId);
            if (index >= 0) {
                next[index] = normalized;
                actions.push(`updated:${effectiveId}`);
            } else {
                next.push(normalized);
                actions.push(`added:${effectiveId}`);
            }
        }

        function processNode(node) {
            if (node == null) return;

            if (typeof node === 'string') {
                try {
                    processNode(JSON.parse(node));
                } catch (_) {
                    throw new Error('Invalid JSON string payload.');
                }
                return;
            }

            if (Array.isArray(node)) {
                node.forEach(processNode);
                return;
            }

            if (typeof node !== 'object') return;

            if (Array.isArray(node.projects)) {
                const replaced = normalizeProjectCollection(node.projects);
                next = replaced;
                actions.push(`replaced:${replaced.length}`);
                return;
            }

            const operation = cleanText(node.operation || node.mode, 40).toLowerCase();
            const targetId = cleanText(node.target_id || node.targetId || node.id, 160);

            if (operation === 'delete') {
                const normalizedId = normalizeProjectId(targetId, '');
                if (!normalizedId) return;
                const before = next.length;
                next = next.filter((item) => item.id !== normalizedId);
                if (next.length !== before) {
                    actions.push(`deleted:${normalizedId}`);
                }
                return;
            }

            if (operation === 'replace' && node.project && typeof node.project === 'object') {
                const replaced = normalizeProjectCollection([node.project]);
                next = replaced;
                actions.push(`replaced:${replaced.length}`);
                return;
            }

            if (node.project && typeof node.project === 'object') {
                upsertProject(node.project, operation === 'update' ? targetId : '');
                return;
            }

            upsertProject(node, targetId);
        }

        processNode(payload);
        return { projects: next, actions };
    }

    return {
        read,
        write,
        applyPayload,
        normalizeProjectId,
        normalizeProjectCollection
    };
}

module.exports = {
    createProjectShowcaseStore
};
