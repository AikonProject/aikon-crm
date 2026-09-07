import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const allowed = ['day_of_week', 'open_time', 'close_time', 'is_closed'];
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('restaurant_schedules')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', MOCK_TENANT_ID)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/restaurant/schedules/[id]]', err);
        return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
    }
}
