import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// GET /api/settings/ai — fetch AI config for tenant
// ---------------------------------------------------------------------------
export async function GET() {
    try {
        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        const { data, error } = await supabase
            .from('tenants')
            .select('ai_config')
            .eq('id', TENANT_ID)
            .single();

        if (error) {
            console.error('[GET /api/settings/ai]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ config: data?.ai_config ?? {} });
    } catch (err) {
        console.error('[GET /api/settings/ai] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// PATCH /api/settings/ai — update AI config
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
    try {
        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();
        const body = await req.json();

        // Merge with existing config
        const { data: existing } = await supabase
            .from('tenants')
            .select('ai_config')
            .eq('id', TENANT_ID)
            .single();

        const currentConfig = (existing?.ai_config as Record<string, unknown>) ?? {};
        const newConfig = { ...currentConfig, ...body.config };

        const { error } = await supabase
            .from('tenants')
            .update({ ai_config: newConfig } as Record<string, unknown>)
            .eq('id', TENANT_ID);

        if (error) {
            console.error('[PATCH /api/settings/ai]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ config: newConfig });
    } catch (err) {
        console.error('[PATCH /api/settings/ai] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
