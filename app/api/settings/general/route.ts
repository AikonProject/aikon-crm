import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

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

        return NextResponse.json({ tenant: data });
    } catch (err) {
        console.error('[GET /api/settings/general]', err);
        return NextResponse.json({ error: 'Error fetching tenant' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, slug, logo_url } = body;

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('tenants')
            .update({
                ...(name !== undefined && { name }),
                ...(slug !== undefined && { slug }),
                ...(logo_url !== undefined && { logo_url }),
                updated_at: new Date().toISOString(),
            })
            .eq('id', TENANT_ID)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ tenant: data });
    } catch (err) {
        console.error('[PATCH /api/settings/general]', err);
        return NextResponse.json({ error: 'Error updating tenant' }, { status: 500 });
    }
}
