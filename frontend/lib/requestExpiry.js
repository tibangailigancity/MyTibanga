import { query } from '@/lib/db';

const DEFAULT_PENDING_EXPIRY_DAYS = 3;
const EXPIRED_RETENTION_DAYS = 30;

export async function getPendingExpiryDays() {
    const { rows } = await query("SELECT value FROM settings WHERE key = 'pendingExpiryDays'");
    const raw = rows[0]?.value;
    const asNumber = Number(
        typeof raw === 'object' && raw !== null && 'days' in raw ? raw.days : raw
    );
    if (!Number.isFinite(asNumber) || asNumber < 1) return DEFAULT_PENDING_EXPIRY_DAYS;
    return Math.floor(asNumber);
}

/**
 * Soft-archive pending requests older than N days as "expired".
 * Uses DB-side time comparison so server timezone differences do not matter.
 */
export async function purgeExpiredPendingRequests(days = null) {
    const configuredDays = days == null ? await getPendingExpiryDays() : days;
    const safeDays = Number.isFinite(configuredDays) && configuredDays > 0
        ? Math.floor(configuredDays)
        : DEFAULT_PENDING_EXPIRY_DAYS;

    await query(
        'ALTER TABLE requests ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ DEFAULT NULL'
    );

    const { rowCount } = await query(
        `UPDATE requests
         SET status = 'expired',
             expired_at = COALESCE(expired_at, NOW()),
             admin_notes = CASE
                 WHEN COALESCE(admin_notes, '') = '' THEN 'Request expired due to incomplete requirements.'
                 ELSE admin_notes
             END
         WHERE status = 'pending'
           AND COALESCE(NULLIF(date, ''), '') <> ''
           AND date::timestamptz < (NOW() - ($1::int * INTERVAL '1 day'))`,
        [safeDays]
    );

    // Hard-delete expired requests older than retention window
    // to keep the admin "Expired Documents" list manageable.
    await query(
        `DELETE FROM requests
         WHERE status = 'expired'
           AND expired_at IS NOT NULL
           AND expired_at < (NOW() - ($1::int * INTERVAL '1 day'))`,
        [EXPIRED_RETENTION_DAYS]
    );

    return rowCount || 0;
}
