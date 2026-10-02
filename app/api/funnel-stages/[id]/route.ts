import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, color, position, is_won, is_lost } = body;

        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('funnel');
        const update: Record<string, unknown> = {};
        if (name !== undefined) {
            update.name = name;
            // keep slug in sync with name
            update.slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        }
        if (color !== undefined) update.color = color;
        if (position !== undefined) update.position = position;
        if (is_won !== undefined) update.is_won = is_won;
        if (is_lost !== undefined) update.is_lost = is_lost;

        const { data, error } = await supabase
            .from('funnel_stages')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/funnel-stages/[id]]', err);
        return NextResponse.json({ error: 'Failed to update funnel stage' }, { status: 500 });
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('funnel');

        // Nullify contacts referencing this stage first
        await supabase
            .from('contacts')
            .update({ funnel_stage_id: null })
            .eq('funnel_stage_id', id)
            .eq('tenant_id', TENANT_ID);

        const { error } = await supabase
            .from('funnel_stages')
            .delete()
            .eq('id', id)
            .eq('tenant_id', TENANT_ID);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[DELETE /api/funnel-stages/[id]]', err);
        return NextResponse.json({ error: 'Failed to delete funnel stage' }, { status: 500 });
    }
}
