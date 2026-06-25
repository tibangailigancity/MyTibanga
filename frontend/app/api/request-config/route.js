import { NextResponse } from 'next/server';
import { loadCommonPurposes, loadDocumentRequirementsMap } from '@/lib/documentRequirementsServer';

/** Public read-only config for document request flow. */
export async function GET() {
    try {
        const [documentRequirements, commonPurposes] = await Promise.all([
            loadDocumentRequirementsMap(),
            loadCommonPurposes(),
        ]);
        return NextResponse.json({ documentRequirements, commonPurposes });
    } catch (err) {
        console.error('[request-config GET]', err);
        const { DEFAULT_COMMON_PURPOSES, DEFAULT_DOCUMENT_REQUIREMENTS } = await import(
            '@/lib/documentRequirements'
        );
        return NextResponse.json({
            documentRequirements: DEFAULT_DOCUMENT_REQUIREMENTS,
            commonPurposes: DEFAULT_COMMON_PURPOSES,
        });
    }
}
