import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// GET /api/products  — paginated products list
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
        const search = searchParams.get('search') ?? '';
        const categoryId = searchParams.get('category_id') ?? '';
        const activeParam = searchParams.get('active');

        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        let query = supabase
            .from('products')
            .select(
                `
                id, name, description, sku, price,
                image_url, is_active, metadata,
                created_at, updated_at, category_id,
                category:product_categories ( id, name )
                `,
                { count: 'exact' }
            )
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false });

        if (search) {
            query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
        }

        if (categoryId) {
            query = query.eq('category_id', categoryId);
        }

        if (activeParam !== null && activeParam !== '') {
            query = query.eq('is_active', activeParam === 'true');
        }

        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) {
            console.error('[GET /api/products]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            products: data ?? [],
            total: count ?? 0,
            page,
            pageSize: PAGE_SIZE,
            totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
        });
    } catch (err) {
        console.error('[GET /api/products] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// POST /api/products  — create a new product
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            name,
            price,
            description,
            sku,
            category_id,
            image_url,
            is_active,
            metadata,
        } = body as {
            name?: string;
            price?: number;
            description?: string | null;
            sku?: string | null;
            category_id?: string | null;
            image_url?: string | null;
            is_active?: boolean;
            metadata?: Record<string, unknown> | null;
        };

        if (!name?.trim()) {
            return NextResponse.json({ error: 'El nombre del producto es requerido.' }, { status: 400 });
        }

        if (price === undefined || price === null || isNaN(Number(price))) {
            return NextResponse.json({ error: 'El precio del producto es requerido.' }, { status: 400 });
        }

        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        const { data, error } = await supabase
            .from('products')
            .insert({
                tenant_id: TENANT_ID,
                name: name.trim(),
                price: Number(price),
                description: description ?? null,
                sku: sku ?? null,
                category_id: category_id ?? null,
                image_url: image_url ?? null,
                is_active: is_active ?? true,
                metadata: metadata ?? null,
            })
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
            console.error('[POST /api/products]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ product: data }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/products] unexpected', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}
