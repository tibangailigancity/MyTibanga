/** Documentary stamp for portal document/certificate collections (per client RCD). */
export const RCD_DOC_STAMP = 30;

/** Portal documents that auto-populate into RCD when fee > 0 on the request line. */
export const RCD_AUTO_FEE_DOCUMENTS = new Set([
    'Barangay Clearance',
    'Barangay Certificate for Solo Parents',
    'Barangay Certificate of Residency',
]);

/** All five portal document types (zero-fee ones are manual entry in RCD). */
export const PORTAL_DOCUMENT_NAMES = [
    'Barangay Clearance',
    'Barangay Certificate for Solo Parents',
    'Barangay Certificate for Motorized Banca',
    'Barangay Certificate of Indigency',
    'Barangay Certificate of Residency',
];

const COLLECTION_NAME_ALIASES = {
    'Barangay Clearance': 'BRGY. CLEARANCE',
    'Barangay Certificate of Residency': 'BRGY. RESIDENCY',
    'Barangay Certificate for Solo Parents': 'BRGY. CERTIFICATION',
    'Barangay Certificate for Motorized Banca': 'BRGY. CERTIFICATION',
    'Barangay Certificate of Indigency': 'BRGY. CERTIFICATION',
};

export function toRcdCollectionName(name = '') {
    const trimmed = String(name).trim();
    if (!trimmed) return '';
    if (COLLECTION_NAME_ALIASES[trimmed]) return COLLECTION_NAME_ALIASES[trimmed];
    return trimmed.toUpperCase();
}

export function normalizePortalDocumentName(name = '') {
    const raw = String(name).trim();
    const lowered = raw.toLowerCase();
    if (!raw) return '';

    if (/motorized\s*banca/.test(lowered)) return 'Barangay Certificate for Motorized Banca';
    if (/solo\s*parents?/.test(lowered)) return 'Barangay Certificate for Solo Parents';
    if (/indigency/.test(lowered)) return 'Barangay Certificate of Indigency';
    if (/residency/.test(lowered)) return 'Barangay Certificate of Residency';
    if (/barangay\s*certificate/.test(lowered) || /barangay\s*clearance/.test(lowered)) {
        return 'Barangay Clearance';
    }
    return raw;
}

export function isAutoRcdDocument(name = '') {
    const normalized = normalizePortalDocumentName(name);
    return RCD_AUTO_FEE_DOCUMENTS.has(normalized);
}

export function defaultDocStampForManual(collectionName = '') {
    const upper = String(collectionName).trim().toUpperCase();
    if (/RENTAL|VENUE|GYM/.test(upper)) return 0;
    if (/BRGY\.|BARANGAY|CERTIF|CLEARANCE|RESIDEN|INDIGEN|FILING/.test(upper)) {
        return RCD_DOC_STAMP;
    }
    return 0;
}

