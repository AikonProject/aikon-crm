'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    MessageCircle,
    Kanban,
    CalendarCheck,
    CalendarClock,
    Megaphone,
    BarChart3,
    Settings,
    FileText,
    Puzzle,
    ChevronLeft,
    Menu,
    UtensilsCrossed,
    ShieldCheck,
    ShoppingCart,
    Package,
    Bot,
} from 'lucide-react';
import { UserButton, useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useSidebar } from './sidebar-provider';
import { useSupabaseClient } from '@/lib/supabase/client';
import { useTenantId } from '@/components/providers/tenant-provider';
import { moduleForPath } from '@/lib/plan-modules';
import type { PlanModule } from '@/lib/types/database';

type MenuItem = { label: string; href: string; icon: React.ElementType; badge?: boolean; superAdminOnly?: boolean };

const menuItems: MenuItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Contactos', href: '/contacts', icon: Users },
    { label: 'Conversaciones', href: '/conversations', icon: MessageCircle, badge: true },
    { label: 'Funnel', href: '/funnel', icon: Kanban },
    { label: 'Productos', href: '/settings/products', icon: Package },
    { label: 'Ventas', href: '/orders', icon: ShoppingCart },
    { label: 'Plantillas', href: '/settings/templates', icon: FileText },
    { label: 'Campañas', href: '/campaigns', icon: Megaphone },
    { label: 'Reservas', href: '/reservations', icon: CalendarCheck },
    { label: 'Citas', href: '/appointments', icon: CalendarClock },
    { label: 'Reportes', href: '/reports', icon: BarChart3 },
    { label: 'Configuración', href: '/settings', icon: Settings },
    { label: 'Restaurante', href: '/settings/restaurant', icon: UtensilsCrossed },
    { label: 'Admin', href: '/admin', icon: ShieldCheck, superAdminOnly: true },
];

export function Sidebar({
    planName,
    modules,
    isSuperAdmin = false,
}: {
    planName: string;
    modules: PlanModule[];
    isSuperAdmin?: boolean;
}) {
    const pathname = usePathname();
    const { collapsed, setCollapsed } = useSidebar();

    const visibleItems = menuItems.filter((item) => {
        if (item.superAdminOnly) return isSuperAdmin;
        const required = moduleForPath(item.href);
        return !required || modules.includes(required);
    });
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user } = useUser();
    const tenantId = useTenantId();
    const [unreadCount, setUnreadCount] = useState(0);
    const supabase = useSupabaseClient();

    useEffect(() => {
        // Badge = number of chats with unread messages (same as the dots in the inbox)
        async function fetchUnread() {
            const { count, error } = await supabase
                .from('conversations')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gt('unread_count', 0);
            if (!error) setUnreadCount(count ?? 0);
        }
        fetchUnread();

        const channel = supabase
            .channel('sidebar-unread')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'conversations',
                filter: `tenant_id=eq.${tenantId}`,
            }, fetchUnread)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [supabase, tenantId]);

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

            {/* Menu */}
            <div className="flex-1 px-3 py-4 overflow-y-auto">
                <nav className="space-y-1">
                    {visibleItems.map((item) => {
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
            </div>

            {/* Plan badge */}
            <div className={`mx-3 mb-3 px-3 py-1.5 rounded-lg text-center ${!collapsed ? 'block' : 'hidden'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#EEF0FF] text-[#818CF8]">
                    {planName}
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
