const { OAuth2Client } = require('google-auth-library');
const { ALLOWLIST, createSessionToken, setSessionCookie } = require('../lib/adminAuth');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    const GENERIC_ERROR = { error: 'Sign-in failed. Please try again.' };

    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            console.error('GOOGLE_CLIENT_ID is not set.');
            return res.status(500).json(GENERIC_ERROR);
        }

        const { idToken } = req.body || {};
        if (!idToken || typeof idToken !== 'string') {
            return res.status(400).json(GENERIC_ERROR);
        }

        const client = new OAuth2Client(clientId);
        let ticket;
        try {
            ticket = await client.verifyIdToken({ idToken, audience: clientId });
        } catch {
            // Covers: malformed token, bad signature, expired token,
            // wrong audience — all treated the same, no detail returned.
            return res.status(401).json(GENERIC_ERROR);
        }

        const payload = ticket.getPayload();
        if (!payload || !payload.email || !payload.email_verified) {
            return res.status(401).json(GENERIC_ERROR);
        }

        const email = payload.email.toLowerCase().trim();
        if (!ALLOWLIST.includes(email)) {
            // Same generic message as any other failure — this endpoint
            // never confirms or denies whether a given email exists.
            return res.status(403).json(GENERIC_ERROR);
        }

        const token = createSessionToken(email);
        setSessionCookie(res, token);
        return res.status(200).json({ ok: true, email });

    } catch (err) {
        console.error('admin-login error:', err);
        return res.status(500).json(GENERIC_ERROR);
    }
};
