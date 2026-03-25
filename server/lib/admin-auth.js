const crypto = require('crypto');

function createAdminAuth(options = {}) {
    const password = typeof options.password === 'string' && options.password
        ? options.password
        : 'yourlab-admin';
    const tokenTtlMs = Number(options.tokenTtlMs || 8 * 60 * 60 * 1000);

    const tokens = new Map();

    function issueToken() {
        const token = crypto.randomBytes(32).toString('hex');
        tokens.set(token, Date.now() + tokenTtlMs);
        return token;
    }

    function revokeToken(token) {
        if (!token) return;
        tokens.delete(String(token));
    }

    function isValidToken(token) {
        if (!token || !tokens.has(token)) return false;
        const expiresAt = tokens.get(token);
        if (Date.now() > expiresAt) {
            tokens.delete(token);
            return false;
        }
        return true;
    }

    function requireAdmin(req, res, next) {
        const token = String(req.headers['x-admin-token'] || '').trim();
        if (!isValidToken(token)) {
            return res.status(401).json({ error: 'Unauthorized. Please log in to the admin dashboard.' });
        }
        return next();
    }

    function validatePassword(inputPassword) {
        return Boolean(inputPassword && inputPassword === password);
    }

    return {
        issueToken,
        revokeToken,
        isValidToken,
        requireAdmin,
        validatePassword
    };
}

module.exports = {
    createAdminAuth
};
