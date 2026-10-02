import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ users: data ?? [] });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/settings/team]', err);
        return NextResponse.json({ error: 'Error fetching team' }, { status: 500 });
    }
}
