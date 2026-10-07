'use client';

import { useEffect, useState } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from 'recharts';
import { toast } from 'sonner';
import { useBusinessType, useHasModule } from '@/components/providers/tenant-provider';
import type { Reservation, Conversation, FunnelStage } from '@/lib/types/database';

type DateRange = '7d' | '30d' | '90d';

const RANGE_LABELS: Record<DateRange, string> = {
    '7d': 'Últimos 7 días',
    '30d': 'Últimos 30 días',
    '90d': 'Últimos 90 días',
};

const COLORS = ['#818CF8', '#34D399', '#F9A8D4', '#FBBF24', '#F87171', '#60A5FA', '#A78BFA'];

const OCCASION_LABELS: Record<string, string> = {
    birthday: 'Cumpleaños',
    anniversary: 'Aniversario',
    business: 'Negocios',
    date: 'Cita',
    family: 'Familia',
    other: 'Otro',
};

const CONV_STATUS_LABELS: Record<string, string> = {
    open: 'Abiertas',
    resolved: 'Resueltas',
    pending: 'Pendientes',
    snoozed: 'Pospuestas',
};

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5">
            <p className="text-[28px] font-bold text-[#1A1A2E]">{value}</p>
            <p className="text-[12px] text-[#9CA3AF] mt-1">{label}</p>
            {sub && <p className="text-[11px] text-[#9CA3AF] mt-0.5">{sub}</p>}
            <div className="w-8 h-1 rounded-full mt-2" style={{ backgroundColor: color }} />
        </div>
    );
}

function getDaysBack(range: DateRange): number {
    return parseInt(range.replace('d', ''), 10);
}

function getDateRange(range: DateRange): { from: string; to: string } {
    const to = new Date();
    const from = new Date(Date.now() - getDaysBack(range) * 86400000);
    return {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
    };
}

type DayPoint = { day: string; date: string; count: number; revenue: number };

/** One point per day of the range; `values` maps YYYY-MM-DD → count/revenue. */
function seriesByDay(values: Record<string, { count: number; revenue?: number }>, days: number): DayPoint[] {
    const points: DayPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const day = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
        points.push({
            day,
            date: new Date(day + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
            count: values[day]?.count ?? 0,
            revenue: values[day]?.revenue ?? 0,
        });
    }
    return points;
}

type OrderPeriod = { orders: number; revenue: number; by_day: { date: string; count: number; revenue: number }[] };

const ORDER_STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'En preparación', ready: 'Listo',
    delivered: 'Entregado', completed: 'Completado', cancelled: 'Cancelado', refunded: 'Reembolsado',
};

