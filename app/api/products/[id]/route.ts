import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// GET /api/products/[id]  — single product by id
// ---------------------------------------------------------------------------
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('orders');

        const { data, error } = await supabase
            .from('products')
            .select(
                `
                id, name, description, sku, price,
                image_url, is_active, metadata,
                created_at, updated_at, category_id,
                category:product_categories ( id, name )
                `
            )
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Producto no encontrado.' }, { status: 404 });
        }

        return NextResponse.json({ product: data });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/products/[id]]', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// PATCH /api/products/[id]  — update product fields
// ---------------------------------------------------------------------------
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        const allowed = [
            'name', 'description', 'price', 'sku',
            'category_id', 'image_url', 'is_active', 'metadata',
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('orders');

        const { data, error } = await supabase
            .from('products')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select(
                `
                id, name, description, sku, price,
                image_url, is_active, metadata,
                created_at, updated_at, category_id,
                category:product_categories ( id, name )
                `
            )
            .single();

        if (error) {
            console.error('[PATCH /api/products/[id]]', error);
            return NextResponse.json({ error: 'Error al actualizar el producto.' }, { status: 500 });
        }

        return NextResponse.json({ product: data });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/products/[id]] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// DELETE /api/products/[id]  — soft delete (set is_active = false)
// ---------------------------------------------------------------------------
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('orders');

        const { data, error } = await supabase
            .from('products')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select('id, name, is_active')
            .single();

        if (error) {
            console.error('[DELETE /api/products/[id]]', error);
            return NextResponse.json({ error: 'Error al desactivar el producto.' }, { status: 500 });
        }

        return NextResponse.json({ product: data });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[DELETE /api/products/[id]] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}
