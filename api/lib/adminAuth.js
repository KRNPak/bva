const crypto = require('crypto');
const cookie = require('cookie');

// Only these emails may ever hold an admin session. Add more later by
// adding more entries here — everything else in this file works for any
// list length without change.
const ALLOWLIST = [
    'saad.qaiser@karandaaz.com.pk',
];

const COOKIE_NAME = 'krn_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function base64url(input) {
    return Buffer.from(input).toString('base64url');
}

function getSecret() {
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!secret || secret.length < 16) {
        // Fail loudly rather than silently signing with a weak/missing
        // secret — an admin endpoint is the wrong place to degrade quietly.
        throw new Error('ADMIN_SESSION_SECRET is not set (or too short) in the environment.');
    }
    return secret;
}

function sign(payloadB64) {
    return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

function createSessionToken(email) {
    const payload = { email, exp: Date.now() + SESSION_TTL_MS };
    const payloadB64 = base64url(JSON.stringify(payload));
    const signature = sign(payloadB64);
    return `${payloadB64}.${signature}`;
}

function verifySessionToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    let expectedSig;
    try {
        expectedSig = sign(payloadB64);
    } catch {
        return null;
    }

    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let payload;
    try {
        payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    } catch {
        return null;
    }

    if (!payload.email || !payload.exp || Date.now() > payload.exp) return null;
    // Re-check the allowlist on every request, not just at login — if an
    // email is ever removed, existing sessions for it stop working
    // immediately rather than staying valid until they expire.
    if (!ALLOWLIST.includes(payload.email)) return null;

    return payload.email;
}

function setSessionCookie(res, token) {
    res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: SESSION_TTL_MS / 1000,
    }));
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, '', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
    }));
}

function getSessionEmail(req) {
    const cookies = cookie.parse(req.headers.cookie || '');
    return verifySessionToken(cookies[COOKIE_NAME]);
}

module.exports = {
    ALLOWLIST,
    createSessionToken,
    verifySessionToken,
    setSessionCookie,
    clearSessionCookie,
    getSessionEmail,
};
