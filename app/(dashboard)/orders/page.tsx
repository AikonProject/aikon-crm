import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { OrdersPageClient } from '@/components/orders/orders-page-client';

const PAGE_SIZE = 20;

export type OrderWithRelations = {
    id: string;
    status: string;
    subtotal: number;
    discount: number;
    total: number;
    notes: string | null;
    source: string | null;
    created_at: string;
    updated_at: string;
    item_count: number;
    contact: { id: string; nombre: string; wa_id: string | null; email: string | null } | null;
};

export type OrderStats = {
    total_orders: number;
    total_revenue: number;
    average_ticket: number;
    orders_today: number;
    revenue_today: number;
    orders_by_status: Record<string, number>;
};

async function getPageData() {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

    const CANCELLED_STATUSES = ['cancelled', 'refunded'];

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [ordersRes, revenueRes, ordersTodayRes, revenueTodayRes, byStatusRes] = await Promise.all([
        supabase
            .from('orders')
            .select(
                `
                id, status, subtotal, discount, total, notes, source, created_at, updated_at,
                contact:contacts ( id, nombre, wa_id, email )
                `,
                { count: 'exact' }
            )
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false })
            .range(0, PAGE_SIZE - 1),

        supabase
            .from('orders')
            .select('total')
            .eq('tenant_id', TENANT_ID)
            .not('status', 'in', `(${CANCELLED_STATUSES.join(',')})`),

        supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', TENANT_ID)
            .gte('created_at', todayISO),

        supabase
            .from('orders')
            .select('total')
            .eq('tenant_id', TENANT_ID)
            .gte('created_at', todayISO)
            .not('status', 'in', `(${CANCELLED_STATUSES.join(',')})`),

        supabase
            .from('orders')
            .select('status')
            .eq('tenant_id', TENANT_ID),
    ]);

    // Fetch item counts for initial orders
    const orderIds = (ordersRes.data ?? []).map((o: { id: string }) => o.id);
    let itemCounts: Record<string, number> = {};

    if (orderIds.length > 0) {
        const { data: itemRows } = await supabase
            .from('order_items')
            .select('order_id')
            .in('order_id', orderIds);

        if (itemRows) {
            for (const row of itemRows as { order_id: string }[]) {
                itemCounts[row.order_id] = (itemCounts[row.order_id] ?? 0) + 1;
            }
        }
    }

    const orders: OrderWithRelations[] = (ordersRes.data ?? []).map((o: Record<string, unknown>) => ({
        ...(o as unknown as OrderWithRelations),
        item_count: itemCounts[(o.id as string)] ?? 0,
    }));

    // Calculate stats
    const revenueRows = (revenueRes.data ?? []) as { total: number }[];
    const total_revenue = revenueRows.reduce((sum, r) => sum + (r.total ?? 0), 0);
    const average_ticket = revenueRows.length > 0 ? total_revenue / revenueRows.length : 0;

    const revenueTodayRows = (revenueTodayRes.data ?? []) as { total: number }[];
    const revenue_today = revenueTodayRows.reduce((sum, r) => sum + (r.total ?? 0), 0);

    const ALL_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'completed', 'cancelled', 'refunded'];
    const statusRows = (byStatusRes.data ?? []) as { status: string }[];
    const orders_by_status = ALL_STATUSES.reduce<Record<string, number>>(
        (acc, s) => ({ ...acc, [s]: 0 }),
        {}
    );
    for (const row of statusRows) {
        if (row.status in orders_by_status) {
            orders_by_status[row.status] = (orders_by_status[row.status] ?? 0) + 1;
        }
    }

    const stats: OrderStats = {
        total_orders: ordersRes.count ?? 0,
        total_revenue: Math.round(total_revenue * 100) / 100,
        average_ticket: Math.round(average_ticket * 100) / 100,
        orders_today: ordersTodayRes.count ?? 0,
        revenue_today: Math.round(revenue_today * 100) / 100,
        orders_by_status,
    };

    return {
        orders,
        total: ordersRes.count ?? 0,
        totalPages: Math.ceil((ordersRes.count ?? 0) / PAGE_SIZE),
        stats,
    };
}

export default async function OrdersPage({
    searchParams,
}: {
    searchParams: Promise<{ new?: string }>;
}) {
    const [{ orders, total, totalPages, stats }, query] = await Promise.all([getPageData(), searchParams]);

    return (
        <>
            <Breadcrumb />
            <OrdersPageClient
                initialOrders={orders}
                initialTotal={total}
                initialTotalPages={totalPages}
                stats={stats}
                openCreate={query.new === '1'}
            />
        </>
    );
}