function formatMoney(amount: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
    const csv = rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    // BOM so Excel opens accents correctly
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export default function ReportsPage() {
    const hasReservations = useHasModule('reservations');
    const hasOrders = useHasModule('orders');
    const isRestaurant = useBusinessType() === 'restaurant';
    const [range, setRange] = useState<DateRange>('30d');
    const [orderPeriod, setOrderPeriod] = useState<OrderPeriod | null>(null);
    const [ordersByStatus, setOrdersByStatus] = useState<Record<string, number>>({});
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [stages, setStages] = useState<FunnelStage[]>([]);
    const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
    const [contactCount, setContactCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const { from } = getDateRange(range);

        Promise.all([
            hasReservations ? fetch(`/api/reservations`).then((r) => r.json()) : Promise.resolve([]),
            fetch('/api/conversations').then((r) => r.json()),
            fetch('/api/contacts/count').then((r) => r.json()),
            fetch('/api/funnel-stages').then((r) => r.json()),
            hasOrders ? fetch(`/api/orders/stats?from=${from}`).then((r) => r.json()) : Promise.resolve(null),
        ]).then(async ([resData, convsData, contactsData, stagesData, orderStats]) => {
            setOrderPeriod(orderStats?.period ?? null);
            setOrdersByStatus(orderStats?.orders_by_status ?? {});
            // Filter reservations to the selected date range client-side
            const allRes: Reservation[] = Array.isArray(resData) ? resData : [];
            const res: Reservation[] = allRes.filter((r) => r.reservation_date >= from);
            const convs: Conversation[] = Array.isArray(convsData) ? convsData : [];
            const stgs: FunnelStage[] = Array.isArray(stagesData) ? stagesData : [];

            setReservations(res);
            setConversations(convs);
            setContactCount(contactsData.count ?? 0);
            setStages(stgs);

            // Count contacts per stage
            const counts: Record<string, number> = {};
            await Promise.all(
                stgs.map((s) =>
                    fetch(`/api/contacts/count?funnel_stage_id=${s.id}`)
                        .then((r) => r.json())
                        .then((d) => { counts[s.id] = d.count ?? 0; })
                )
            );
            setStageCounts(counts);
        }).finally(() => setLoading(false));
    }, [range, hasReservations, hasOrders]);

    // Chart data
    const days = getDaysBack(range);
    const reservationsByDay = seriesByDay(
        reservations.reduce<Record<string, { count: number }>>((acc, r) => {
            acc[r.reservation_date] = { count: (acc[r.reservation_date]?.count ?? 0) + 1 };
            return acc;
        }, {}),
        days
    );
    const ordersByDay = seriesByDay(
        Object.fromEntries((orderPeriod?.by_day ?? []).map((d) => [d.date, d])),
        days
    );
    const orderStatusData = Object.entries(ordersByStatus)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({ name: ORDER_STATUS_LABELS[status] ?? status, value: count }));

    // Conversation status distribution
    const convByStatus = Object.entries(
        conversations.reduce<Record<string, number>>((acc, c) => {
            acc[c.status] = (acc[c.status] ?? 0) + 1;
            return acc;
        }, {})
    ).map(([status, count]) => ({ name: CONV_STATUS_LABELS[status] ?? status, value: count }));

    // Funnel stage distribution
    const funnelData = stages
        .map((s) => ({ name: s.name, count: stageCounts[s.id] ?? 0, color: s.color ?? '#818CF8' }))
        .filter((s) => s.count > 0)
        .sort((a, b) => b.count - a.count);

    // Occasion distribution
    const occasionCounts = reservations.reduce<Record<string, number>>((acc, r) => {
        if (r.occasion) acc[r.occasion] = (acc[r.occasion] ?? 0) + 1;
        return acc;
    }, {});
    const occasionData = Object.entries(occasionCounts)
        .map(([occ, count]) => ({ name: OCCASION_LABELS[occ] ?? occ, value: count }));

    // Metrics
    const totalReservations = reservations.length;
    const confirmedReservations = reservations.filter((r) => r.status === 'confirmed' || r.status === 'completed').length;
    const openConvs = conversations.filter((c) => c.status === 'open').length;
    const resolvedConvs = conversations.filter((c) => c.status === 'resolved').length;
    const responseRate = (openConvs + resolvedConvs) > 0 ? Math.round((resolvedConvs / (openConvs + resolvedConvs)) * 100) : 0;

    const maxFunnelCount = Math.max(...funnelData.map((f) => f.count), 1);

    function exportCsv() {
        const rows: (string | number)[][] = [
            ['Reporte', RANGE_LABELS[range]],
            [],
            ['Métrica', 'Valor'],
            ['Contactos totales', contactCount],
            ['Conversaciones abiertas', openConvs],
            ['Conversaciones resueltas', resolvedConvs],
            ['Tasa de resolución (%)', responseRate],
        ];
        if (hasReservations) rows.push(['Reservas en período', totalReservations], ['Reservas confirmadas', confirmedReservations]);
        if (hasOrders) rows.push(['Pedidos en período', orderPeriod?.orders ?? 0], ['Ventas en período', orderPeriod?.revenue ?? 0]);
        rows.push([], ['Etapa del funnel', 'Contactos'], ...funnelData.map((f) => [f.name, f.count]));

        const header = ['Fecha'];
        if (hasReservations) header.push('Reservas');
        if (hasOrders) header.push('Pedidos', 'Ventas');
        rows.push([], header);
        for (let i = 0; i < reservationsByDay.length; i++) {
            const row: (string | number)[] = [reservationsByDay[i].day];
            if (hasReservations) row.push(reservationsByDay[i].count);
            if (hasOrders) row.push(ordersByDay[i].count, ordersByDay[i].revenue);
            rows.push(row);
        }
        downloadCsv(`reporte-${range}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
        toast.success('Reporte exportado');
    }

    return (
        <>
            <Breadcrumb />
            <PageHeader title="Reportes" description={`Analítica y métricas de tu ${isRestaurant ? 'restaurante' : 'negocio'}`}>
                <div className="flex items-center gap-2">
                    {(Object.keys(RANGE_LABELS) as DateRange[]).map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${range === r ? 'bg-[#818CF8] text-white' : 'bg-white border border-[#E8E8EC] text-[#6B7280] hover:border-[#818CF8]/40'}`}
                        >
                            {RANGE_LABELS[r]}
                        </button>
                    ))}
                </div>
                <Button
                    variant="outline"
                    onClick={exportCsv}
                    disabled={loading}
                    className="gap-2 rounded-xl border-[#E8E8EC] text-[#6B7280]"
                >
                    <Download size={15} /> Exportar CSV
                </Button>
            </PageHeader>

            {/* Metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {hasReservations && (
                    <MetricCard label="Reservas en período" value={loading ? '—' : totalReservations} sub={`${confirmedReservations} confirmadas`} color="#818CF8" />
                )}
                {hasOrders && !hasReservations && (
                    <MetricCard
                        label="Ventas en período"
                        value={loading ? '—' : formatMoney(orderPeriod?.revenue ?? 0)}
                        sub={`${orderPeriod?.orders ?? 0} pedidos`}
                        color="#818CF8"
                    />
                )}
                <MetricCard label="Contactos totales" value={loading ? '—' : contactCount.toLocaleString()} color="#34D399" />
                <MetricCard label="Conversaciones abiertas" value={loading ? '—' : openConvs} color="#F9A8D4" />
                <MetricCard label="Tasa de resolución" value={loading ? '—' : `${responseRate}%`} sub={`${resolvedConvs} resueltas`} color="#A78BFA" />
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                {/* Reservas (o pedidos) por día */}
                {(hasReservations || hasOrders) && <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-4">{hasReservations ? 'Reservas por día' : 'Pedidos por día'}</h3>
                    {loading ? (
                        <div className="h-[240px] flex items-center justify-center text-[#9CA3AF] text-[13px]">Cargando…</div>
                    ) : (
                        <div className="h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={hasReservations ? reservationsByDay : ordersByDay} barSize={8}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                                        interval={Math.floor(reservationsByDay.length / 6)} />
                                    <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E8E8EC', borderRadius: '12px', fontSize: '12px' }} />
                                    <Bar dataKey="count" fill="#818CF8" radius={[4, 4, 0, 0]} name={hasReservations ? 'Reservas' : 'Pedidos'} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>}

                {/* Conversaciones por estado */}
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-4">Conversaciones por estado</h3>
                    {loading || convByStatus.length === 0 ? (
                        <div className="h-[240px] flex items-center justify-center text-[#9CA3AF] text-[13px]">
                            {loading ? 'Cargando…' : 'Sin datos de conversaciones'}
                        </div>
                    ) : (
                        <div className="h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={convByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                                        {convByStatus.map((_, i) => (
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E8E8EC', borderRadius: '12px', fontSize: '12px' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Contactos por etapa del funnel (horizontal bar) */}
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-4">Contactos por etapa del funnel</h3>
                    {loading ? (
                        <div className="h-[200px] flex items-center justify-center text-[#9CA3AF] text-[13px]">Cargando…</div>
                    ) : funnelData.length === 0 ? (
                        <div className="h-[200px] flex items-center justify-center text-[#9CA3AF] text-[13px]">Sin contactos con etapa asignada</div>
                    ) : (
                        <div className="space-y-3">
                            {funnelData.map(({ name, count, color }) => (
                                <div key={name} className="flex items-center gap-3">
                                    <span className="text-[12px] text-[#6B7280] w-28 flex-shrink-0 truncate">{name}</span>
                                    <div className="flex-1 h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${(count / maxFunnelCount) * 100}%`, backgroundColor: color }} />
                                    </div>
                                    <span className="text-[13px] font-semibold text-[#1A1A2E] w-8 text-right flex-shrink-0">{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top ocasiones de reserva (o pedidos por estado) */}
                {(hasReservations || hasOrders) && <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-4">
                        {hasReservations ? 'Top ocasiones de reserva' : 'Pedidos por estado'}
                    </h3>
                    {loading ? (
                        <div className="h-[200px] flex items-center justify-center text-[#9CA3AF] text-[13px]">Cargando…</div>
                    ) : (hasReservations ? occasionData : orderStatusData).length === 0 ? (
                        <div className="h-[200px] flex items-center justify-center text-[#9CA3AF] text-[13px]">
                            {hasReservations ? 'Sin datos de ocasiones' : 'Sin pedidos'}
                        </div>
                    ) : (
                        <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={hasReservations ? occasionData : orderStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                                        {(hasReservations ? occasionData : orderStatusData).map((_, i) => (
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E8E8EC', borderRadius: '12px', fontSize: '12px' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>}
            </div>
        </>
    );
}
