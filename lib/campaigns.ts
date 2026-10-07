import { createAdminClient } from '@/lib/supabase/admin';

type Supabase = ReturnType<typeof createAdminClient>;

export type DispatchResult =
    | { ok: true; status: 'running' | 'scheduled'; recipients: number }
    | { ok: false; status: number; error: string };

/**
 * Hands a campaign to the tenant's n8n campaign webhook, which sends the
 * WhatsApp template to every pending recipient and reports progress back to
 * /api/webhooks/n8n (campaign_message_status / campaign_status).
 *
 * Scheduled campaigns are sent too, with scheduled_at: n8n waits until then.
 */
export async function dispatchCampaign(
    supabase: Supabase,
    tenantId: string,
    campaignId: string
): Promise<DispatchResult> {
    const { data: campaign } = await supabase
        .from('campaigns')
        .select('id, name, status, scheduled_at, template_id, template_name, template_variables')
        .eq('id', campaignId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
    if (!campaign) return { ok: false, status: 404, error: 'Campaña no encontrada.' };
    if (campaign.status === 'running' || campaign.status === 'completed' || campaign.status === 'cancelled') {
        return { ok: false, status: 409, error: 'La campaña ya fue enviada o cancelada.' };
    }

    const { data: credentials } = await supabase
        .from('tenant_credentials')
        .select('n8n_campaign_webhook, n8n_webhook_secret, phone_number_id, waba_id')
        .eq('tenant_id', tenantId)
        .maybeSingle();
    const webhookUrl = credentials?.n8n_campaign_webhook;
    if (!webhookUrl) {
        return {
            ok: false,
            status: 422,
            error: 'Falta configurar el webhook de campañas de n8n en Configuración → Integraciones.',
        };
    }

    const [{ data: template }, { data: recipients }] = await Promise.all([
        campaign.template_id
            ? supabase
                .from('message_templates')
                .select('id, name, language, category, components')
                .eq('id', campaign.template_id)
                .eq('tenant_id', tenantId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        supabase
            .from('campaign_messages')
            .select('id, contact:contacts ( id, nombre, wa_id )')
            .eq('campaign_id', campaignId)
            .eq('tenant_id', tenantId)
            .eq('status', 'pending'),
    ]);
    if (!template) return { ok: false, status: 422, error: 'La campaña no tiene una plantilla válida.' };

    type Recipient = { id: string; contact: { id: string; nombre: string; wa_id: string | null } | null };
    const withPhone = ((recipients ?? []) as unknown as Recipient[]).filter((r) => r.contact?.wa_id);
    if (withPhone.length === 0) {
        return { ok: false, status: 422, error: 'Ningún contacto del segmento tiene número de WhatsApp.' };
    }

    const payload = {
        action: 'send_campaign',
        tenant_id: tenantId,
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        scheduled_at: campaign.scheduled_at,
        phone_number_id: credentials?.phone_number_id ?? null,
        waba_id: credentials?.waba_id ?? null,
        template: {
            id: template.id,
            name: template.name,
            language: template.language,
            category: template.category,
            components: template.components,
        },
        // { "1": "valor", "2": "valor" } → {{1}}, {{2}} of the template body
        template_variables: campaign.template_variables ?? {},
        recipients: withPhone.map((r) => ({
            campaign_message_id: r.id,
            contact_id: r.contact!.id,
            name: r.contact!.nombre,
            wa_id: r.contact!.wa_id,
        })),
    };

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(credentials?.n8n_webhook_secret ? { 'x-webhook-secret': credentials.n8n_webhook_secret } : {}),
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error(`[dispatchCampaign] n8n responded ${res.status}: ${text.slice(0, 300)}`);
            return { ok: false, status: 502, error: `n8n respondió con error (${res.status}).` };
        }
    } catch (err) {
        console.error('[dispatchCampaign] n8n request failed:', err);
        return { ok: false, status: 502, error: 'No se pudo contactar el webhook de n8n.' };
    }

    // Contacts without WhatsApp number can't receive the campaign
    const skipped = ((recipients ?? []) as unknown as Recipient[]).filter((r) => !r.contact?.wa_id).map((r) => r.id);
    if (skipped.length > 0) {
        await supabase
            .from('campaign_messages')
            .update({ status: 'failed', error_message: 'Contacto sin número de WhatsApp' })
            .in('id', skipped);
    }

    const isScheduled = !!campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date();
    const status = isScheduled ? 'scheduled' : 'running';
    await supabase
        .from('campaigns')
        .update({
            status,
            started_at: isScheduled ? null : new Date().toISOString(),
            failed_count: skipped.length,
            updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
        .eq('tenant_id', tenantId);

    return { ok: true, status, recipients: withPhone.length };
}

/** Recomputes a campaign's delivery counters from its campaign_messages. */
export async function refreshCampaignCounts(supabase: Supabase, tenantId: string, campaignId: string) {
    const { data } = await supabase
        .from('campaign_messages')
        .select('status')
        .eq('campaign_id', campaignId)
        .eq('tenant_id', tenantId);
    const rows = (data ?? []) as { status: string }[];
    const count = (...statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).length;

    // A message that was read was also sent and delivered
    const sent = count('sent', 'delivered', 'read', 'replied');
    const delivered = count('delivered', 'read', 'replied');
    const read = count('read', 'replied');
    const replied = count('replied');
    const failed = count('failed');
    const pending = count('pending');

    await supabase
        .from('campaigns')
        .update({
            sent_count: sent,
            delivered_count: delivered,
            read_count: read,
            replied_count: replied,
            failed_count: failed,
            updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
        .eq('tenant_id', tenantId);

    // Nothing left to send → completed (read receipts keep updating the counters)
    if (pending === 0 && rows.length > 0) {
        await supabase
            .from('campaigns')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', campaignId)
            .eq('tenant_id', tenantId)
            .in('status', ['running', 'scheduled']);
    }
}
