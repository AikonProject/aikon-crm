import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { OrderDetailClient } from '@/components/orders/order-detail-client';
import { notFound } from 'next/navigation';

export type OrderDetail = {
    id: string;
    status: string;
    subtotal: number;
    discount: number;
    total: number;
    notes: string | null;
    source: string | null;
    created_at: string;
    updated_at: string;
    contact: { id: string; nombre: string; wa_id: string | null; email: string | null } | null;
    items: { id: string; product_name: string; quantity: number; unit_price: number; subtotal: number; notes: string | null }[];
};

async function getOrder(id: string) {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

    const { data, error } = await supabase
        .from('orders')
        .select(
            `
            id, status, subtotal, discount, total, notes, source, created_at, updated_at,
            contact:contacts ( id, nombre, wa_id, email ),
            items:order_items ( id, product_name, quantity, unit_price, subtotal, notes )
            `
        )
        .eq('id', id)
        .eq('tenant_id', TENANT_ID)
        .single();

    if (error || !data) return null;
    return data as unknown as OrderDetail;
}

export default async function OrderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const order = await getOrder(id);

    if (!order) notFound();

    return (
        <>
            <Breadcrumb />
            <OrderDetailClient order={order} />
        </>
    );
}
