import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// App routes that should NOT be treated as public booking slugs
const APP_ROUTES = new Set([
    '/dashboard', '/contacts', '/conversations', '/funnel', '/campaigns',
    '/templates', '/reservations', '/settings', '/admin', '/reports',
    '/orders', '/products', '/pipeline', '/calendar', '/emails', '/messages', '/appointments',
]);

export default clerkMiddleware(async (_auth, _request) => {
    const path = _request.nextUrl.pathname;
    const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/api/public', '/api/webhooks'];

    // Check if path is a valid public booking slug: /{slug} where slug is lowercase alphanumeric + hyphens
    const isBookingSlug = /^\/[a-z0-9][a-z0-9-]*$/.test(path) && !APP_ROUTES.has(path);

    const isPublic =
        PUBLIC_PREFIXES.some((p) => path.startsWith(p)) || isBookingSlug;

    if (!isPublic) await _auth.protect();

    // Expose the pathname to server layouts (used for plan-module gating)
    const headers = new Headers(_request.headers);
    headers.set('x-pathname', path);
    return NextResponse.next({ request: { headers } });
});

export const config = {
    matcher: [
        // Excluir archivos estáticos de Next.js
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
        '/(api|trpc)(.*)',
        '/__clerk/:path*',
    ],
};
