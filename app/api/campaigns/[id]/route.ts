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
            .select('*, template:message_templates(id, name, category, language, content, variables)')
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single();

        if (error) throw error;

        const { data: messages } = await supabase
            .from('campaign_messages')
            .select('*, contact:contacts(id, first_name, last_name, phone)')
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

        const { data, error } = await supabase
            .from('campaigns')
            .update({ ...body, updated_at: new Date().toISOString() })
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
