import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { RestaurantSettingsClient } from '@/components/settings/restaurant-settings-client';
import type { RestaurantTable, RestaurantSchedule, RestaurantEvent, RestaurantMenu } from '@/lib/types/database';

async function getPageData() {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

    const [tablesRes, schedulesRes, eventsRes, menusRes, tenantRes] = await Promise.all([
        supabase
            .from('restaurant_tables')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('name', { ascending: true }),
        supabase
            .from('restaurant_schedules')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('day_of_week', { ascending: true }),
        supabase
            .from('restaurant_events')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('date', { ascending: true }),
        supabase
            .from('restaurant_menus')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('position', { ascending: true }),
        supabase
            .from('tenants')
            .select('id, name, slug')
            .eq('id', TENANT_ID)
            .single(),
    ]);

    return {
        tables: (tablesRes.data ?? []) as RestaurantTable[],
        schedules: (schedulesRes.data ?? []) as RestaurantSchedule[],
        events: (eventsRes.data ?? []) as RestaurantEvent[],
        menus: (menusRes.data ?? []) as RestaurantMenu[],
        slug: (tenantRes.data?.slug ?? '') as string,
    };
}

export default async function RestaurantSettingsPage() {
    const { tables, schedules, events, menus, slug } = await getPageData();

    return (
        <>
            <Breadcrumb />
            <RestaurantSettingsClient
                initialTables={tables}
                initialSchedules={schedules}
                initialEvents={events}
                initialMenus={menus}
                slug={slug}
            />
        </>
    );
}
