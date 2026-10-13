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

/** GET /api/funnel-stages/[id] → { contact_count } (to warn before deleting the stage) */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('funnel');
        const { count, error } = await supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', TENANT_ID)
            .eq('funnel_stage_id', id);
        if (error) throw error;
        return NextResponse.json({ contact_count: count ?? 0 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/funnel-stages/[id]]', err);
        return NextResponse.json({ error: 'Error' }, { status: 500 });
    }
}

/** DELETE /api/funnel-stages/[id]?move_to=<stage id> — its contacts go to that stage (or stay without stage). */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('funnel');
        const moveTo = new URL(request.url).searchParams.get('move_to') || null;

        if (moveTo) {
            if (moveTo === id) return NextResponse.json({ error: 'Elige otra etapa.' }, { status: 400 });
            const { data: target } = await supabase.from('funnel_stages').select('id, name')
                .eq('id', moveTo).eq('tenant_id', TENANT_ID).maybeSingle();
            if (!target) return NextResponse.json({ error: 'La etapa de destino no existe.' }, { status: 400 });
        }

        // Move (or un-assign) the contacts first, then delete the stage
        const { data: moved, error: moveError } = await supabase
            .from('contacts')
            .update({ funnel_stage_id: moveTo, updated_at: new Date().toISOString() })
            .eq('funnel_stage_id', id)
            .eq('tenant_id', TENANT_ID)
            .select('id');
        if (moveError) throw moveError;

        const { error } = await supabase
            .from('funnel_stages')
            .delete()
            .eq('id', id)
            .eq('tenant_id', TENANT_ID);

        if (error) throw error;
        return NextResponse.json({ success: true, moved: moved?.length ?? 0 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[DELETE /api/funnel-stages/[id]]', err);
        return NextResponse.json({ error: 'Failed to delete funnel stage' }, { status: 500 });
    }
}
