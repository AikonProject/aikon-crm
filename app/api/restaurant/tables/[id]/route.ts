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
        const allowed = ['name', 'capacity', 'zone', 'is_active', 'status'];
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('restaurant_tables')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', MOCK_TENANT_ID)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/restaurant/tables/[id]]', err);
        return NextResponse.json({ error: 'Failed to update table' }, { status: 500 });
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();

        // Nullify table_id on reservations
        await supabase
            .from('reservations')
            .update({ table_id: null })
            .eq('table_id', id)
            .eq('tenant_id', MOCK_TENANT_ID);

        const { error } = await supabase
            .from('restaurant_tables')
            .delete()
            .eq('id', id)
            .eq('tenant_id', MOCK_TENANT_ID);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/restaurant/tables/[id]]', err);
        return NextResponse.json({ error: 'Failed to delete table' }, { status: 500 });
    }
}
