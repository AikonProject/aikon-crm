'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    MessageCircle,
    Kanban,
    CalendarCheck,
    Megaphone,
    BarChart3,
    Settings,
    FileText,
    Puzzle,
    ChevronLeft,
    Menu,
    UtensilsCrossed,
    ShieldCheck,
} from 'lucide-react';
import { UserButton, useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useSidebar } from './sidebar-provider';
import { createClient } from '@/lib/supabase/client';

const mainMenuItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Contactos', href: '/contacts', icon: Users },
    { label: 'Conversaciones', href: '/conversations', icon: MessageCircle, badge: true },
    { label: 'Funnel', href: '/funnel', icon: Kanban },
    { label: 'Reservas', href: '/reservations', icon: CalendarCheck },
    { label: 'Campañas', href: '/campaigns', icon: Megaphone },
    { label: 'Reportes', href: '/reports', icon: BarChart3 },
];

const configMenuItems = [
    { label: 'Ajustes', href: '/settings', icon: Settings },
    { label: 'Restaurante', href: '/settings/restaurant', icon: UtensilsCrossed },
    { label: 'Plantillas', href: '/settings/templates', icon: FileText },
    { label: 'Integraciones', href: '/settings/integrations', icon: Puzzle },
    { label: 'Admin', href: '/admin', icon: ShieldCheck },
];

export function Sidebar({ plan = 'professional' }: { plan?: 'starter' | 'professional' | 'enterprise' }) {
    const pathname = usePathname();
    const { collapsed, setCollapsed } = useSidebar();

    const canAccess = (feature: string): boolean => {
        if (plan === 'professional' || plan === 'enterprise') return true;
        // starter: reservations, contacts, funnel, dashboard, reports
        //          settings + restaurant + integrations (reservation webhook only)
        //          NO: conversations, campaigns, templates
        const starterBlocked = ['/conversations', '/campaigns', '/settings/templates'];
        return !starterBlocked.some((p) => feature.startsWith(p));
    };

    const visibleMainItems = mainMenuItems.filter((item) => canAccess(item.href));
    const visibleConfigItems = configMenuItems.filter((item) => canAccess(item.href));
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user } = useUser();
    const [unreadCount, setUnreadCount] = useState(0);
    const supabase = createClient();

    useEffect(() => {
        async function fetchUnread() {
            const { data } = await supabase
                .from('conversations')
                .select('unread_count')
                .gt('unread_count', 0);
            const total = data?.reduce((sum, c) => sum + (c.unread_count ?? 0), 0) ?? 0;
            setUnreadCount(total);
        }
        fetchUnread();

        const channel = supabase
            .channel('sidebar-unread')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'conversations',
            }, fetchUnread)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [supabase]);

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard';
        return pathname.startsWith(href);
    };

    const sidebarContent = (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center gap-3 px-6 py-6 border-b border-[#E8E8EC]">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#818CF8] to-[#6366F1] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">Ai</span>
                </div>
                {!collapsed && (
                    <span className="font-bold text-[#1A1A2E] text-lg tracking-tight">
                        Aikon CRM
                    </span>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="ml-auto hidden lg:flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[#F3F4F6] transition-colors"
                >
                    <ChevronLeft
                        size={16}
                        className={cn(
                            'text-[#9CA3AF] transition-transform',
                            collapsed && 'rotate-180'
                        )}
                    />
                </button>
            </div>

            {/* Main Menu */}
            <div className="flex-1 px-3 py-4 overflow-y-auto">
                {!collapsed && (
                    <p className="crm-section-label px-3 mb-2">Menú principal</p>
                )}
                <nav className="space-y-1">
                    {visibleMainItems.map((item) => {
                        const active = isActive(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={cn(
                                    'flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm font-medium transition-all duration-150',
                                    active
                                        ? 'bg-[#F3F4FF] text-[#4F46E5] border-l-[3px] border-[#818CF8]'
                                        : 'text-[#6B7280] hover:bg-[#F9FAFB] border-l-[3px] border-transparent'
                                )}
                            >
                                <item.icon
                                    size={20}
                                    className={cn(
                                        'flex-shrink-0',
                                        active ? 'text-[#4F46E5]' : 'text-[#9CA3AF]'
                                    )}
                                />
                                {!collapsed && (
                                    <>
                                        <span>{item.label}</span>
                                        {item.badge && unreadCount > 0 && (
                                            <span className="ml-auto bg-[#EF4444] text-white text-[11px] font-semibold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">
                                                {unreadCount > 99 ? '99+' : unreadCount}
                                            </span>
                                        )}
                                    </>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Config Section */}
                <div className="mt-6">
                    {!collapsed && (
                        <p className="crm-section-label px-3 mb-2">Configuración</p>
                    )}
                    <nav className="space-y-1">
                        {visibleConfigItems.map((item) => {
                            const active = isActive(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm font-medium transition-all duration-150',
                                        active
                                            ? 'bg-[#F3F4FF] text-[#4F46E5] border-l-[3px] border-[#818CF8]'
                                            : 'text-[#6B7280] hover:bg-[#F9FAFB] border-l-[3px] border-transparent'
                                    )}
                                >
                                    <item.icon
                                        size={20}
                                        className={cn(
                                            'flex-shrink-0',
                                            active ? 'text-[#4F46E5]' : 'text-[#9CA3AF]'
                                        )}
                                    />
                                    {!collapsed && <span>{item.label}</span>}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Plan badge */}
            <div className={`mx-3 mb-3 px-3 py-1.5 rounded-lg text-center ${!collapsed ? 'block' : 'hidden'}`}>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    plan === 'enterprise' ? 'bg-amber-100 text-amber-700' :
                    plan === 'professional' ? 'bg-[#EEF0FF] text-[#818CF8]' :
                    'bg-[#F3F4F6] text-[#6B7280]'
                }`}>
                    {plan}
                </span>
            </div>

            {/* User section — Clerk */}
            <div className="border-t border-[#E8E8EC] px-4 py-4">
                <div className="flex items-center gap-3">
                    <UserButton
                        appearance={{
                            elements: {
                                avatarBox: 'w-9 h-9 rounded-full',
                            },
                        }}
                    />
                    {!collapsed && user && (
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#1A1A2E] truncate">
                                {user.fullName ?? user.primaryEmailAddress?.emailAddress}
                            </p>
                            <p className="text-xs text-[#9CA3AF] truncate">
                                {user.primaryEmailAddress?.emailAddress}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Mobile hamburger */}
            <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-xl bg-white border border-[#E8E8EC] flex items-center justify-center shadow-sm"
            >
                <Menu size={20} className="text-[#6B7280]" />
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/20 z-40"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar for mobile */}
            <aside
                className={cn(
                    'lg:hidden fixed top-0 left-0 h-full bg-white border-r border-[#E8E8EC] z-50 transition-transform duration-300',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full',
                    'w-[260px]'
                )}
            >
                {sidebarContent}
            </aside>

            {/* Sidebar for desktop */}
            <aside
                className={cn(
                    'hidden lg:block fixed top-0 left-0 h-full bg-white border-r border-[#E8E8EC] z-30 transition-all duration-300',
                    collapsed ? 'w-[72px]' : 'w-[260px]'
                )}
            >
                {sidebarContent}
            </aside>
        </>
    );
}
