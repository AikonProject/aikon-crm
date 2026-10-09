import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('campaigns');

        const { data: campaign, error } = await supabase
            .from('campaigns')
            .select('*, template:message_templates(id, name, category, language, components)')
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single();

        if (error) throw error;

        const { data: messages } = await supabase
            .from('campaign_messages')
            .select('*, contact:contacts(id, nombre, wa_id)')
            .eq('campaign_id', id)
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false })
            .limit(100);

        return NextResponse.json({ campaign, messages: messages ?? [] });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/campaigns/[id]]', err);
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('campaigns');

        // Delivery counters and status transitions come from n8n, not from the UI
        const allowed = ['name', 'description', 'scheduled_at'];
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }
        if (body.status === 'cancelled') update.status = 'cancelled';

        const { data, error } = await supabase
            .from('campaigns')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ campaign: data });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/campaigns/[id]]', err);
        return NextResponse.json({ error: 'Error updating campaign' }, { status: 500 });
    }
}
