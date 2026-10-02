import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';
import { getTenantConfig } from '@/lib/tenant-plan';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', TENANT_ID)
            .single();

        if (error) throw error;

        const config = await getTenantConfig(TENANT_ID);
        return NextResponse.json({
            tenant: data,
            plan: { slug: config.planSlug, name: config.planName, modules: config.modules },
        });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/settings/general]', err);
        return NextResponse.json({ error: 'Error fetching tenant' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            name,
            slug,
            logo_url,
            primary_color,
            booking_bg_color,
            booking_bg_image_url,
            corporate_events_enabled,
            corporate_min_party_size,
            corporate_contact_link,
            table_selection_enabled,
            table_spaces,
        } = body;

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('tenants')
            .update({
                ...(name !== undefined && { name }),
                ...(slug !== undefined && { slug }),
                ...(logo_url !== undefined && { logo_url }),
                ...(primary_color !== undefined && { primary_color }),
                ...(booking_bg_color !== undefined && { booking_bg_color }),
                ...(booking_bg_image_url !== undefined && { booking_bg_image_url }),
                ...(corporate_events_enabled !== undefined && { corporate_events_enabled }),
                ...(corporate_min_party_size !== undefined && { corporate_min_party_size }),
                ...(corporate_contact_link !== undefined && { corporate_contact_link }),
                ...(table_selection_enabled !== undefined && { table_selection_enabled }),
                ...(table_spaces !== undefined && { table_spaces }),
                updated_at: new Date().toISOString(),
            })
            .eq('id', TENANT_ID)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ tenant: data });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/settings/general]', err);
        return NextResponse.json({ error: 'Error updating tenant' }, { status: 500 });
    }
}
