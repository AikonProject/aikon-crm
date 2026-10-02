import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('tenant_credentials')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .maybeSingle();

        if (error) throw error;

        return NextResponse.json({ credentials: data ?? {} });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/settings/credentials]', err);
        return NextResponse.json({ error: 'Error fetching credentials' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

        const { error } = await supabase
            .from('tenant_credentials')
            .upsert(
                { tenant_id: TENANT_ID, ...body },
                { onConflict: 'tenant_id' }
            );

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/settings/credentials]', err);
        return NextResponse.json({ error: 'Error updating credentials' }, { status: 500 });
    }
}
