/**
 * Pure helpers for matching document names to fees from settings.documentFees.
 * Safe to import from client or server (no DB).
 */

/** Map old UI/catalog labels → names stored in admin Document & Fees config */
const LEGACY_ALIASES = {
    'Certificate of Indigency': 'Barangay Certificate of Indigency',
    'Barangay Certificate for Solo Parent': 'Barangay Certificate for Solo Parents',
    'Certificate of Residency': 'Barangay Certificate of Residency',
};

/**
 * @param {{ name: string, fee: number }[]} documentFees
 * @param {string} name - document display name from cart
 * @param {number} fallback - when no row matches (default 50, previous hardcoded default)
 */
export function resolveUnitPrice(documentFees, name, fallback = 50) {
    if (!name || !Array.isArray(documentFees) || documentFees.length === 0) {
        return fallback;
    }

    const tryNames = [name, LEGACY_ALIASES[name]].filter(Boolean);
    for (const candidate of tryNames) {
        const row = documentFees.find((f) => f.name === candidate);
        if (row != null && row.fee != null && !Number.isNaN(Number(row.fee))) {
            return Number(row.fee);
        }
    }

    const lower = String(name).trim().toLowerCase();
    const ci = documentFees.find((f) => (f.name || '').trim().toLowerCase() === lower);
    if (ci != null && ci.fee != null && !Number.isNaN(Number(ci.fee))) {
        return Number(ci.fee);
    }

    return fallback;
}

/**
 * @param {{ name: string, fee: number }[]} documentFees
 * @param {Array<{ name: string, quantity?: number, qty?: number }>} documents
 */
export function priceLineItems(documentFees, documents, fallback = 50) {
    return documents.map((doc) => {
        const docName = typeof doc === 'string' ? doc : doc.name;
        const qty = typeof doc === 'string' ? 1 : doc.quantity || doc.qty || 1;
        const unitPrice = resolveUnitPrice(documentFees, docName, fallback);
        return {
            name: docName,
            qty,
            quantity: qty,
            unitPrice,
            total: unitPrice * qty,
        };
    });
}
