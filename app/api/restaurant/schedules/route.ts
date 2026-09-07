import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('restaurant_schedules')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('day_of_week', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (err) {
        console.error('[GET /api/restaurant/schedules]', err);
        return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { day_of_week, open_time, close_time, is_closed } = body;

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('restaurant_schedules')
            .insert({
                tenant_id: TENANT_ID,
                day_of_week,
                open_time: open_time || '12:00',
                close_time: close_time || '22:00',
                is_closed: is_closed ?? false,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        console.error('[POST /api/restaurant/schedules]', err);
        return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
    }
}
