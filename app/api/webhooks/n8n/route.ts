import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MessageType } from '@/lib/types/database';
import { refreshCampaignCounts } from '@/lib/campaigns';
import { logActivity } from '@/lib/activity';
import { getTenantConfig, hasModule } from '@/lib/tenant-plan';
import { APPOINTMENT_SELECT } from '@/lib/appointments';
import { buildAppointmentFields, formatWhen, ValidationError } from '@/app/api/appointments/shared';

// ============================================================
// N8N Callback Webhook
// N8N posts here after:
//   1. Sending an outbound WhatsApp message (delivery confirmation + wa_message_id)
//   2. Processing an AI response that needs to be saved
//   3. Updating message delivery status
//   4. Reporting campaign progress (campaign_message_status / campaign_status)
//   5. Receiving inbound messages from any WhatsApp provider (inbound_message)
//   6. Pushing the provider's template list (templates_sync)
//
// The CRM is the only writer to Supabase: n8n never needs database keys.
// Contract: docs/n8n-contrato.md
// ============================================================

export async function POST(request: NextRequest) {
    const supabase = createAdminClient();

    let body: N8NPayload;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { tenant_id, action } = body;
    if (!tenant_id || !action) {
        return NextResponse.json(
            { error: 'Missing tenant_id or action' },
            { status: 400 }
        );
    }

    // Authenticate via webhook secret: once a tenant configures one, every
    // call must carry it. Tenants without a secret are still accepted (legacy).
    const secret = request.headers.get('x-webhook-secret');
    const { data: cred } = await supabase
        .from('tenant_credentials')
        .select('n8n_webhook_secret')
        .eq('tenant_id', tenant_id)
        .maybeSingle();

    if (cred?.n8n_webhook_secret) {
        if (secret !== cred.n8n_webhook_secret) {
            return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
        }
    } else {
        console.warn(`[n8n webhook] tenant ${tenant_id} has no n8n_webhook_secret: request not authenticated`);
    }

    try {
        switch (action) {
            case 'message_sent':
                return await handleMessageSent(supabase, body);
            case 'message_status':
                return await handleMessageStatus(supabase, body);
            case 'ai_response':
                return await handleAiResponse(supabase, body);
            case 'buffer_processed':
                return await handleBufferProcessed(supabase, body);
            case 'campaign_message_status':
                return await handleCampaignMessageStatus(supabase, body);
            case 'campaign_status':
                return await handleCampaignStatus(supabase, body);
            case 'inbound_message':
                return await handleInboundMessage(supabase, body);
            case 'templates_sync':
                return await handleTemplatesSync(supabase, body);
            case 'ai_note':
                return await handleAiNote(supabase, body);
            case 'activity':
                return await handleActivity(supabase, body);
            case 'appointment':
                return await handleAppointment(supabase, body);
            default:
                return NextResponse.json(
                    { error: `Unknown action: ${action}` },
                    { status: 400 }
                );
        }
    } catch (err) {
        console.error('[n8n webhook] Unexpected error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// ============================================================
// Action handlers
// ============================================================

/**
 * N8N confirms it sent a message via WhatsApp and returns the wa_message_id.
 * The CRM originally queued this message (POST /api/conversations/[id]/messages),
 * so now we insert it into the messages table with the real wa_message_id.
 */
async function handleMessageSent(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const {
        tenant_id,
        conversation_id,
        contact_id,
        wa_message_id,
        content,
        content_type,
        media_url,
        sent_by_name,
    } = body;

    if (!contact_id) {
        return NextResponse.json({ error: 'Missing contact_id' }, { status: 400 });
    }
    // Messages not started from a chat (e.g. reservation confirmations) only know the contact
    const conversationId = conversation_id
        ?? (await getOrCreateConversation(supabase, tenant_id, contact_id))?.id;
    if (!conversationId) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 400 });
    }

    // The provider rejected the message: keep it in the chat as failed
    const failed = body.status === 'failed';

    // Retries from n8n must not duplicate the message
    if (wa_message_id) {
        const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('wa_message_id', wa_message_id)
            .maybeSingle();
        if (existing) return NextResponse.json({ message_id: existing.id, duplicate: true });
    }

    // Conversation summary and contact timestamps are updated by DB triggers
    const { data: message, error } = await supabase
        .from('messages')
        .insert({
            tenant_id,
            conversation_id: conversationId,
            contact_id,
            direction: 'outbound' as const,
            content_type: (content_type ?? 'text') as MessageType,
            content: content ?? null,
            media_url: media_url ?? null,
            wa_message_id: wa_message_id ?? null,
            status: failed ? 'failed' as const : 'sent' as const,
            delivery_status: failed ? 'failed' as const : 'sent' as const,
            error_code: failed ? body.error_code ?? null : null,
            error_message: failed ? body.error_message ?? null : null,
            sender_type: 'human' as const,
            sent_by_name: sent_by_name ?? 'Agente',
            template_name: body.template_name ?? null,
            is_note: false,
        })
        .select('id')
        .single();

    if (error) {
        console.error('[n8n webhook] message_sent insert error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message_id: message.id }, { status: 201 });
}

/**
 * Delivery status update for a specific wa_message_id.
 */
async function handleMessageStatus(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const { tenant_id, wa_message_id, status } = body;

    if (!wa_message_id || !status) {
        return NextResponse.json(
            { error: 'Missing wa_message_id or status' },
            { status: 400 }
        );
    }

    if (!STATUS_RANK[status]) {
        return NextResponse.json(
            { error: 'Invalid status (sent, delivered, read, failed)' },
            { status: 400 }
        );
    }

    const update: Record<string, unknown> = {
        delivery_status: status,
        status,
    };
    if (status === 'failed') {
        update.error_code = body.error_code ?? null;
        update.error_message = body.error_message ?? null;
    }

    // Providers can deliver receipts out of order: never go back (read → delivered)
    const { data: updated, error } = await supabase
        .from('messages')
        .update(update)
        .eq('wa_message_id', wa_message_id)
        .eq('tenant_id', tenant_id)
        .not('status', 'in', `(${higherStatuses(status).join(',')})`)
        .select('id');

    if (error) {
        console.error('[n8n webhook] message_status update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // The same receipt may belong to a campaign message
    const campaignUpdate: Record<string, unknown> = { status };
    const now = new Date().toISOString();
    if (status === 'delivered') campaignUpdate.delivered_at = now;
    if (status === 'read') campaignUpdate.read_at = now;
    if (status === 'failed') {
        campaignUpdate.error_code = body.error_code ?? null;
        campaignUpdate.error_message = body.error_message ?? null;
    }
    const { data: campaignMessages } = await supabase
        .from('campaign_messages')
        .update(campaignUpdate)
        .eq('wa_message_id', wa_message_id)
        .eq('tenant_id', tenant_id)
        .not('status', 'in', `(${[...higherStatuses(status), 'replied'].join(',')})`)
        .select('campaign_id');
    const campaignIds = [...new Set((campaignMessages ?? []).map((m) => m.campaign_id as string))];
    await Promise.all(campaignIds.map((id) => refreshCampaignCounts(supabase, tenant_id, id)));

    return NextResponse.json({ updated: (updated ?? []).length, campaign_messages: (campaignMessages ?? []).length });
}

/**
 * N8N's AI generated a response and wants to save it as a bot message.
 */
async function handleAiResponse(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const { tenant_id, conversation_id, contact_id, wa_message_id, content, content_type } = body;

    if (!contact_id) {
        return NextResponse.json({ error: 'Missing contact_id' }, { status: 400 });
    }
    const conversationId = conversation_id
        ?? (await getOrCreateConversation(supabase, tenant_id, contact_id))?.id;
    if (!conversationId) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 400 });
    }

    // Retries from n8n must not duplicate the bot's reply
    if (wa_message_id) {
        const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('wa_message_id', wa_message_id)
            .maybeSingle();
        if (existing) return NextResponse.json({ message_id: existing.id, duplicate: true });
    }

    // Conversation summary and contact timestamps are updated by DB triggers
    const { data: message, error } = await supabase
        .from('messages')
        .insert({
            tenant_id,
            conversation_id: conversationId,
            contact_id,
            direction: 'outbound' as const,
            content_type: (content_type ?? 'text') as MessageType,
            content: content ?? null,
            wa_message_id: wa_message_id ?? null,
            status: 'sent' as const,
            delivery_status: 'sent' as const,
            sender_type: 'bot' as const,
            sent_by_name: 'AI Bot',
            is_note: false,
        })
        .select('id')
        .single();

    if (error) {
        console.error('[n8n webhook] ai_response insert error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message_id: message.id }, { status: 201 });
}

/**
 * Mark a message_buffer entry as processed (or failed).
 */
async function handleBufferProcessed(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const { buffer_id, status } = body;

    if (!buffer_id) {
        return NextResponse.json(
            { error: 'Missing buffer_id' },
            { status: 400 }
        );
    }

    const finalStatus = status === 'failed' ? 'failed' : 'processed';

    const { error } = await supabase
        .from('message_buffer')
        .update({
            status: finalStatus,
            processed_at: new Date().toISOString(),
        })
        .eq('id', buffer_id);

    if (error) {
        console.error('[n8n webhook] buffer_processed update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ updated: true });
}

/**
 * Progress of one campaign recipient: sent / delivered / read / replied / failed.
 * Identified by campaign_message_id (preferred) or by wa_message_id once known.
 */
async function handleCampaignMessageStatus(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const { tenant_id, campaign_message_id, wa_message_id, status } = body;
    const VALID = ['sent', 'delivered', 'read', 'replied', 'failed'];

    if ((!campaign_message_id && !wa_message_id) || !status || !VALID.includes(status)) {
        return NextResponse.json(
            { error: `Missing campaign_message_id/wa_message_id or invalid status (${VALID.join(', ')})` },
            { status: 400 }
        );
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status };
    if (wa_message_id) update.wa_message_id = wa_message_id;
    if (status === 'sent') update.sent_at = now;
    if (status === 'delivered') update.delivered_at = now;
    if (status === 'read') update.read_at = now;
    if (status === 'replied') update.replied_at = now;
    if (status === 'failed') {
        update.error_code = body.error_code ?? null;
        update.error_message = body.error_message ?? null;
    }

    let query = supabase.from('campaign_messages').update(update).eq('tenant_id', tenant_id);
    query = campaign_message_id ? query.eq('id', campaign_message_id) : query.eq('wa_message_id', wa_message_id!);
    const { data, error } = await query.select('campaign_id');

    if (error) {
        console.error('[n8n webhook] campaign_message_status update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const campaignIds = [...new Set((data ?? []).map((m) => m.campaign_id as string))];
    await Promise.all(campaignIds.map((id) => refreshCampaignCounts(supabase, tenant_id, id)));

    // First send: show the template in the contact's chat
    if (status === 'sent' && wa_message_id && campaign_message_id) {
        await insertCampaignChatMessage(supabase, tenant_id, campaign_message_id, wa_message_id);
    }

    return NextResponse.json({ updated: (data ?? []).length });
}

/** Campaign-level status from n8n: running (started), completed or cancelled. */
async function handleCampaignStatus(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const { tenant_id, campaign_id, status } = body;
    if (!campaign_id || !status || !['running', 'completed', 'cancelled'].includes(status)) {
        return NextResponse.json(
            { error: 'Missing campaign_id or invalid status (running, completed, cancelled)' },
            { status: 400 }
        );
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status, updated_at: now };
    if (status === 'running') update.started_at = now;
    if (status === 'completed') update.completed_at = now;

    const { error } = await supabase
        .from('campaigns')
        .update(update)
        .eq('id', campaign_id)
        .eq('tenant_id', tenant_id);
    if (error) {
        console.error('[n8n webhook] campaign_status update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await refreshCampaignCounts(supabase, tenant_id, campaign_id);
    return NextResponse.json({ updated: true });
}

/**
 * A customer wrote on WhatsApp (any provider). Creates the contact and
 * conversation if needed, stores the message and tells n8n whether the bot
 * should answer (conversation and contact AI switches).
 */
async function handleInboundMessage(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const { tenant_id, wa_id, wa_message_id } = body;
    if (!wa_id) return NextResponse.json({ error: 'Missing wa_id' }, { status: 400 });

    const phone = String(wa_id).replace(/\D/g, '');
    const contentType = (body.content_type ?? 'text') as MessageType;

    // 1. Contact (a trigger creates its conversation)
    let { data: contact } = await supabase
        .from('contacts')
        .select('id, ai_active')
        .eq('tenant_id', tenant_id)
        .eq('wa_id', phone)
        .maybeSingle();
    if (!contact) {
        const { data: created, error } = await supabase
            .from('contacts')
            .insert({
                tenant_id,
                nombre: body.contact_name?.trim() || phone,
                wa_id: phone,
                source: 'whatsapp' as const,
            })
            .select('id, ai_active')
            .single();
        if (error || !created) {
            console.error('[n8n webhook] inbound_message contact error:', error);
            return NextResponse.json({ error: error?.message ?? 'Contact error' }, { status: 500 });
        }
        contact = created;
    }

    const conversation = await getOrCreateConversation(supabase, tenant_id, contact.id);
    if (!conversation) {
        return NextResponse.json({ error: 'Conversation error' }, { status: 500 });
    }

    // 2. Message (idempotent on the provider's message id)
    let messageId: string | null = null;
    let duplicate = false;
    if (wa_message_id) {
        const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('wa_message_id', wa_message_id)
            .maybeSingle();
        if (existing) { messageId = existing.id; duplicate = true; }
    }
    if (!messageId) {
        const { data: message, error } = await supabase
            .from('messages')
            .insert({
                tenant_id,
                conversation_id: conversation.id,
                contact_id: contact.id,
                direction: 'inbound' as const,
                content_type: contentType,
                content: body.content ?? null,
                media_url: body.media_url ?? null,
                media_mime_type: body.media_mime_type ?? null,
                media_filename: body.media_filename ?? null,
                wa_message_id: wa_message_id ?? null,
                status: 'delivered' as const,
                sender_type: 'contact' as const,
                is_note: false,
            })
            .select('id, conversation_id')
            .single();
        if (error || !message) {
            console.error('[n8n webhook] inbound_message insert error:', error);
            return NextResponse.json({ error: error?.message ?? 'Message error' }, { status: 500 });
        }
        messageId = message.id;
    }

    // A resolved conversation reopens when the customer writes again
    if (conversation.status !== 'open' && !duplicate) {
        await supabase.from('conversations').update({ status: 'open' }).eq('id', conversation.id);
    }

    // A reply to a campaign counts as "replied"
    if (!duplicate) {
        const { data: replied } = await supabase
            .from('campaign_messages')
            .update({ status: 'replied', replied_at: new Date().toISOString() })
            .eq('tenant_id', tenant_id)
            .eq('contact_id', contact.id)
            .in('status', ['sent', 'delivered', 'read'])
            .select('campaign_id');
        const campaignIds = [...new Set((replied ?? []).map((m) => m.campaign_id as string))];
        await Promise.all(campaignIds.map((id) => refreshCampaignCounts(supabase, tenant_id, id)));
    }

    return NextResponse.json({
        message_id: messageId,
        duplicate,
        contact_id: contact.id,
        conversation_id: conversation.id,
        // n8n only forwards to the bot when this is true
        ai_enabled: !duplicate && (conversation.ai_enabled ?? true) && (contact.ai_active ?? true),
    }, { status: duplicate ? 200 : 201 });
}

/** The provider's full template list (from n8n's sync workflow). */
async function handleTemplatesSync(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const templates = body.templates;
    if (!Array.isArray(templates)) {
        return NextResponse.json({ error: 'Missing templates array' }, { status: 400 });
    }

    const STATUSES = ['APPROVED', 'PENDING', 'REJECTED'] as const;
    type Status = (typeof STATUSES)[number];
    const rows = templates
        .filter((t) => t?.name)
        .map((t) => ({
            tenant_id: body.tenant_id,
            name: t.name,
            language: t.language ?? 'es',
            category: t.category ?? null,
            components: t.components ?? [],
            meta_id: t.id ?? null,
            // PAUSED / DISABLED / IN_APPEAL… can't be sent → pending
            status: (STATUSES as readonly string[]).includes(String(t.status).toUpperCase())
                ? (String(t.status).toUpperCase() as Status)
                : ('PENDING' as Status),
            updated_at: new Date().toISOString(),
        }));

    if (rows.length > 0) {
        const { error } = await supabase
            .from('message_templates')
            .upsert(rows, { onConflict: 'tenant_id,name,language' });
        if (error) {
            console.error('[n8n webhook] templates_sync upsert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    return NextResponse.json({ synced: rows.length });
}

/**
 * A note written by the AI (e.g. "the customer wants a quote for 20 people").
 * Shown in the chat (as an AI note) and in the contact's notes.
 */
async function handleAiNote(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const { tenant_id, contact_id, content } = body;
    if (!contact_id || !content?.trim()) {
        return NextResponse.json({ error: 'Missing contact_id or content' }, { status: 400 });
    }
    const { data: contact } = await supabase
        .from('contacts').select('id').eq('id', contact_id).eq('tenant_id', tenant_id).maybeSingle();
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    const conversation = body.conversation_id
        ? { id: body.conversation_id }
        : await getOrCreateConversation(supabase, tenant_id, contact_id);
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 400 });

    const { data: message, error } = await supabase
        .from('messages')
        .insert({
            tenant_id,
            conversation_id: conversation.id,
            contact_id,
            direction: 'outbound' as const,
            content_type: 'text' as MessageType,
            content: content.trim(),
            status: 'sent' as const,
            sender_type: 'bot' as const,
            sent_by_name: 'IA',
            is_note: true,
        })
        .select('id')
        .single();
    if (error) {
        console.error('[n8n webhook] ai_note insert error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await supabase.from('contact_notes').insert({
        tenant_id, contact_id, content: `🤖 ${content.trim()}`, created_by: null,
    });
    return NextResponse.json({ message_id: message.id }, { status: 201 });
}

/** An action done by the AI or an automation (e.g. "Creó una reserva para el 12/10"). */
async function handleActivity(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const { tenant_id, contact_id, description } = body;
    if (!contact_id || !description?.trim()) {
        return NextResponse.json({ error: 'Missing contact_id or description' }, { status: 400 });
    }
    const { data: contact } = await supabase
        .from('contacts').select('id').eq('id', contact_id).eq('tenant_id', tenant_id).maybeSingle();
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    await logActivity(supabase, {
        tenantId: tenant_id,
        contactId: contact_id,
        type: body.activity_type ?? 'ai_action',
        description: description.trim(),
        performedByName: body.performed_by_name ?? 'IA',
        channel: 'n8n',
    });
    return NextResponse.json({ logged: true }, { status: 201 });
}

/**
 * The bot schedules, reschedules, confirms or cancels an appointment.
 * appointment: { id?, contact_id? | contact_phone?, title?, start_time, end_time, meeting_type?,
 *                meeting_url?, location?, contact_name?, contact_email?, status?, notes?, description? }
 */
async function handleAppointment(
    supabase: ReturnType<typeof createAdminClient>,
    body: N8NPayload
) {
    const { tenant_id } = body;
    const input = body.appointment;
    if (!input || typeof input !== 'object') {
        return NextResponse.json({ error: 'Missing appointment' }, { status: 400 });
    }
    if (!hasModule(await getTenantConfig(tenant_id), 'appointments')) {
        return NextResponse.json({ error: 'El plan del tenant no incluye citas' }, { status: 403 });
    }
    if (!input.contact_id && body.contact_id) input.contact_id = body.contact_id;

    try {
        const isUpdate = typeof input.id === 'string' && input.id.length > 0;
        let before: { id: string; title: string; start_time: string; contact_id: string | null } | null = null;
        if (isUpdate) {
            const { data } = await supabase.from('appointments').select('id, title, start_time, contact_id')
                .eq('id', input.id as string).eq('tenant_id', tenant_id).maybeSingle();
            if (!data) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
            before = data;
        }
        const { fields, contact } = await buildAppointmentFields(supabase, tenant_id, input, isUpdate);
        const start = (fields.start_time as string | undefined) ?? before?.start_time;

        let result;
        if (isUpdate) {
            result = await supabase.from('appointments').update(fields as never)
                .eq('id', input.id as string).eq('tenant_id', tenant_id).select(APPOINTMENT_SELECT).single();
        } else {
            if (new Date(fields.end_time as string) <= new Date(fields.start_time as string)) {
                return NextResponse.json({ error: 'end_time must be after start_time' }, { status: 400 });
            }
            result = await supabase.from('appointments')
                .insert({ ...fields, tenant_id, created_by: 'IA' } as never)
                .select(APPOINTMENT_SELECT).single();
        }
        if (result.error) {
            console.error('[n8n webhook] appointment error:', result.error);
            return NextResponse.json({ error: result.error.message }, { status: 500 });
        }
        const saved = result.data as unknown as { id: string; title: string; status: string; contact_id: string | null };
        const contactId = saved.contact_id ?? contact?.id ?? before?.contact_id;
        if (contactId) {
            await logActivity(supabase, {
                tenantId: tenant_id,
                contactId,
                type: isUpdate ? 'appointment_updated' : 'appointment_created',
                description: isUpdate
                    ? `IA actualizó la cita "${saved.title}" (${start ? formatWhen(start) : ''})`
                    : `IA agendó "${saved.title}" para el ${formatWhen(start as string)}`,
                performedByName: 'IA',
                channel: 'n8n',
                metadata: { appointment_id: saved.id },
            });
        }
        return NextResponse.json({ appointment: result.data }, { status: isUpdate ? 200 : 201 });
    } catch (err) {
        if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: err.status });
        throw err;
    }
}

// ============================================================
// Helpers
// ============================================================

/** Contacts get a conversation from a DB trigger; create it if it's missing. */
async function getOrCreateConversation(
    supabase: ReturnType<typeof createAdminClient>,
    tenantId: string,
    contactId: string
): Promise<{ id: string; ai_enabled: boolean; status: string } | null> {
    const find = () => supabase
        .from('conversations')
        .select('id, ai_enabled, status')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .maybeSingle();

    const { data } = await find();
    if (data) return data;

    const { error } = await supabase
        .from('conversations')
        .insert({ tenant_id: tenantId, contact_id: contactId, channel: 'whatsapp' as const, status: 'open' as const });
    // 23505: created concurrently (unique tenant_id + contact_id)
    if (error && error.code !== '23505') {
        console.error('[n8n webhook] conversation create error:', error);
        return null;
    }
    return (await find()).data;
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 1 };

/** Statuses a message must not be moved back from when `status` arrives. */
function higherStatuses(status: string): string[] {
    if (status === 'failed') return ['delivered', 'read'];
    return Object.keys(STATUS_RANK).filter((s) => s !== 'failed' && STATUS_RANK[s] > STATUS_RANK[status]);
}

/** Inserts the campaign template into the contact's chat once it was sent. */
async function insertCampaignChatMessage(
    supabase: ReturnType<typeof createAdminClient>,
    tenantId: string,
    campaignMessageId: string,
    waMessageId: string
) {
    const { data: existing } = await supabase
        .from('messages')
        .select('id')
        .eq('wa_message_id', waMessageId)
        .maybeSingle();
    if (existing) return;

    const { data: cm } = await supabase
        .from('campaign_messages')
        .select('contact_id, campaign:campaigns ( template_name, template_variables, template:message_templates ( components ) )')
        .eq('id', campaignMessageId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
    if (!cm) return;

    type Joined = {
        contact_id: string;
        campaign: {
            template_name: string | null;
            template_variables: Record<string, string> | null;
            template: { components: { type: string; text?: string }[] | null } | null;
        } | null;
    };
    const row = cm as unknown as Joined;
    const conversation = await getOrCreateConversation(supabase, tenantId, row.contact_id);
    if (!conversation) return;
    const variables = row.campaign?.template_variables ?? {};
    const bodyText = row.campaign?.template?.components?.find((c) => c.type === 'BODY')?.text ?? '';
    const rendered = bodyText.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);

    const { error } = await supabase.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversation.id,
        contact_id: row.contact_id,
        direction: 'outbound' as const,
        content_type: 'template' as const,
        content: rendered || null,
        template_name: row.campaign?.template_name ?? null,
        template_vars: variables,
        wa_message_id: waMessageId,
        status: 'sent' as const,
        delivery_status: 'sent' as const,
        sender_type: 'bot' as const,
        sent_by_name: 'Campaña',
        is_note: false,
    });
    if (error && error.code !== '23505') {
        console.error('[n8n webhook] campaign chat message error:', error);
    }
}

// ============================================================
// Types
// ============================================================

type N8NPayload = {
    tenant_id: string;
    action: string;
    // message_sent / ai_response
    conversation_id?: string;
    contact_id?: string;
    wa_message_id?: string;
    content?: string;
    content_type?: string;
    media_url?: string;
    sent_by_name?: string;
    // message_status
    status?: string;
    error_code?: string;
    error_message?: string;
    // buffer_processed
    buffer_id?: string;
    // campaign_message_status / campaign_status
    campaign_id?: string;
    campaign_message_id?: string;
    // inbound_message
    wa_id?: string;
    contact_name?: string;
    media_mime_type?: string;
    media_filename?: string;
    // ai_note / activity
    description?: string;
    activity_type?: string;
    performed_by_name?: string;
    // message_sent (templates)
    template_name?: string;
    // appointment (create when no appointment.id, update otherwise)
    appointment?: Record<string, unknown> & { id?: string };
    // templates_sync
    templates?: { id?: string; name: string; language?: string; category?: string; status?: string; components?: unknown }[];
};
