import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// PATCH /api/deals/[id] — update a deal
// ---------------------------------------------------------------------------
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();
        const body = await request.json();

        const allowedFields = ['name', 'description', 'price', 'currency', 'quantity', 'status', 'notes', 'sold_at'];
        const updates: Record<string, unknown> = {};
        for (const key of Object.keys(body)) {
            if (allowedFields.includes(key)) {
                updates[key] = body[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('deals')
            .update(updates)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select('*, contact:contacts ( id, nombre, funnel_stage_id )')
            .single();

        if (error) {
            console.error('[PATCH /api/deals/[id]]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/deals/[id]] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// DELETE /api/deals/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        const { error } = await supabase
            .from('deals')
            .delete()
            .eq('id', id)
            .eq('tenant_id', TENANT_ID);

        if (error) {
            console.error('[DELETE /api/deals/[id]]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[DELETE /api/deals/[id]] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
