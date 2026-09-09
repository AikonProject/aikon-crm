import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { auth } from '@clerk/nextjs/server';

export async function GET() {
    const { orgId, userId } = await auth();
    const TENANT_ID = await getServerTenantId();
    const supabase = createAdminClient();

    const { data: creds } = await supabase
        .from('tenant_credentials')
        .select('tenant_id, n8n_send_message_webhook, n8n_reservation_webhook, n8n_base_url')
        .eq('tenant_id', TENANT_ID)
        .maybeSingle();

    const { data: allCreds } = await supabase
        .from('tenant_credentials')
        .select('tenant_id, n8n_send_message_webhook, n8n_reservation_webhook')
        .limit(10);

    return NextResponse.json({
        clerk_org_id: orgId,
        clerk_user_id: userId,
        resolved_tenant_id: TENANT_ID,
        credentials_for_tenant: creds,
        all_credential_rows: allCreds,
    });
}
