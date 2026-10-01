'use client';

import { useEffect, useState } from 'react';
import { Users, MessageCircle, ShoppingCart, TrendingUp, CalendarCheck, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import Link from 'next/link';
import type { Conversation, Reservation, FunnelStage } from '@/lib/types/database';

type DashStats = {
    total_contacts: number;
    active_conversations: number;
    orders_today: number;
    revenue_month: number;
    reservations_today: number;
};

type FunnelBar = { stage: FunnelStage; count: number };

type OrderRow = {
    id: string;
    status: string;
    total: number;
    created_at: string;
    contact: { id: string; nombre: string } | null;
};

function StatCard({ label, value, icon: Icon, color, bg }: { label: string; value: number | string; icon: React.ElementType; color: string; bg: string }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
                <Icon size={22} style={{ color }} />
            </div>
            <div>
                <p className="text-[26px] font-bold text-[#1A1A2E]">{value}</p>
                <p className="text-[12px] text-[#9CA3AF]">{label}</p>
            </div>
        </div>
    );
}

function formatMXN(amount: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(amount);
}

function ReservationStatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        pending: 'bg-[#FFFBEB] text-[#D97706]',
        confirmed: 'bg-[#ECFDF5] text-[#059669]',
        seated: 'bg-[#EEF0FF] text-[#4F46E5]',
        completed: 'bg-[#F3F4F6] text-[#6B7280]',
        cancelled: 'bg-[#FEF2F2] text-[#DC2626]',
        no_show: 'bg-[#FEF2F2] text-[#DC2626]',
    };
    const labels: Record<string, string> = { pending: 'Pendiente', confirmed: 'Confirmada', seated: 'Sentado', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió' };
    return (
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${map[status] ?? map.pending}`}>
            {labels[status] ?? status}
        </span>
    );
}

const ORDER_STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'Preparando',
    ready: 'Listo', delivered: 'Entregado', completed: 'Completado',
    cancelled: 'Cancelado', refunded: 'Reembolsado',
};

const ORDER_STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700', confirmed: 'bg-blue-50 text-blue-700',
    preparing: 'bg-orange-50 text-orange-700', ready: 'bg-green-50 text-green-700',
    delivered: 'bg-indigo-50 text-indigo-700', completed: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-red-50 text-red-600', refunded: 'bg-gray-100 text-gray-500',
};

export default function DashboardClient({
    plan = 'professional',
    businessType = 'general',
}: {
    plan?: 'starter' | 'professional' | 'enterprise';
    businessType?: 'general' | 'restaurant';
}) {
    const isRestaurant = businessType === 'restaurant';
    const [stats, setStats] = useState<DashStats>({ total_contacts: 0, active_conversations: 0, orders_today: 0, revenue_month: 0, reservations_today: 0 });
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [funnelBars, setFunnelBars] = useState<FunnelBar[]>([]);
    const [tenantName, setTenantName] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        const fetches: Promise<unknown>[] = [
            fetch('/api/settings/general').then((r) => r.json()),
            fetch('/api/contacts/count').then((r) => r.json()),
            fetch('/api/conversations?status=open').then((r) => r.json()),
            fetch('/api/orders?page=1').then((r) => r.json()),
            fetch('/api/orders/stats').then((r) => r.json()),
            fetch('/api/funnel-stages').then((r) => r.json()),
            isRestaurant ? fetch(`/api/reservations?date=${today}`).then((r) => r.json()) : Promise.resolve([]),
        ];

        Promise.all(fetches).then(async ([tenantData, contactsData, convsData, ordersData, orderStatsData, stagesData, resData]) => {
            setTenantName((tenantData as { tenant?: { name?: string } }).tenant?.name ?? 'tu negocio');

            const totalContacts = (contactsData as { count?: number }).count ?? 0;

            const convs: Conversation[] = Array.isArray(convsData) ? convsData : ((convsData as { conversations?: Conversation[] }).conversations ?? []);
            setConversations(convs.slice(0, 5));

            const ordersResponse = ordersData as { orders?: OrderRow[] };
            setRecentOrders((ordersResponse.orders ?? []).slice(0, 5));

            const orderStats = orderStatsData as { orders_today?: number; revenue_month?: number; total_revenue?: number };

            const todayRes: Reservation[] = Array.isArray(resData) ? resData as Reservation[] : ((resData as { reservations?: Reservation[] }).reservations ?? []);
            if (isRestaurant) setReservations(todayRes);

            setStats({
                total_contacts: totalContacts,
                active_conversations: convs.length,
                orders_today: orderStats.orders_today ?? 0,
                revenue_month: orderStats.total_revenue ?? 0,
                reservations_today: todayRes.length,
            });

            // Funnel bars
            const stages: FunnelStage[] = Array.isArray(stagesData) ? stagesData as FunnelStage[] : ((stagesData as { stages?: FunnelStage[] }).stages ?? []);
            if (stages.length > 0) {
                const barsPromises = stages.map((s) =>
                    fetch(`/api/contacts/count?funnel_stage_id=${s.id}`).then((r) => r.json()).then((d) => ({ stage: s, count: (d as { count?: number }).count ?? 0 }))
                );
                const bars = await Promise.all(barsPromises);
                setFunnelBars(bars.filter((b) => b.count > 0));
            }
        }).finally(() => setLoading(false));
    }, [isRestaurant]);

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    const maxFunnelCount = Math.max(...funnelBars.map((b) => b.count), 1);

    return (
        <>
            <Breadcrumb />
            <PageHeader
                title={`${greeting}, ${tenantName || '…'}`}
                description="Aquí tienes un resumen de tu negocio"
            />

            {/* Stats */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${isRestaurant ? 'xl:grid-cols-5' : 'xl:grid-cols-4'} gap-5 mb-6`}>
                <StatCard label="Contactos totales" value={loading ? '—' : stats.total_contacts.toLocaleString()} icon={Users} color="#818CF8" bg="#EEF0FF" />
                <StatCard label="Conversaciones abiertas" value={loading ? '—' : stats.active_conversations} icon={MessageCircle} color="#34D399" bg="#ECFDF5" />
                <StatCard label="Pedidos hoy" value={loading ? '—' : stats.orders_today} icon={ShoppingCart} color="#F59E0B" bg="#FFFBEB" />
                <StatCard label="Ingresos total" value={loading ? '—' : formatMXN(stats.revenue_month)} icon={TrendingUp} color="#10B981" bg="#ECFDF5" />
                {isRestaurant && <StatCard label="Reservas hoy" value={loading ? '—' : stats.reservations_today} icon={CalendarCheck} color="#F9A8D4" bg="#FDF2F8" />}
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-3 mb-6">
                <Link href="/orders">
                    <Button className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white">
                        <Plus size={16} /> Nuevo Pedido
                    </Button>
                </Link>
                <Link href="/conversations">
                    <Button variant="outline" className="gap-2 rounded-xl border-[#E8E8EC] text-[#6B7280]">
                        <MessageCircle size={16} /> Ver Conversaciones
                    </Button>
                </Link>
                <Link href="/contacts">
                    <Button variant="outline" className="gap-2 rounded-xl border-[#E8E8EC] text-[#6B7280]">
                        <Users size={16} /> Ver Contactos
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                {/* Recent conversations */}
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]">
                        <h2 className="text-[15px] font-semibold text-[#1A1A2E]">Conversaciones recientes</h2>
                        <Link href="/conversations" className="text-[12px] text-[#818CF8] hover:underline flex items-center gap-1">
                            Ver todas <ArrowRight size={12} />
                        </Link>
                    </div>
                    {loading ? (
                        <div className="p-8 text-center text-[#9CA3AF] text-[13px]">Cargando…</div>
                    ) : conversations.length === 0 ? (
                        <div className="p-8 text-center text-[#9CA3AF] text-[13px]">No hay conversaciones abiertas.</div>
                    ) : (
                        <ul>
                            {conversations.map((c) => (
                                <li key={c.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE] transition-colors">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center flex-shrink-0">
                                        <span className="text-white text-[11px] font-semibold">
                                            {c.contact ? (c.contact as { nombre: string }).nombre.slice(0, 2).toUpperCase() : '?'}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] font-medium text-[#1A1A2E] truncate">
                                            {c.contact ? (c.contact as { nombre: string }).nombre : 'Sin nombre'}
                                        </p>
                                        <p className="text-[12px] text-[#9CA3AF]">{c.channel} · {c.status}</p>
                                    </div>
                                    {c.unread_count > 0 && (
                                        <span className="bg-[#818CF8] text-white text-[11px] font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                                            {c.unread_count}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Recent orders */}
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]">
                        <h2 className="text-[15px] font-semibold text-[#1A1A2E]">Pedidos recientes</h2>
                        <Link href="/orders" className="text-[12px] text-[#818CF8] hover:underline flex items-center gap-1">
                            Ver todos <ArrowRight size={12} />
                        </Link>
                    </div>
                    {loading ? (
                        <div className="p-8 text-center text-[#9CA3AF] text-[13px]">Cargando…</div>
                    ) : recentOrders.length === 0 ? (
                        <div className="p-8 text-center text-[#9CA3AF] text-[13px]">No hay pedidos aún.</div>
                    ) : (
                        <ul>
                            {recentOrders.map((o) => (
                                <Link key={o.id} href={`/orders/${o.id}`}>
                                    <li className="flex items-center gap-4 px-5 py-3.5 border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE] transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[14px] font-medium text-[#1A1A2E] truncate">
                                                {o.contact?.nombre ?? 'Sin cliente'}
                                            </p>
                                            <p className="text-[12px] text-[#9CA3AF]">
                                                #{o.id.slice(-8).toUpperCase()}
                                            </p>
                                        </div>
                                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ORDER_STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                            {ORDER_STATUS_LABELS[o.status] ?? o.status}
                                        </span>
                                        <span className="text-[14px] font-bold text-[#1A1A2E] flex-shrink-0">
                                            {formatMXN(o.total)}
                                        </span>
                                    </li>
                                </Link>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Restaurant: Today's reservations */}
            {isRestaurant && (
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden mb-5">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]">
                        <h2 className="text-[15px] font-semibold text-[#1A1A2E]">Reservas de hoy</h2>
                        <Link href="/reservations" className="text-[12px] text-[#818CF8] hover:underline flex items-center gap-1">
                            Ver todas <ArrowRight size={12} />
                        </Link>
                    </div>
                    {loading ? (
                        <div className="p-8 text-center text-[#9CA3AF] text-[13px]">Cargando…</div>
                    ) : reservations.length === 0 ? (
                        <div className="p-8 text-center text-[#9CA3AF] text-[13px]">No hay reservas programadas para hoy.</div>
                    ) : (
                        <ul>
                            {reservations.slice(0, 5).map((r) => (
                                <li key={r.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE] transition-colors">
                                    <div className="text-center flex-shrink-0 w-10">
                                        <p className="text-[15px] font-bold text-[#1A1A2E]">{r.reservation_time.slice(0, 5)}</p>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] font-medium text-[#1A1A2E] truncate">{r.guest_name}</p>
                                        <p className="text-[12px] text-[#9CA3AF]">{r.party_size} personas{r.occasion ? ` · ${r.occasion}` : ''}</p>
                                    </div>
                                    <ReservationStatusBadge status={r.status} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Funnel distribution */}
            {funnelBars.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                    <h2 className="text-[15px] font-semibold text-[#1A1A2E] mb-5">Distribución del Funnel</h2>
                    <div className="space-y-3">
                        {funnelBars.map(({ stage, count }) => (
                            <div key={stage.id} className="flex items-center gap-4">
                                <p className="text-[13px] text-[#6B7280] w-32 flex-shrink-0 truncate">{stage.name}</p>
                                <div className="flex-1 h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${(count / maxFunnelCount) * 100}%`,
                                            backgroundColor: stage.color ?? '#818CF8',
                                        }}
                                    />
                                </div>
                                <p className="text-[13px] font-semibold text-[#1A1A2E] w-8 text-right flex-shrink-0">{count}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
