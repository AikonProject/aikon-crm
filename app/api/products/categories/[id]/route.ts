import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// PATCH /api/products/categories/[id]  — update category fields
// ---------------------------------------------------------------------------
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        const allowed = ['name', 'position', 'parent_id'];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = {};
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        if (Object.keys(update).length === 0) {
            return NextResponse.json(
                { error: 'No se proporcionaron campos para actualizar.' },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('orders');

        const { data, error } = await supabase
            .from('product_categories')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select('id, name, parent_id, position, created_at')
            .single();

        if (error) {
            console.error('[PATCH /api/products/categories/[id]]', error);
            return NextResponse.json({ error: 'Error al actualizar la categoría.' }, { status: 500 });
        }

        return NextResponse.json({ category: data });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/products/categories/[id]] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// DELETE /api/products/categories/[id]  — hard delete (CASCADE handles products)
// ---------------------------------------------------------------------------
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('orders');

        const { error } = await supabase
            .from('product_categories')
            .delete()
            .eq('id', id)
            .eq('tenant_id', TENANT_ID);

        if (error) {
            console.error('[DELETE /api/products/categories/[id]]', error);
            return NextResponse.json({ error: 'Error al eliminar la categoría.' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[DELETE /api/products/categories/[id]] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}
