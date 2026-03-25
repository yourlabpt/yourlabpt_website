export function parseProjectInput(rawInput) {
    const raw = (rawInput || '').trim();
    if (!raw) {
        throw new Error('Paste the JSON payload first.');
    }

    let candidate = raw;

    const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced && fenced[1]) {
        candidate = fenced[1].trim();
    }

    if (!(candidate.startsWith('{') || candidate.startsWith('['))) {
        const start = candidate.search(/[\[{]/);
        const endObject = candidate.lastIndexOf('}');
        const endArray = candidate.lastIndexOf(']');
        const end = Math.max(endObject, endArray);
        if (start >= 0 && end > start) {
            candidate = candidate.slice(start, end + 1).trim();
        }
    }

    try {
        return JSON.parse(candidate);
    } catch (_) {
        throw new Error('Invalid JSON. Paste only the JSON payload from the agent output.');
    }
}

export function prepareReplacePayload(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.projects)) return parsed.projects;
    throw new Error('Replace requires a JSON array (or an object with a `projects` array).');
}
