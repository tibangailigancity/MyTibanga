import pool, { query } from '@/lib/db';

const SETTINGS_KEY = 'orBooklet';

export class OrBookletError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OrBookletError';
    }
}

/** @param {unknown} raw */
export function normalizeOrBooklet(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const nextOr = Number.parseInt(String(raw.nextOr), 10);
    const endOr = Number.parseInt(String(raw.endOr), 10);
    if (!Number.isFinite(nextOr) || !Number.isFinite(endOr)) return null;
    if (nextOr < 1 || endOr < 1 || nextOr > endOr) return null;
    return {
        nextOr,
        endOr,
        notes: String(raw.notes || '').trim(),
    };
}

export function formatOrNumber(value) {
    return String(value).trim();
}

export function orBookletSummary(booklet) {
    if (!booklet) return null;
    return {
        nextOr: booklet.nextOr,
        endOr: booklet.endOr,
        remaining: Math.max(0, booklet.endOr - booklet.nextOr + 1),
        notes: booklet.notes || '',
    };
}

export async function loadOrBooklet() {
    const { rows } = await query(`SELECT value FROM settings WHERE key = $1`, [SETTINGS_KEY]);
    return normalizeOrBooklet(rows[0]?.value);
}

/** @param {{ nextOr: number, endOr: number, notes?: string }} booklet */
export async function saveOrBooklet(booklet) {
    const normalized = normalizeOrBooklet(booklet);
    if (!normalized) {
        throw new OrBookletError('Next OR and last OR must be valid numbers, and next cannot exceed last.');
    }
    await query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [SETTINGS_KEY, JSON.stringify(normalized)]
    );
    return normalized;
}

/**
 * Reserve the next OR, persist counter increment. Uses a transaction.
 * @param {number|string|null} excludeRequestId
 */
export async function allocateNextOrNumber(excludeRequestId = null) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `SELECT value FROM settings WHERE key = $1 FOR UPDATE`,
            [SETTINGS_KEY]
        );
        const booklet = normalizeOrBooklet(rows[0]?.value);
        if (!booklet) {
            throw new OrBookletError(
                'OR booklet is not configured. Set the next and last OR numbers in System Settings.'
            );
        }
        const { nextOr, endOr } = booklet;
        if (nextOr > endOr) {
            throw new OrBookletError(
                'This OR booklet is fully used. Register a new OR range in System Settings.'
            );
        }

        const orNumber = formatOrNumber(nextOr);
        const excludeId = excludeRequestId != null ? Number(excludeRequestId) : null;
        const dup = await client.query(
            `SELECT id FROM requests
             WHERE TRIM(or_number) = $1
               AND ($2::bigint IS NULL OR id != $2)
             LIMIT 1`,
            [orNumber, Number.isFinite(excludeId) ? excludeId : null]
        );
        if (dup.rows.length > 0) {
            throw new OrBookletError(
                `OR number ${orNumber} is already used on another request. Adjust the next OR in System Settings.`
            );
        }

        const updated = {
            ...booklet,
            nextOr: nextOr + 1,
        };
        await client.query(
            `INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2`,
            [SETTINGS_KEY, JSON.stringify(updated)]
        );
        await client.query('COMMIT');
        return { orNumber, booklet: updated };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Pick OR for status change: keep existing, use manual body, or auto-allocate.
 */
export async function resolveOrForStatusUpdate({
    requestId,
    existingOrNumber,
    providedOrNumber,
    newStatus,
}) {
    const manual =
        providedOrNumber !== undefined ? String(providedOrNumber).trim() : undefined;
    if (manual) {
        return { orNumber: manual, allocated: false };
    }

    const existing = String(existingOrNumber || '').trim();
    if (existing) {
        return { orNumber: existing, allocated: false };
    }

    const autoStatuses = ['for_release', 'completed'];
    if (!autoStatuses.includes(newStatus)) {
        return { orNumber: '', allocated: false };
    }

    const { orNumber } = await allocateNextOrNumber(requestId);
    return { orNumber, allocated: true };
}
