import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

const CANCELLED_STATUSES = ['cancelled', 'refunded'];

const ALL_STATUSES = [
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'delivered',
    'completed',
    'cancelled',
    'refunded',
] as const;

type OrderStatus = (typeof ALL_STATUSES)[number];

// ---------------------------------------------------------------------------
// GET /api/orders/stats  — order metrics for the tenant
// ?from=YYYY-MM-DD adds `period`: orders and revenue per day since that date
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
    try {
        const supabase  = createAdminClient();
        const TENANT_ID = await requireModule('orders');

        // Today's date in ISO format (YYYY-MM-DD) at midnight UTC
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const todayISO = todayStart.toISOString();

        // Run all queries in parallel
        const [
            totalOrdersRes,
            revenueRes,
            ordersTodayRes,
            revenueTodayRes,
            byStatusRes,
        ] = await Promise.all([
            // Total order count
            supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', TENANT_ID),

            // Revenue + avg ticket (exclude cancelled/refunded)
            supabase
                .from('orders')
                .select('total')
                .eq('tenant_id', TENANT_ID)
                .not('status', 'in', `(${CANCELLED_STATUSES.join(',')})`),

            // Orders today (all statuses)
            supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', TENANT_ID)
                .gte('created_at', todayISO),

            // Revenue today (exclude cancelled/refunded)
            supabase
                .from('orders')
                .select('total')
                .eq('tenant_id', TENANT_ID)
                .gte('created_at', todayISO)
                .not('status', 'in', `(${CANCELLED_STATUSES.join(',')})`),

            // All orders for per-status breakdown
            supabase
                .from('orders')
                .select('status', { count: 'exact' })
                .eq('tenant_id', TENANT_ID),
        ]);

        // Total orders
        const total_orders = totalOrdersRes.count ?? 0;

        // Revenue & average ticket
        const revenueRows = (revenueRes.data ?? []) as { total: number }[];
        const total_revenue    = revenueRows.reduce((sum, r) => sum + (r.total ?? 0), 0);
        const average_ticket   = revenueRows.length > 0
            ? total_revenue / revenueRows.length
            : 0;

        // Orders today
        const orders_today = ordersTodayRes.count ?? 0;

        // Revenue today
        const revenueTodayRows = (revenueTodayRes.data ?? []) as { total: number }[];
        const revenue_today = revenueTodayRows.reduce((sum, r) => sum + (r.total ?? 0), 0);

        // Orders by status
        const statusRows = (byStatusRes.data ?? []) as { status: string }[];
        const orders_by_status = ALL_STATUSES.reduce<Record<OrderStatus, number>>(
            (acc, s) => ({ ...acc, [s]: 0 }),
            {} as Record<OrderStatus, number>
        );
        for (const row of statusRows) {
            const s = row.status as OrderStatus;
            if (s in orders_by_status) {
                orders_by_status[s] = (orders_by_status[s] ?? 0) + 1;
            }
        }

        // Optional period breakdown (Reports page)
        const from = req.nextUrl.searchParams.get('from');
        let period = null;
        if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
            const { data: periodRows } = await supabase
                .from('orders')
                .select('total, status, created_at')
                .eq('tenant_id', TENANT_ID)
                .gte('created_at', `${from}T00:00:00Z`);
            const rows = (periodRows ?? []) as { total: number; status: string; created_at: string }[];
            const byDay: Record<string, { count: number; revenue: number }> = {};
            let revenue = 0;
            for (const row of rows) {
                const day = row.created_at.slice(0, 10);
                byDay[day] ??= { count: 0, revenue: 0 };
                byDay[day].count++;
                if (!CANCELLED_STATUSES.includes(row.status)) {
                    byDay[day].revenue += row.total ?? 0;
                    revenue += row.total ?? 0;
                }
            }
            period = {
                orders: rows.length,
                revenue: Math.round(revenue * 100) / 100,
                by_day: Object.entries(byDay).map(([date, v]) => ({ date, ...v })),
            };
        }

        return NextResponse.json({
            period,
            total_orders,
            total_revenue:   Math.round(total_revenue * 100) / 100,
            average_ticket:  Math.round(average_ticket * 100) / 100,
            orders_today,
            revenue_today:   Math.round(revenue_today * 100) / 100,
            orders_by_status,
        });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/orders/stats] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
