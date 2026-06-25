/**
 * Purpose-line helpers (client-safe — no DB).
 * Residents always submit purpose on every request; requiresPurpose on a catalog item
 * only controls whether that purpose is printed on the certificate template.
 */

function normalizeName(name) {
    return String(name || '').trim().toLowerCase();
}

function namesMatch(a, b) {
    return normalizeName(a) === normalizeName(b);
}

function lineRequiresPurpose(doc, catalog) {
    if (doc?.requiresPurpose === true) return true;
    if (!catalog?.length) return false;
    const name = doc?.name || doc;
    const match = catalog.find((c) => namesMatch(c.name, name));
    return match?.requiresPurpose === true;
}

/** @param {Array<{ name?: string, requiresPurpose?: boolean }>} documents */
export function cartRequiresPurpose(documents, catalog = []) {
    if (!Array.isArray(documents) || documents.length === 0) return false;
    return documents.some((doc) => lineRequiresPurpose(doc, catalog));
}

export function purposeForDocumentPrint(requiresPurpose, purpose) {
    if (!requiresPurpose) return '';
    return String(purpose || '').trim();
}
