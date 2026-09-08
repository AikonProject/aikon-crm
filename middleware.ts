import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware(async (_auth, _request) => {
    const path = _request.nextUrl.pathname;
    // Public: sign-in/up pages, public API (booking page), webhooks, and /{slug} (customer booking pages)
    const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/api/public', '/api/webhooks'];
    const isPublic =
        PUBLIC_PREFIXES.some((p) => path.startsWith(p)) ||
        /^\/[^/]+$/.test(path); // matches /{slug} — customer-facing booking pages
    if (!isPublic) await _auth.protect();
});

export const config = {
    matcher: [
        // Excluir archivos estáticos de Next.js
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
        '/(api|trpc)(.*)',
        '/__clerk/:path*',
    ],
};
