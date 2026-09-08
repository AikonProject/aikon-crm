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
        const { day_of_week, open_time, close_time, is_active, slot_duration_minutes } = body;

        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        // Use the day number as the shift_name fallback
        const DAY_NAMES: Record<number, string> = {
            0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miercoles',
            4: 'Jueves', 5: 'Viernes', 6: 'Sabado',
        };

        const { data, error } = await supabase
            .from('restaurant_schedules')
            .insert({
                tenant_id: TENANT_ID,
                day_of_week,
                shift_name: DAY_NAMES[day_of_week] ?? `Dia ${day_of_week}`,
                open_time: open_time || '12:00',
                close_time: close_time || '23:00',
                is_active: is_active !== false,
                slot_duration_minutes: slot_duration_minutes ?? 30,
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
