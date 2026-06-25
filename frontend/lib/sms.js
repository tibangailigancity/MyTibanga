/**
 * SMS helper using UniSMS (https://unismsapi.com).
 *
 * Requires UNISMS_API_KEY in .env.local.
 * Sends SMS to Philippine mobile numbers.
 */

const API_URL = 'https://unismsapi.com/api/sms';
const SMS_TIMEOUT_MS = 4500;

/**
 * Philippine mobile numbers that can receive SMS (09… or +639… / 639…).
 * Landlines (e.g. 02…, 032…, 063…) return false — SMS is not sent for those.
 */
export function isPhilippineMobileSmsCapable(raw) {
    if (!raw || typeof raw !== 'string') return false;
    const p = raw.replace(/[\s\-()]/g, '');
    if (!p) return false;
    if (/^09\d{9}$/.test(p)) return true;
    if (/^\+639\d{9}$/.test(p)) return true;
    if (/^639\d{9}$/.test(p)) return true;
    return false;
}

/** Turn UniSMS / network errors into a short string for logs and API responses. */
export function formatSmsError(error) {
    if (!error) return 'send_failed';
    if (typeof error === 'string') {
        try {
            const parsed = JSON.parse(error);
            if (parsed && typeof parsed === 'object') return formatSmsError(parsed);
        } catch {
            return error;
        }
        return error;
    }
    if (typeof error === 'object') {
        if (error.errors && typeof error.errors === 'object') {
            const parts = [];
            for (const msgs of Object.values(error.errors)) {
                const list = Array.isArray(msgs) ? msgs : [msgs];
                for (const m of list) {
                    if (m != null && String(m).trim()) parts.push(String(m).trim());
                }
            }
            if (parts.length) return parts.join(' ');
        }
        const msg = error.message || error.error || error.detail || error.title;
        if (typeof msg === 'string' && msg.trim()) return msg.trim();
        try {
            return JSON.stringify(error);
        } catch {
            return 'send_failed';
        }
    }
    return String(error);
}

export async function sendSMS(to, message) {
    const apiKey = process.env.UNISMS_API_KEY;
    if (!apiKey) {
        console.warn('UNISMS_API_KEY not set — skipping SMS');
        return { success: false, error: 'API key not configured' };
    }

    if (!isPhilippineMobileSmsCapable(to)) {
        return { success: false, error: 'Invalid Philippine mobile number' };
    }

    // Normalize PH mobile to E.164 (+639xxxxxxxxx)
    let phone = to.replace(/[\s\-()]/g, '');
    if (phone.startsWith('09')) phone = '+63' + phone.slice(1);
    else if (/^639\d{9}$/.test(phone)) phone = '+' + phone;
    if (!phone.startsWith('+639') || phone.length !== 13) {
        return { success: false, error: 'Invalid Philippine mobile number' };
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SMS_TIMEOUT_MS);
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
            },
            signal: controller.signal,
            body: JSON.stringify({
                recipient: phone,
                content: message,
            }),
        }).finally(() => clearTimeout(timer));

        let data;
        const text = await res.text();
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { message: text || `HTTP ${res.status}` };
        }

        if (res.ok) {
            return { success: true, data };
        }
        return { success: false, error: formatSmsError(data) };
    } catch (error) {
        const code = error?.cause?.code;
        if (
            code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            code === 'CERT_HAS_EXPIRED' ||
            /certificate|SSL|TLS/i.test(String(error?.message))
        ) {
            console.error(
                'SMS send error (TLS): HTTPS to UniSMS failed certificate verification. On Windows, run `npm run dev` (uses Node --use-system-ca), or fix Git/pip-style CA issues on your network.'
            );
        } else {
            console.error('SMS send error:', error);
        }
        return { success: false, error: error.message };
    }
}
