'use client';

import { useSidebar } from './sidebar-provider';

export function MainContent({ children }: { children: React.ReactNode }) {
    const { collapsed } = useSidebar();
    return (
        <main className={`min-h-screen transition-all duration-300 ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'}`}>
            <div className="p-6 lg:p-8 pt-16 lg:pt-8">
                {children}
            </div>
        </main>
    );
}
