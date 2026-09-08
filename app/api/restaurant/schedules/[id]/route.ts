import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const allowed = ['day_of_week', 'open_time', 'close_time', 'is_active', 'slot_duration_minutes', 'max_capacity'];
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('restaurant_schedules')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/restaurant/schedules/[id]]', err);
        return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();
        const { error } = await supabase
            .from('restaurant_schedules')
            .delete()
            .eq('id', id)
            .eq('tenant_id', TENANT_ID);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/restaurant/schedules/[id]]', err);
        return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
    }
}
