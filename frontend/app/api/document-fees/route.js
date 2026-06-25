import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/** Public read-only: fee list for payment UI (no auth). */
export async function GET() {
    try {
        const { rows } = await query("SELECT value FROM settings WHERE key = 'documentFees'");
        const documentFees = rows[0]?.value || [];
        return NextResponse.json({ documentFees: Array.isArray(documentFees) ? documentFees : [] });
    } catch {
        return NextResponse.json({ documentFees: [] });
    }
}
