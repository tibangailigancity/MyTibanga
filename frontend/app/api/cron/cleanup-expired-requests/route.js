import { NextResponse } from 'next/server';
import { purgeExpiredPendingRequests } from '@/lib/requestExpiry';

/**
 * Vercel Cron endpoint.
 * Marks pending requests older than N days as expired.
 */
export async function GET(request) {
    const expected = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization') || '';

    if (!expected) {
        return NextResponse.json(
            { error: 'CRON_SECRET is not configured on this environment' },
            { status: 500 }
        );
    }

    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const expiredCount = await purgeExpiredPendingRequests();
        return NextResponse.json({
            success: true,
            expiredCount,
            retentionDays: 3,
            ranAt: new Date().toISOString(),
        });
    } catch (err) {
        return NextResponse.json(
            { success: false, error: err.message || 'Cleanup failed' },
            { status: 500 }
        );
    }
}
