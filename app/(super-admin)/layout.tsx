import Link from 'next/link';
import { ShieldCheck, LayoutDashboard } from 'lucide-react';
import { isSuperAdmin } from '@/lib/tenant';
import { redirect } from 'next/navigation';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    if (!(await isSuperAdmin())) redirect('/dashboard');

    return (
        <div className="min-h-screen bg-[#F8F8FA] flex">
            {/* Dark sidebar */}
            <aside className="w-[220px] min-h-screen bg-[#1A1A2E] flex flex-col fixed top-0 left-0 z-30">
                {/* Logo */}
                <div className="px-5 py-6 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#818CF8] to-[#6366F1] flex items-center justify-center">
                            <ShieldCheck size={16} className="text-white" />
                        </div>
                        <div>
                            <p className="text-white font-bold text-[14px] leading-tight">Super Admin</p>
                            <p className="text-white/40 text-[10px]">Aikon CRM</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-1">
                    <Link
                        href="/admin"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <LayoutDashboard size={17} />
                        Panel de Administración
                    </Link>
                </nav>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-white/10">
                    <p className="text-white/30 text-[11px]">AiKon Intelligence</p>
                    <Link href="/dashboard" className="text-[#818CF8] text-[11px] hover:underline">
                        ← Volver al CRM
                    </Link>
                </div>
            </aside>

            {/* Content */}
            <main className="ml-[220px] flex-1 p-8">
                {children}
            </main>
        </div>
    );
}
