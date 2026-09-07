import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { ReservationsPageClient } from '@/components/reservations/reservations-page-client';
import type { Reservation, RestaurantTable, RestaurantEvent } from '@/lib/types/database';
import { format } from 'date-fns';

type ReservationWithRelations = Reservation & {
    contact: { id: string; nombre: string; wa_id: string | null } | null;
    table: { id: string; name: string; capacity: number } | null;
    event: { id: string; name: string } | null;
};

async function getPageData() {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
    const today = format(new Date(), 'yyyy-MM-dd');

    const [reservationsRes, tablesRes, eventsRes, tenantRes] = await Promise.all([
        supabase
            .from('reservations')
            .select(
                `*,
                 contact:contacts ( id, nombre, wa_id ),
                 table:restaurant_tables ( id, name, capacity ),
                 event:restaurant_events ( id, name )`
            )
            .eq('tenant_id', TENANT_ID)
            .order('reservation_date', { ascending: false })
            .order('reservation_time', { ascending: true })
            .limit(300),
        supabase
            .from('restaurant_tables')
            .select('id, name, capacity, location, is_active')
            .eq('tenant_id', TENANT_ID)
            .eq('is_active', true)
            .order('name', { ascending: true }),
        supabase
            .from('restaurant_events')
            .select('id, name, event_date, start_time')
            .eq('tenant_id', TENANT_ID)
            .eq('is_active', true)
            .gte('event_date', today)
            .order('event_date', { ascending: true }),
        supabase
            .from('tenants')
            .select('slug')
            .eq('id', TENANT_ID)
            .single(),
    ]);

    return {
        reservations: (reservationsRes.data ?? []) as ReservationWithRelations[],
        tables: (tablesRes.data ?? []) as RestaurantTable[],
        events: (eventsRes.data ?? []) as RestaurantEvent[],
        today,
        slug: (tenantRes.data?.slug ?? '') as string,
    };
}

export default async function ReservationsPage() {
    const { reservations, tables, events, today, slug } = await getPageData();

    return (
        <>
            <Breadcrumb />
            <ReservationsPageClient
                reservations={reservations}
                tables={tables}
                events={events}
                today={today}
                slug={slug}
            />
        </>
    );
}
