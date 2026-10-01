import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin, TenantError } from '@/lib/tenant';
import type { Tenant } from '@/lib/types/database';

export async function GET() {
    try {
        await requireSuperAdmin();
        const supabase = createAdminClient();

        // Fetch all tenants (no tenant_id filter — super admin sees all)
        const tenantsRes = await supabase
            .from('tenants')
            .select('*')
            .order('created_at', { ascending: false });

        if (tenantsRes.error) throw tenantsRes.error;
        const tenants = (tenantsRes.data ?? []) as Tenant[];

        // Fetch user counts per tenant
        const { data: users } = await supabase
            .from('users')
            .select('tenant_id, id, full_name, email, role, is_active, last_seen_at');

        const usersByTenant: Record<string, typeof users> = {};
        (users ?? []).forEach((u) => {
            if (!usersByTenant[u.tenant_id]) usersByTenant[u.tenant_id] = [];
            usersByTenant[u.tenant_id]!.push(u);
        });

        // Fetch credentials per tenant — use actual column names
        const { data: credentials } = await supabase
            .from('tenant_credentials')
            .select('tenant_id, meta_access_token, waba_id, n8n_base_url');

        const credsByTenant: Record<string, typeof credentials> = {};
        (credentials ?? []).forEach((c) => {
            if (!credsByTenant[c.tenant_id]) credsByTenant[c.tenant_id] = [];
            credsByTenant[c.tenant_id]!.push(c);
        });

        const enriched = tenants.map((t) => {
            const tenantUsers = usersByTenant[t.id] ?? [];
            const tenantCreds = credsByTenant[t.id] ?? [];
            // Use first row of credentials (one row per tenant in this schema)
            const cred = tenantCreds[0];
            return {
                ...t,
                user_count: tenantUsers.length,
                users: tenantUsers,
                meta_configured: !!(cred?.meta_access_token && cred?.waba_id),
                n8n_configured: !!(cred?.n8n_base_url),
            };
        });

        return NextResponse.json({ tenants: enriched });
    } catch (err) {
        if (err instanceof TenantError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[GET /api/admin/tenants]', err);
        return NextResponse.json({ error: 'Error fetching tenants' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        await requireSuperAdmin();
        const body = await req.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('tenants')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ ...updates, updated_at: new Date().toISOString() } as any)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ tenant: data });
    } catch (err) {
        if (err instanceof TenantError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[PATCH /api/admin/tenants]', err);
        return NextResponse.json({ error: 'Error updating tenant' }, { status: 500 });
    }
}
