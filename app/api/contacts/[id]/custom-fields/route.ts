import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { field_key, value } = await request.json();
        if (!field_key) return NextResponse.json({ error: 'field_key required' }, { status: 400 });

        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single();
        if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

        if (value === null || value === '') {
            await supabase
                .from('contact_field_values')
                .delete()
                .eq('contact_id', id)
                .eq('field_key', field_key);
        } else {
            await supabase
                .from('contact_field_values')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .upsert({ tenant_id: TENANT_ID, contact_id: id, field_key, value } as any, { onConflict: 'contact_id,field_key' });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/contacts/[id]/custom-fields]', err);
        return NextResponse.json({ error: 'Failed to update custom field' }, { status: 500 });
    }
}
