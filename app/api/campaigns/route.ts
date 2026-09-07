import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import type { Campaign } from '@/lib/types/database';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data: rawData, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false });

        if (error) throw error;
        const data = (rawData ?? []) as Campaign[];

        // Compute campaign_messages count per campaign
        const campaignIds = data.map((c) => c.id);
        const contactCounts: Record<string, number> = {};
        if (campaignIds.length > 0) {
            const { data: msgs } = await supabase
                .from('campaign_messages')
                .select('campaign_id')
                .in('campaign_id', campaignIds);
            (msgs ?? []).forEach((m) => {
                contactCounts[m.campaign_id] = (contactCounts[m.campaign_id] ?? 0) + 1;
            });
        }

        const enriched = data.map((c) => ({
            ...c,
            contact_count: contactCounts[c.id] ?? 0,
        }));

        return NextResponse.json({ campaigns: enriched });
    } catch (err) {
        console.error('[GET /api/campaigns]', err);
        return NextResponse.json({ error: 'Error fetching campaigns' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            name,
            description,
            template_id,
            scheduled_at,
            segment_filters,
        } = body;

        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

        // Build contact query with optional segment filters
        let query = supabase
            .from('contacts')
            .select('id')
            .eq('tenant_id', TENANT_ID);

        if (segment_filters?.funnel_stage_id) {
            query = query.eq('funnel_stage_id', segment_filters.funnel_stage_id);
        }
        if (segment_filters?.source) {
            query = query.eq('source', segment_filters.source);
        }

        const { data: contacts, error: contactError } = await query;
        if (contactError) throw contactError;

        const status = scheduled_at ? 'scheduled' : 'draft';

        const { data: campaignRaw, error: campaignError } = await supabase
            .from('campaigns')
            .insert({
                tenant_id: TENANT_ID,
                name,
                description: description ?? null,
                status,
                template_id: template_id ?? null,
                scheduled_at: scheduled_at ?? null,
                sent_count: 0,
                delivered_count: 0,
                read_count: 0,
                failed_count: 0,
                created_by: null,
            })
            .select()
            .single();

        if (campaignError) throw campaignError;
        const campaign = campaignRaw as Campaign;

        // Create campaign_messages for each contact
        if ((contacts ?? []).length > 0) {
            const campaignMessages = (contacts ?? []).map((c) => ({
                tenant_id: TENANT_ID,
                campaign_id: campaign.id,
                contact_id: c.id,
                status: 'pending' as const,
                sent_at: null,
                delivered_at: null,
                read_at: null,
                error_message: null,
            }));

            const { error: msgError } = await supabase
                .from('campaign_messages')
                .insert(campaignMessages);
            if (msgError) throw msgError;
        }

        return NextResponse.json(
            { campaign, contact_count: (contacts ?? []).length },
            { status: 201 }
        );
    } catch (err) {
        console.error('[POST /api/campaigns]', err);
        return NextResponse.json({ error: 'Error creating campaign' }, { status: 500 });
    }
}
