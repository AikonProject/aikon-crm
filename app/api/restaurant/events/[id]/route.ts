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
        const allowed = ['name', 'description', 'date', 'start_time', 'end_time', 'capacity', 'price_per_person', 'is_active'];
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('restaurant_events')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/restaurant/events/[id]]', err);
        return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
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

        // Nullify event_id on reservations
        await supabase
            .from('reservations')
            .update({ event_id: null })
            .eq('event_id', id)
            .eq('tenant_id', TENANT_ID);

        const { error } = await supabase
            .from('restaurant_events')
            .delete()
            .eq('id', id)
            .eq('tenant_id', TENANT_ID);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/restaurant/events/[id]]', err);
        return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }
}
