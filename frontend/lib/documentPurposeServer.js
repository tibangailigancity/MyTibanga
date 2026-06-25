import 'server-only';
import { query } from '@/lib/db';

/** Same aliases as documentFeeResolve — request labels vs catalog names */
const LEGACY_ALIASES = {
    'certificate of indigency': 'barangay certificate of indigency',
    'barangay certificate for solo parent': 'barangay certificate for solo parents',
    'certificate of residency': 'barangay certificate of residency',
};

function normalizeName(name) {
    return String(name || '').trim().toLowerCase();
}

function expandNames(name) {
    const n = normalizeName(name);
    const out = new Set([n]);
    for (const [legacy, canonical] of Object.entries(LEGACY_ALIASES)) {
        if (n === legacy) out.add(canonical);
        if (n === canonical) out.add(legacy);
    }
    return out;
}

function namesMatch(a, b) {
    const setA = expandNames(a);
    for (const candidate of expandNames(b)) {
        if (setA.has(candidate)) return true;
    }
    return false;
}

/** Fallback when DB row missing (e.g. before migration). */
const FALLBACK_PURPOSE_PATTERNS = [/clearance/i, /indigency/i, /residency/i];

function fallbackRequiresPurpose(docName) {
    const n = String(docName || '');
    return FALLBACK_PURPOSE_PATTERNS.some((p) => p.test(n));
}

export async function loadPurposeCatalog() {
    const { rows } = await query(
        'SELECT name, requires_purpose FROM documents ORDER BY id DESC'
    );
    return rows.map((r) => ({
        name: r.name,
        requiresPurpose: r.requires_purpose === true,
    }));
}

export async function documentNameRequiresPurpose(docName) {
    const { rows } = await query('SELECT name, requires_purpose FROM documents');
    const match = rows.find((r) => namesMatch(r.name, docName));
    if (match) return match.requires_purpose === true;
    return fallbackRequiresPurpose(docName);
}

export async function cartRequiresPurposeFromDb(documents) {
    if (!Array.isArray(documents) || documents.length === 0) return false;
    const catalog = await loadPurposeCatalog();
    return documents.some((doc) => {
        const name = doc?.name || doc;
        const row = catalog.find((c) => namesMatch(c.name, name));
        if (row) return row.requiresPurpose;
        return fallbackRequiresPurpose(name);
    });
}
