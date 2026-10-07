import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

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
        const TENANT_ID = await requireModule('orders');

        const { data, error } = await supabase
            .from('orders')
            .select(
                `
                *,
                contact:contacts ( id, nombre, wa_id, email ),
                items:order_items ( id, product_id, product_name, quantity, unit_price, subtotal, notes ),
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
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/orders/[id]] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// PATCH /api/orders/[id]  — update status, notes, discount and/or items
// `items` replaces the order's items; subtotal and total are recalculated.
// ---------------------------------------------------------------------------
type ItemInput = { product_id?: string | null; product_name: string; quantity: number; unit_price: number };

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

        const items = body.items as ItemInput[] | undefined;
        if (items !== undefined) {
            const error = validateItems(items);
            if (error) return NextResponse.json({ error }, { status: 400 });
        }
        if (body.discount !== undefined && (typeof body.discount !== 'number' || body.discount < 0)) {
            return NextResponse.json({ error: 'El descuento no puede ser negativo.' }, { status: 400 });
        }

        const supabase  = createAdminClient();
        const TENANT_ID = await requireModule('orders');

        // Recalculate totals when items or discount change
        if (items !== undefined || body.discount !== undefined) {
            const { data: existing, error: fetchErr } = await supabase
                .from('orders')
                .select('subtotal, discount')
                .eq('id', id)
                .eq('tenant_id', TENANT_ID)
                .single();

            if (fetchErr || !existing) {
                return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
            }

            const current = existing as { subtotal: number; discount: number };
            const subtotal = items !== undefined
                ? items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
                : current.subtotal ?? 0;
            const appliedDiscount = body.discount !== undefined ? Number(body.discount) : current.discount ?? 0;
            update.subtotal = subtotal;
            update.total    = Math.max(0, subtotal - appliedDiscount);
        }

        if (items !== undefined) {
            const { error: deleteErr } = await supabase
                .from('order_items')
                .delete()
                .eq('order_id', id)
                .eq('tenant_id', TENANT_ID);
            if (deleteErr) {
                console.error('[PATCH /api/orders/[id]] delete items', deleteErr);
                return NextResponse.json({ error: deleteErr.message }, { status: 500 });
            }

            const { error: insertErr } = await supabase
                .from('order_items')
                .insert(items.map((item) => ({
                    tenant_id:    TENANT_ID,
                    order_id:     id,
                    product_id:   item.product_id ?? null,
                    product_name: item.product_name.trim(),
                    quantity:     item.quantity,
                    unit_price:   item.unit_price,
                    subtotal:     item.quantity * item.unit_price,
                    notes:        null,
                })));
            if (insertErr) {
                console.error('[PATCH /api/orders/[id]] insert items', insertErr);
                return NextResponse.json({ error: insertErr.message }, { status: 500 });
            }
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
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/orders/[id]] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

function validateItems(items: unknown): string | null {
    if (!Array.isArray(items) || items.length === 0) return 'Se requiere al menos un artículo en el pedido.';
    for (const item of items as ItemInput[]) {
        if (!item.product_name?.trim()) return 'Cada artículo debe tener un nombre de producto.';
        if (typeof item.quantity !== 'number' || item.quantity <= 0) return 'La cantidad de cada artículo debe ser mayor a 0.';
        if (typeof item.unit_price !== 'number' || item.unit_price < 0) return 'El precio unitario no puede ser negativo.';
    }
    return null;
}
