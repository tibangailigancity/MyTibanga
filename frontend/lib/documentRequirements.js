/**
 * Document requirements and common purposes for the request flow.
 * Admin overrides live in settings (documentRequirements, commonPurposes).
 */

/** Default requirements per document name (admin can override in System Settings). */
export const DEFAULT_DOCUMENT_REQUIREMENTS = {
    'Barangay Clearance': ['Valid ID', 'Purok Clearance', 'Community Tax Certificate (Cedula)'],
    'Barangay Certificate': ['Valid ID', 'Purok Clearance'],
    'Barangay Certificate of Residency': ['Valid ID', 'Proof of residence'],
    'Barangay Certificate of Indigency': ['Valid ID', 'Purok Clearance'],
    'Barangay Certificate for Solo Parents': ['Valid ID', 'Purok Clearance', 'Proof of solo parent status'],
    'Barangay Certificate for Motorized Banca': ['Valid ID', 'Boat registration documents'],
};

export const DEFAULT_COMMON_PURPOSES = [
    'Employment',
    'Scholarship',
    'Loan application',
    'Government transaction',
    'School enrollment',
    'Business permit',
];

const LEGACY_ALIASES = {
    'certificate of indigency': 'Barangay Certificate of Indigency',
    'barangay certificate for solo parent': 'Barangay Certificate for Solo Parents',
    'certificate of residency': 'Barangay Certificate of Residency',
};

/** Normalize document name for lookup (matches fee/catalog naming). */
export function normalizeDocumentName(name = '') {
    const raw = String(name).trim();
    const lowered = raw.toLowerCase();
    if (!raw) return '';

    const legacy = LEGACY_ALIASES[lowered];
    if (legacy) return legacy;

    if (/motorized\s*banca/.test(lowered)) return 'Barangay Certificate for Motorized Banca';
    if (/solo\s*parents?/.test(lowered)) return 'Barangay Certificate for Solo Parents';
    if (/indigency/.test(lowered)) return 'Barangay Certificate of Indigency';
    if (/residency/.test(lowered)) return 'Barangay Certificate of Residency';
    if (/clearance/.test(lowered)) return 'Barangay Clearance';
    if (/barangay\s*certificate/.test(lowered)) return 'Barangay Certificate';

    return raw;
}

function documentNames(documents) {
    if (!Array.isArray(documents)) return [];
    return documents
        .map((doc) => (typeof doc === 'string' ? doc : doc?.name))
        .filter(Boolean);
}

function lookupRequirementsList(docName, settingsMap = {}) {
    const key = normalizeDocumentName(docName);
    const candidates = [key, String(docName).trim(), loweredKey(docName)];
    for (const k of candidates) {
        const list = settingsMap[k];
        if (Array.isArray(list) && list.length > 0) {
            return list.filter(Boolean);
        }
    }
    return DEFAULT_DOCUMENT_REQUIREMENTS[key] || ['Valid ID', 'Purok Clearance'];
}

function loweredKey(docName) {
    return normalizeDocumentName(docName).toLowerCase();
}

/** Requirements for one certificate. */
export function getRequirementsForDocument(docName, settingsMap = {}) {
    return lookupRequirementsList(docName, settingsMap);
}

/** Unique requirements for multiple documents in a request. */
export function getRequirementsForDocuments(documents, settingsMap = {}) {
    const seen = new Set();
    const out = [];
    for (const name of documentNames(documents)) {
        for (const req of getRequirementsForDocument(name, settingsMap)) {
            if (!seen.has(req)) {
                seen.add(req);
                out.push(req);
            }
        }
    }
    return out;
}

/** Checklist items for admin approve / notify flows. */
export function buildRequirementChecklist(docNames, settingsMap = {}) {
    return getRequirementsForDocuments(docNames, settingsMap).map((label, i) => ({
        key: `req_${i}_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        label,
    }));
}

/** SMS body after a resident submits a document request. */
export function buildDocumentRequestSubmittedSms(requestNo, documents, settingsMap = {}) {
    const requirements = getRequirementsForDocuments(documents, settingsMap);
    let msg = `MyTibangaPortal: Your document request (${requestNo}) has been submitted.`;
    if (requirements.length > 0) {
        msg += ` Please prepare: ${requirements.join(', ')}.`;
    }
    msg += ' Go to Track Request on the portal and enter your request number to check your status.';
    return msg;
}
