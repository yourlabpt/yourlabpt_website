const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadEnv() {
    const candidates = [
        path.join(__dirname, '..', '.env'),
        path.join(process.cwd(), '.env')
    ];

    const seen = new Set();
    for (const candidate of candidates) {
        const resolved = path.resolve(candidate);
        if (seen.has(resolved)) continue;
        seen.add(resolved);

        if (!fs.existsSync(resolved)) continue;
        const result = dotenv.config({ path: resolved, override: false });
        if (!result.error) return resolved;
    }

    dotenv.config();
    return '';
}

module.exports = {
    loadEnv
};
