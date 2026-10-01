import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { ProductsSettingsClient } from '@/components/settings/products-settings-client';

async function getPageData() {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

    const [productsRes, categoriesRes] = await Promise.all([
        supabase
            .from('products')
            .select(
                `id, name, description, sku, price,
                 image_url, is_active, metadata,
                 created_at, updated_at, category_id,
                 category:product_categories ( id, name )`
            )
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false })
            .range(0, 19),
        supabase
            .from('product_categories')
            .select('id, name, parent_id, position, created_at')
            .eq('tenant_id', TENANT_ID)
            .order('position', { ascending: true }),
    ]);

    return {
        initialProducts: (productsRes.data ?? []) as Product[],
        initialCategories: (categoriesRes.data ?? []) as Category[],
    };
}

// Lightweight local types used only for SSR prop passing
type Category = {
    id: string;
    name: string;
    parent_id: string | null;
    position: number;
    created_at: string;
};

type Product = {
    id: string;
    name: string;
    description: string | null;
    sku: string | null;
    price: number;
    image_url: string | null;
    is_active: boolean;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    category_id: string | null;
    category: { id: string; name: string } | null;
};

export default async function ProductsSettingsPage() {
    const { initialProducts, initialCategories } = await getPageData();

    return (
        <>
            <Breadcrumb />
            <ProductsSettingsClient
                initialProducts={initialProducts}
                initialCategories={initialCategories}
            />
        </>
    );
}
