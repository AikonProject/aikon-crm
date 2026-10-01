import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// GET /api/orders/[id]  — single order with contact, items, and creator
// ---------------------------------------------------------------------------
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase  = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        const { data, error } = await supabase
            .from('orders')
            .select(
                `
                *,
                contact:contacts ( id, nombre, wa_id, email ),
                items:order_items ( id, product_name, quantity, unit_price, subtotal, notes ),
                created_by_user:users!orders_created_by_fkey ( id, full_name )
                `
            )
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single();

        if (error || !data) {
            console.error('[GET /api/orders/[id]]', error);
            return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
        }

        return NextResponse.json({ order: data });
    } catch (err) {
        console.error('[GET /api/orders/[id]] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// PATCH /api/orders/[id]  — update status, notes, or discount
// ---------------------------------------------------------------------------
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body      = await request.json();

        const allowed = ['status', 'notes', 'discount'];

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const supabase  = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        // If discount is being updated, recalculate total from current subtotal
        if (body.discount !== undefined) {
            const { data: existing, error: fetchErr } = await supabase
                .from('orders')
                .select('subtotal')
                .eq('id', id)
                .eq('tenant_id', TENANT_ID)
                .single();

            if (fetchErr || !existing) {
                return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
            }

            const subtotal        = (existing as { subtotal: number }).subtotal ?? 0;
            const appliedDiscount = Number(body.discount) ?? 0;
            update.total          = Math.max(0, subtotal - appliedDiscount);
        }

        const { data, error } = await supabase
            .from('orders')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select()
            .single();

        if (error) {
            console.error('[PATCH /api/orders/[id]]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ order: data });
    } catch (err) {
        console.error('[PATCH /api/orders/[id]] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
