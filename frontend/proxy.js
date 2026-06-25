import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'mytibangaportal-secret-key-change-in-production'
);

// Routes that require any authenticated user
const PROTECTED_ROUTES = [
    '/document-request',
    '/payment',
    '/payment-summary',
    '/profile',
    '/track-request',
];

// Routes that require admin role
const ADMIN_ROUTES = [
    '/admin-dashboard',
    '/resident-records',
    '/document-management',
    '/request-history',
    '/reports',
    '/system-settings',
    '/edit-homepage',
];

export async function proxy(request) {
    const { pathname } = request.nextUrl;

    const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
    const isAdmin = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

    if (!isProtected && !isAdmin) return NextResponse.next();

    // Check for session cookie
    const token = request.cookies.get('session')?.value;
    if (!token) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Verify the token
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);

        // Admin routes require admin role
        if (isAdmin && payload.role !== 'admin') {
            return NextResponse.redirect(new URL('/', request.url));
        }

        // Residents with a temporary password must change it before using the portal
        if (
            payload.role === 'resident' &&
            payload.mustChangePassword === true &&
            pathname !== '/profile' &&
            !pathname.startsWith('/profile/')
        ) {
            const dest = new URL('/profile?mustChangePassword=1', request.url);
            return NextResponse.redirect(dest);
        }

        return NextResponse.next();
    } catch {
        return NextResponse.redirect(new URL('/login', request.url));
    }
}

export const config = {
    matcher: [
        '/document-request/:path*',
        '/payment/:path*',
        '/payment-summary/:path*',
        '/profile',
        '/track-request',
        '/admin-dashboard/:path*',
        '/resident-records/:path*',
        '/document-management/:path*',
        '/request-history/:path*',
        '/reports/:path*',
        '/system-settings/:path*',
        '/edit-homepage',
    ],
};
