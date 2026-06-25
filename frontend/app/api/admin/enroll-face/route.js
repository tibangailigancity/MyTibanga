import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { extractDescriptor } from '@/lib/faceRecognition';

async function isCameraLoginEnabled() {
    const { rows } = await query("SELECT value FROM settings WHERE key = 'cameraLoginEnabled'");
    const raw = rows[0]?.value;
    return typeof raw === 'boolean' ? raw : true;
}

export async function POST(request) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    try {
        const enabled = await isCameraLoginEnabled();
        if (!enabled) {
            return NextResponse.json(
                { success: false, error: 'Camera login is disabled by admin settings.' },
                { status: 403 }
            );
        }

        const { image } = await request.json();

        if (!image || typeof image !== 'string') {
            return NextResponse.json(
                { success: false, error: 'No image provided' },
                { status: 400 }
            );
        }

        // Extract face descriptor server-side
        const result = await extractDescriptor(image);
        if (result.error) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 400 }
            );
        }

        await query('UPDATE users SET face_descriptor = $1 WHERE id = $2', [
            JSON.stringify(result.descriptor),
            auth.session.id,
        ]);

        return NextResponse.json({ success: true, message: 'Face enrolled successfully' });
    } catch (error) {
        console.error('Enroll face error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to enroll face' },
            { status: 500 }
        );
    }
}

export async function DELETE() {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    try {
        await query('UPDATE users SET face_descriptor = NULL WHERE id = $1', [auth.session.id]);
        return NextResponse.json({ success: true, message: 'Face data removed' });
    } catch (error) {
        console.error('Remove face error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to remove face data' },
            { status: 500 }
        );
    }
}

export async function GET() {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    try {
        const cameraLoginEnabled = await isCameraLoginEnabled();
        const { rows } = await query(
            'SELECT face_descriptor IS NOT NULL AS enrolled FROM users WHERE id = $1',
            [auth.session.id]
        );
        return NextResponse.json({ enrolled: rows[0]?.enrolled || false, cameraLoginEnabled });
    } catch {
        return NextResponse.json({ enrolled: false, cameraLoginEnabled: true });
    }
}
