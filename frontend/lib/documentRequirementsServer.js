import { query } from '@/lib/db';
import {
    DEFAULT_COMMON_PURPOSES,
    DEFAULT_DOCUMENT_REQUIREMENTS,
} from '@/lib/documentRequirements';

export async function loadDocumentRequirementsMap() {
    const { rows } = await query("SELECT value FROM settings WHERE key = 'documentRequirements'");
    if (rows[0]?.value && typeof rows[0].value === 'object' && !Array.isArray(rows[0].value)) {
        return rows[0].value;
    }
    return DEFAULT_DOCUMENT_REQUIREMENTS;
}

export async function loadCommonPurposes() {
    const { rows } = await query("SELECT value FROM settings WHERE key = 'commonPurposes'");
    if (Array.isArray(rows[0]?.value) && rows[0].value.length > 0) {
        return rows[0].value.filter(Boolean);
    }
    return DEFAULT_COMMON_PURPOSES;
}
