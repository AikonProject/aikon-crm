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
} from 'lucide-react';
import { UserButton, useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { useState } from 'react';

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
];

export function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user } = useUser();

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
                    {mainMenuItems.map((item) => {
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
                                        {item.badge && (
                                            <span className="ml-auto bg-[#1A1A2E] text-white text-[11px] font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                                                ·
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
                        {configMenuItems.map((item) => {
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