export function parseRequestDateToYmd(dateLike) {
    if (!dateLike) return '';
    const parsed = new Date(dateLike);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

export function formatRcdDisplayDate(ymd) {
    if (!ymd) return '';
    const [y, m, d] = String(ymd).split('-');
    if (!y || !m || !d) return ymd;
    return `${m}/${d}/${y}`;
}

function toLocalYmd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function isYmdInRange(ymd, startYmd, endYmd) {
    if (!ymd || !startYmd || !endYmd) return false;
    return ymd >= startYmd && ymd <= endYmd;
}

/**
 * Resolve RCD report period into an inclusive date range.
 * @param {URLSearchParams} searchParams
 */
export function resolveRcdPeriodParams(searchParams) {
    const period = searchParams.get('period') || 'day';
    const now = new Date();
    const dayParam = searchParams.get('day') || '';
    const monthParam = searchParams.get('month') || '';
    const yearParam = parseInt(searchParams.get('year') || '', 10);

    const normalizedDay = (!dayParam || Number.isNaN(new Date(dayParam).getTime()))
        ? toLocalYmd(now)
        : dayParam;
    const normalizedMonth = /^\d{4}-\d{2}$/.test(monthParam)
        ? monthParam
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const normalizedYear = Number.isFinite(yearParam) ? yearParam : now.getFullYear();

    if (period === 'week') {
        const target = new Date(normalizedDay);
        const dayOfWeek = target.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(target);
        weekStart.setDate(target.getDate() + diffToMonday);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const startYmd = toLocalYmd(weekStart);
        const endYmd = toLocalYmd(weekEnd);
        return {
            period,
            startYmd,
            endYmd,
            periodLabel: `Week of ${formatRcdDisplayDate(startYmd)} – ${formatRcdDisplayDate(endYmd)}`,
        };
    }

    if (period === 'month') {
        const [y, m] = normalizedMonth.split('-').map((n) => parseInt(n, 10));
        const startYmd = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endYmd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const monthName = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return { period, startYmd, endYmd, periodLabel: monthName };
    }

    if (period === 'year') {
        const startYmd = `${normalizedYear}-01-01`;
        const endYmd = `${normalizedYear}-12-31`;
        return { period, startYmd, endYmd, periodLabel: String(normalizedYear) };
    }

    return {
        period: 'day',
        startYmd: normalizedDay,
        endYmd: normalizedDay,
        periodLabel: formatRcdDisplayDate(normalizedDay),
    };
}

export function buildRcdApiQueryString({
    period = 'day',
    day = '',
    month = '',
    year = '',
    treasurer = '',
} = {}) {
    const params = new URLSearchParams();
    params.set('period', period);
    if (period === 'year' && year) params.set('year', year);
    if (period === 'month' && month) params.set('month', month);
    if ((period === 'day' || period === 'week') && day) params.set('day', day);
    if (treasurer?.trim()) params.set('treasurer', treasurer.trim());
    return params.toString();
}

export function formatMoney(value) {
    const num = Number(value || 0);
    return num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Portal document fees include a fixed doc stamp per copy (₱30).
 * RCD Amount column = certificate fee only; Doc Stamp column = ₱30 × quantity.
 */
export function splitPaidDocumentLineForRcd(lineTotal, unitPrice, quantity = 1) {
    const qty = Math.max(1, Number(quantity) || 1);
    const total = Number(lineTotal) > 0
        ? Number(lineTotal)
        : Number(unitPrice || 0) * qty;
    const docStamp = RCD_DOC_STAMP * qty;
    const amount = Math.max(0, total - docStamp);
    return { amount, docStamp, lineTotal: total };
}

function sortRcdRows(rows) {
    return [...(rows || [])].sort((a, b) => {
        const dateCmp = String(a.date || '').localeCompare(String(b.date || ''));
        if (dateCmp !== 0) return dateCmp;
        const orA = Number.parseInt(a.orNumber, 10);
        const orB = Number.parseInt(b.orNumber, 10);
        if (Number.isFinite(orA) && Number.isFinite(orB) && orA !== orB) return orA - orB;
        return String(a.orNumber).localeCompare(String(b.orNumber));
    });
}

/**
 * Build read-only RCD rows from portal requests (fee-bearing documents only).
 * @param {Array} requests - admin requests with documents[]
 * @param {string} startYmd - YYYY-MM-DD
 * @param {string} [endYmd] - YYYY-MM-DD inclusive
 */
export function buildAutoRcdRows(requests, startYmd, endYmd = startYmd) {
    const rows = [];
    const eligibleStatuses = new Set(['approved', 'for_release', 'completed']);

    for (const req of requests || []) {
        if (!eligibleStatuses.has(req.status)) continue;
        if (!String(req.orNumber || '').trim()) continue;

        const requestYmd = parseRequestDateToYmd(req.date);
        if (!isYmdInRange(requestYmd, startYmd, endYmd)) continue;

        for (const doc of req.documents || []) {
            const normalized = normalizePortalDocumentName(doc.name);
            if (!isAutoRcdDocument(normalized)) continue;

            const lineTotal = Number(doc.total ?? 0);
            const unitPrice = Number(doc.unitPrice ?? 0);
            const qty = Number(doc.quantity ?? 1);
            const { amount, docStamp, lineTotal: paidTotal } = splitPaidDocumentLineForRcd(
                lineTotal,
                unitPrice,
                qty
            );
            if (paidTotal <= 0) continue;

            rows.push({
                id: `auto-${req.id}-${normalized}`,
                source: 'portal',
                requestId: req.id,
                date: requestYmd,
                orNumber: String(req.orNumber).trim(),
                payor: req.residentName || '',
                collectionName: toRcdCollectionName(normalized),
                amount,
                docStamp,
            });
        }
    }

    return sortRcdRows(rows);
}

export function sumRcdRows(rows) {
    return (rows || []).reduce(
        (acc, row) => {
            acc.amount += Number(row.amount || 0);
            acc.docStamp += Number(row.docStamp || 0);
            return acc;
        },
        { amount: 0, docStamp: 0 }
    );
}

export function mergeRcdRows(autoRows, manualRows) {
    const manual = (manualRows || []).map((row) => ({
        id: `manual-${row.id}`,
        source: 'manual',
        manualId: row.id,
        date: parseRequestDateToYmd(row.collection_date || row.date),
        orNumber: row.or_number || row.orNumber || '',
        payor: row.payor || '',
        collectionName: row.collection_name || row.collectionName || '',
        amount: Number(row.amount || 0),
        docStamp: Number(row.doc_stamp ?? row.docStamp ?? 0),
    }));

    return sortRcdRows([...(autoRows || []), ...manual]);
}

export function groupCollectionsByDate(collections) {
    const groups = [];
    let bucket = null;

    for (const row of sortRcdRows(collections)) {
        const date = row.date || '';
        if (!bucket || bucket.date !== date) {
            if (bucket) {
                bucket.subtotal = sumRcdRows(bucket.rows);
                groups.push(bucket);
            }
            bucket = { date, rows: [] };
        }
        bucket.rows.push(row);
    }

    if (bucket) {
        bucket.subtotal = sumRcdRows(bucket.rows);
        groups.push(bucket);
    }

    return groups;
}

export function collectionsToCsv({ treasurerName = '', periodLabel = '', collections = [], totals = {} }) {
    const escapeCell = (cell) => {
        const value = cell == null ? '' : String(cell);
        if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
        return value;
    };

    const groups = groupCollectionsByDate(collections);
    const dataRows = [];

    for (const group of groups) {
        for (const row of group.rows) {
            dataRows.push([
                formatRcdDisplayDate(row.date),
                row.source === 'portal' ? 'Portal' : 'Manual',
                row.orNumber || '',
                row.payor || '',
                row.collectionName || '',
                formatMoney(row.amount),
                Number(row.docStamp) > 0 ? formatMoney(row.docStamp) : '',
            ]);
        }
        dataRows.push([
            'SUB TOTAL',
            '',
            '',
            '',
            '',
            formatMoney(group.subtotal.amount),
            group.subtotal.docStamp > 0 ? formatMoney(group.subtotal.docStamp) : '',
        ]);
    }

    if (groups.length > 1) {
        dataRows.push([]);
        dataRows.push([
            'GRAND TOTAL',
            '',
            '',
            '',
            '',
            formatMoney(totals.amount),
            totals.docStamp > 0 ? formatMoney(totals.docStamp) : '',
        ]);
    }

    const lines = [
        ['Barangay Tibanga - Report of Collection and Deposits'],
        ['Period', periodLabel],
        ['Barangay Treasurer', treasurerName || ''],
        [],
        ['Date', 'Source', 'OR No.', 'Payor', 'Collection', 'Amount', 'Doc Stamp'],
        ...dataRows,
    ];
    return lines.map((row) => row.map(escapeCell).join(',')).join('\n');
}
