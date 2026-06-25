import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
    try {
        const { rows } = await query("SELECT value FROM settings WHERE key = 'cameraLoginEnabled'");
        const raw = rows[0]?.value;
        const enabled = typeof raw === 'boolean' ? raw : true;
        return NextResponse.json({ cameraLoginEnabled: enabled });
    } catch {
        return NextResponse.json({ cameraLoginEnabled: true });
    }
}
