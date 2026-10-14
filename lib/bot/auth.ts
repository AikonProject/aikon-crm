import { NextRequest, NextResponse } from 'next/server';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * n8n → CRM authentication: once a tenant configures n8n_webhook_secret, every
 * call must carry it in `x-webhook-secret`. Tenants without a secret are still
 * accepted (legacy) with a warning. Returns an error response, or null if OK.
 */
export async function verifyN8nRequest(supabase: Admin, request: NextRequest, tenantId: string): Promise<NextResponse | null> {
    const { data: tenant } = await supabase.from('tenants').select('id').eq('id', tenantId).maybeSingle();
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const secret = request.headers.get('x-webhook-secret');
    const { data: cred } = await supabase
        .from('tenant_credentials')
        .select('n8n_webhook_secret')
        .eq('tenant_id', tenantId)
        .maybeSingle();
    if (cred?.n8n_webhook_secret) {
        if (secret !== cred.n8n_webhook_secret) return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    } else {
        console.warn(`[n8n] tenant ${tenantId} has no n8n_webhook_secret: request not authenticated`);
    }
    return null;
}
