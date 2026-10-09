import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import { cleanFilter, type ContactFilter } from '@/lib/contact-filter';
import type { Campaign } from '@/lib/types/database';
import { dispatchCampaign } from '@/lib/campaigns';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('campaigns');
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
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
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
            template_variables,
            scheduled_at,
            segment_filters,
            filter,
            send = true,
        } = body;

        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('campaigns');

        // Recipients: professional filter (filter_contacts) or the legacy simple filters
        let contacts: { id: string }[] = [];
        if (filter) {
            const cleaned = cleanFilter(filter as ContactFilter);
            const { data: ids, error: filterError } = await supabase.rpc('filter_contacts' as never, { p_tenant: TENANT_ID, p_filter: cleaned } as never);
            if (filterError) {
                console.error('[POST /api/campaigns] filter', filterError);
                return NextResponse.json({ error: 'El filtro de contactos no es válido.' }, { status: 400 });
            }
            const allIds = (ids ?? []) as unknown as string[];
            // Only contacts reachable on WhatsApp and not blocked
            for (let i = 0; i < allIds.length; i += 500) {
                const { data, error } = await supabase
                    .from('contacts')
                    .select('id')
                    .in('id', allIds.slice(i, i + 500))
                    .not('wa_id', 'is', null)
                    .eq('is_blocked', false);
                if (error) throw error;
                contacts.push(...(data ?? []));
            }
        } else {
            let query = supabase
                .from('contacts')
                .select('id')
                .eq('tenant_id', TENANT_ID);
            if (segment_filters?.funnel_stage_id) query = query.eq('funnel_stage_id', segment_filters.funnel_stage_id);
            if (segment_filters?.source) query = query.eq('source', segment_filters.source);
            const { data, error: contactError } = await query;
            if (contactError) throw contactError;
            contacts = data ?? [];
        }
        if (contacts.length === 0) {
            return NextResponse.json({ error: 'Ningún contacto con WhatsApp cumple el filtro.' }, { status: 400 });
        }

        let templateName: string | null = null;
        if (template_id) {
            const { data: template } = await supabase
                .from('message_templates')
                .select('name')
                .eq('id', template_id)
                .eq('tenant_id', TENANT_ID)
                .maybeSingle();
            if (!template) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 400 });
            templateName = template.name;
        }

        // Starts as draft; dispatchCampaign moves it to running/scheduled once n8n accepts it
        const status = 'draft';

        const { data: campaignRaw, error: campaignError } = await supabase
            .from('campaigns')
            .insert({
                tenant_id: TENANT_ID,
                name,
                description: description ?? null,
                status,
                template_id: template_id ?? null,
                template_name: templateName,
                template_variables: template_variables ?? {},
                segment_filters: filter ? cleanFilter(filter as ContactFilter) : (segment_filters ?? {}),
                total_contacts: (contacts ?? []).length,
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

        // Hand it to n8n right away (scheduled ones carry scheduled_at)
        let dispatch = null;
        if (send && (contacts ?? []).length > 0) {
            dispatch = await dispatchCampaign(supabase, TENANT_ID, campaign.id);
            if (dispatch.ok) campaign.status = dispatch.status;
        }

        return NextResponse.json(
            {
                campaign,
                contact_count: (contacts ?? []).length,
                // When n8n could not take it, the campaign stays as draft and can be resent
                dispatch_error: dispatch && !dispatch.ok ? dispatch.error : null,
            },
            { status: 201 }
        );
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/campaigns]', err);
        return NextResponse.json({ error: 'Error creating campaign' }, { status: 500 });
    }
}
