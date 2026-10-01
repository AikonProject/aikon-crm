import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// GET /api/orders  — paginated orders list
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
        const search     = searchParams.get('search') ?? '';
        const status     = searchParams.get('status') ?? '';
        const contactId  = searchParams.get('contact_id') ?? '';

        const supabase  = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        let query = supabase
            .from('orders')
            .select(
                `
                id, status, subtotal, discount, total, notes, source, created_at, updated_at,
                contact:contacts ( id, nombre, wa_id, email )
                `,
                { count: 'exact' }
            )
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false });

        if (search) {
            // Search by contact name via a join — filter on the nested relation
            query = query.ilike('contact.nombre', `%${search}%`);
        }

        if (status) {
            query = query.eq('status', status as 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled' | 'refunded');
        }

        if (contactId) {
            query = query.eq('contact_id', contactId);
        }

        const from = (page - 1) * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;
        query      = query.range(from, to);

        const { data, error, count } = await query;

        if (error) {
            console.error('[GET /api/orders]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Fetch item counts for each order in a single query
        const orderIds = (data ?? []).map((o: { id: string }) => o.id);
        let itemCounts: Record<string, number> = {};

        if (orderIds.length > 0) {
            const { data: itemRows, error: itemErr } = await supabase
                .from('order_items')
                .select('order_id')
                .in('order_id', orderIds);

            if (!itemErr && itemRows) {
                for (const row of itemRows as { order_id: string }[]) {
                    itemCounts[row.order_id] = (itemCounts[row.order_id] ?? 0) + 1;
                }
            }
        }

        const orders = (data ?? []).map((o: Record<string, unknown>) => ({
            ...o,
            item_count: itemCounts[(o.id as string)] ?? 0,
        }));

        return NextResponse.json({
            orders,
            total:      count ?? 0,
            page,
            pageSize:   PAGE_SIZE,
            totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
        });
    } catch (err) {
        console.error('[GET /api/orders] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// POST /api/orders  — create a new order
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            contact_id,
            items,
            notes,
            discount,
            source,
        } = body as {
            contact_id?: string | null;
            items: { product_id?: string | null; product_name: string; quantity: number; unit_price: number }[];
            notes?: string | null;
            discount?: number | null;
            source?: string | null;
        };

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: 'Se requiere al menos un artículo en el pedido.' },
                { status: 400 }
            );
        }

        // Validate each item
        for (const item of items) {
            if (!item.product_name?.trim()) {
                return NextResponse.json(
                    { error: 'Cada artículo debe tener un nombre de producto.' },
                    { status: 400 }
                );
            }
            if (typeof item.quantity !== 'number' || item.quantity <= 0) {
                return NextResponse.json(
                    { error: 'La cantidad de cada artículo debe ser mayor a 0.' },
                    { status: 400 }
                );
            }
            if (typeof item.unit_price !== 'number' || item.unit_price < 0) {
                return NextResponse.json(
                    { error: 'El precio unitario no puede ser negativo.' },
                    { status: 400 }
                );
            }
        }

        const subtotal      = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const appliedDiscount = discount ?? 0;
        const total         = Math.max(0, subtotal - appliedDiscount);

        const supabase  = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        // Insert the order
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .insert({
                tenant_id:   TENANT_ID,
                contact_id:  contact_id  ?? null,
                status:      'pending',
                subtotal,
                discount:    appliedDiscount,
                total,
                notes:       notes   ?? null,
                source:      source  ?? 'manual',
            })
            .select()
            .single();

        if (orderErr) {
            console.error('[POST /api/orders] insert order', orderErr);
            return NextResponse.json({ error: orderErr.message }, { status: 500 });
        }

        // Insert order items
        const itemRows = items.map((item) => ({
            tenant_id:    TENANT_ID,
            order_id:     (order as { id: string }).id,
            product_id:   item.product_id  ?? null,
            product_name: item.product_name.trim(),
            quantity:     item.quantity,
            unit_price:   item.unit_price,
            subtotal:     item.quantity * item.unit_price,
            notes:        null,
        }));

        const { error: itemsErr } = await supabase
            .from('order_items')
            .insert(itemRows);

        if (itemsErr) {
            console.error('[POST /api/orders] insert order_items', itemsErr);
            // Attempt to clean up the orphaned order (best-effort)
            await supabase
                .from('orders')
                .delete()
                .eq('id', (order as { id: string }).id)
                .eq('tenant_id', TENANT_ID);

            return NextResponse.json({ error: itemsErr.message }, { status: 500 });
        }

        return NextResponse.json({ order }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/orders] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
