import { sendSMS, isPhilippineMobileSmsCapable, formatSmsError } from '@/lib/sms';

/** Fallback when no password is available (should not happen on create). */
export const WELCOME_SMS_TEXT =
    'Brgy Tibanga: Your portal account is ready. Visit the barangay office for details.';

/**
 * Welcome SMS with 6-digit PIN only (no username — dotted names blocked by UniSMS).
 * Exact wording: variant 12 pattern with "Password:" label.
 */
export function buildResidentAccountCreatedSms(tempPassword) {
    const pw = String(tempPassword || '').trim();
    if (!pw) return WELCOME_SMS_TEXT;
    return `Brgy Tibanga: Your portal account is ready. Password: ${pw}.`;
}

/** Human-readable note for admin UI after resident account creation. */
export function formatResidentAccountSmsNote({ smsSent, smsReason, accountCreated }) {
    if (smsSent) {
        return '6-digit PIN sent by SMS. Username is firstname.lastname (shown below).';
    }
    if (smsReason === 'username_exists') {
        return 'Login username already exists — portal account was not created. SMS not sent.';
    }
    if (smsReason === 'no_mobile') {
        return accountCreated
            ? 'Portal account created. No valid mobile number — give the password below in person.'
            : 'No valid mobile number — SMS not sent.';
    }
    if (smsReason === 'API key not configured') {
        return 'Portal account created. UNISMS_API_KEY is not set — give the password below in person.';
    }
    if (smsReason && smsReason !== 'no_account' && smsReason !== 'pending') {
        return `SMS failed (${smsReason}). Give the temporary password below in person.`;
    }
    if (!accountCreated) {
        return 'Resident saved. No portal login account was created.';
    }
    return 'Portal account created. SMS was not sent — give the temporary password below in person.';
}

/** Send welcome SMS with temp password; does not throw — caller decides whether to await. */
export async function sendResidentWelcomeSms(mobile, tempPassword) {
    if (!isPhilippineMobileSmsCapable(mobile)) {
        return { sent: false, reason: 'no_mobile' };
    }
    const msg = buildResidentAccountCreatedSms(tempPassword);
    const result = await sendSMS(mobile, msg);
    if (result.success) return { sent: true };
    const reason = formatSmsError(result.error);
    console.warn(`[SMS] resident welcome to ${mobile}:`, reason);
    return { sent: false, reason };
}
