import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { buildNamedStorageKey, resolveAssetUrl, uploadStorageObject } from '@/lib/supabaseStorage';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export async function POST(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'QR image is required.' }, { status: 400 });
        }
        if (!String(file.type || '').startsWith('image/')) {
            return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
        }
        if (Number(file.size || 0) > MAX_SIZE_BYTES) {
            return NextResponse.json({ error: 'Image too large (max 5MB).' }, { status: 400 });
        }

        const objectKey = buildNamedStorageKey('images', 'gcash-qr', file.name || 'gcash-qr.png', Date.now());
        await uploadStorageObject(objectKey, file, { upsert: true });
        const previewUrl = await resolveAssetUrl(objectKey);

        return NextResponse.json({
            success: true,
            qrImageKey: objectKey,
            qrImageUrl: previewUrl,
        });
    } catch {
        return NextResponse.json({ error: 'Failed to upload QR image.' }, { status: 500 });
    }
}
