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

/** Columns of tenant_credentials the CRM lets a tenant edit. */
const EDITABLE_FIELDS = [
    'waba_id', 'phone_number_id', 'meta_access_token', 'meta_webhook_verify_token',
    'n8n_base_url', 'n8n_webhook_secret', 'n8n_send_message_webhook', 'n8n_bot_webhook',
    'n8n_reservation_webhook', 'n8n_campaign_webhook', 'n8n_templates_webhook', 'whatsapp_provider',
    'google_calendar_id', 'google_service_account_json',
] as const;

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        const update: Record<string, string | null> = {};
        for (const key of EDITABLE_FIELDS) {
            if (body[key] !== undefined) {
                const value = typeof body[key] === 'string' ? body[key].trim() : null;
                update[key] = value || null;
            }
        }
        if (Object.keys(update).length === 0) {
            return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
        }

        // tenant_id last so the body can never target another tenant's row
        const { error } = await supabase
            .from('tenant_credentials')
            .upsert(
                { ...update, tenant_id: TENANT_ID, updated_at: new Date().toISOString() },
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
