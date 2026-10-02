import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// GET /api/products/categories  — list all categories for tenant
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest) {
    try {
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('orders');

        const { data, error } = await supabase
            .from('product_categories')
            .select('id, name, parent_id, position, created_at')
            .eq('tenant_id', TENANT_ID)
            .order('position', { ascending: true });

        if (error) {
            console.error('[GET /api/products/categories]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ categories: data ?? [] });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/products/categories] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// POST /api/products/categories  — create a new category
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, parent_id, position } = body as {
            name?: string;
            parent_id?: string | null;
            position?: number | null;
        };

        if (!name?.trim()) {
            return NextResponse.json({ error: 'El nombre de la categoría es requerido.' }, { status: 400 });
        }

        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('orders');

        const { data, error } = await supabase
            .from('product_categories')
            .insert({
                tenant_id: TENANT_ID,
                name: name.trim(),
                parent_id: parent_id ?? null,
                position: position ?? 0,
            })
            .select('id, name, parent_id, position, created_at')
            .single();

        if (error) {
            console.error('[POST /api/products/categories]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ category: data }, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/products/categories] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}
