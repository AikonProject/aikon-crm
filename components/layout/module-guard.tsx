'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { moduleForPath } from '@/lib/plan-modules';
import type { PlanModule } from '@/lib/types/database';

/**
 * Client-side counterpart of the layout's plan check: layouts don't re-render
 * on client navigation, so this redirects away from routes outside the plan.
 */
export function ModuleGuard({ modules, children }: { modules: PlanModule[]; children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const required = moduleForPath(pathname);
    const allowed = !required || modules.includes(required);

    useEffect(() => {
        if (!allowed) router.replace('/dashboard');
    }, [allowed, router]);

    return allowed ? <>{children}</> : null;
}
