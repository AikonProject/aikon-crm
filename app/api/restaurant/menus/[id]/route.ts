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
        const allowed = ['name', 'description', 'image_url', 'is_available', 'position'];
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('restaurant_menus')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', MOCK_TENANT_ID)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/restaurant/menus/[id]]', err);
        return NextResponse.json({ error: 'Failed to update menu' }, { status: 500 });
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const { error } = await supabase
            .from('restaurant_menus')
            .delete()
            .eq('id', id)
            .eq('tenant_id', MOCK_TENANT_ID);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/restaurant/menus/[id]]', err);
        return NextResponse.json({ error: 'Failed to delete menu' }, { status: 500 });
    }
}
