import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import { dispatchCampaign } from '@/lib/campaigns';

/** (Re)sends a draft campaign to the tenant's n8n campaign webhook. */
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const TENANT_ID = await requireModule('campaigns');
        const result = await dispatchCampaign(createAdminClient(), TENANT_ID, id);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ status: result.status, recipients: result.recipients });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/campaigns/[id]/send]', err);
        return NextResponse.json({ error: 'Error al enviar la campaña' }, { status: 500 });
    }
}
