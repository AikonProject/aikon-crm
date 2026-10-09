'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
    dashboard: 'Dashboard',
    contacts: 'Contactos',
    pipeline: 'Pipeline',
    funnel: 'Funnel',
    calendar: 'Calendario',
    emails: 'Emails',
    messages: 'Mensajería',
    reports: 'Reportes',
    settings: 'Configuración',
    integrations: 'Integraciones',
    reservations: 'Reservas',
    appointments: 'Citas',
    orders: 'Ventas',
    restaurant: 'Restaurante',
    templates: 'Plantillas',
    campaigns: 'Campañas',
    new: 'Nueva',
    admin: 'Super Admin',
    conversations: 'Conversaciones',
    products: 'Productos',
    ai: 'IA / Bot',
};

export function Breadcrumb() {
    const pathname = usePathname();
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length <= 1) return null;

    return (
        <nav className="flex items-center gap-1.5 text-[13px] text-[#9CA3AF] mb-1">
            <Link
                href="/dashboard"
                className="hover:text-[#6B7280] transition-colors"
            >
                <Home size={14} />
            </Link>
            {segments.map((segment, index) => {
                const href = '/' + segments.slice(0, index + 1).join('/');
                const isLast = index === segments.length - 1;
                const label = ROUTE_LABELS[segment] || segment;

                return (
                    <div key={href} className="flex items-center gap-1.5">
                        <ChevronRight size={12} className="text-[#D1D5DB]" />
                        {isLast ? (
                            <span className="text-[#6B7280] font-medium">{label}</span>
                        ) : (
                            <Link
                                href={href}
                                className="hover:text-[#6B7280] transition-colors"
                            >
                                {label}
                            </Link>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
