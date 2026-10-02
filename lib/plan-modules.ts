import type { PlanModule } from '@/lib/types/database';

/**
 * Which plan module each dashboard route belongs to. Routes not listed
 * (dashboard, contacts, settings…) are available on every plan.
 * Order matters: the first matching prefix wins.
 */
export const ROUTE_MODULES: { prefix: string; module: PlanModule }[] = [
    { prefix: '/conversations', module: 'chat' },
    { prefix: '/settings/templates', module: 'chat' },
    { prefix: '/campaigns', module: 'campaigns' },
    { prefix: '/orders', module: 'orders' },
    { prefix: '/settings/products', module: 'orders' },
    { prefix: '/reservations', module: 'reservations' },
    { prefix: '/settings/restaurant', module: 'restaurant' },
    { prefix: '/reports', module: 'reports' },
    { prefix: '/funnel', module: 'funnel' },
];

export function moduleForPath(pathname: string): PlanModule | null {
    const match = ROUTE_MODULES.find(
        (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
    );
    return match?.module ?? null;
}
