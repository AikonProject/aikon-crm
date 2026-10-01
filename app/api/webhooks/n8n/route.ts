import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MessageType } from '@/lib/types/database';

// ============================================================
// N8N Callback Webhook
// N8N posts here after:
//   1. Sending an outbound WhatsApp message (delivery confirmation + wa_message_id)
//   2. Processing an AI response that needs to be saved
//   3. Updating message delivery status
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

    // Verify tenant exists and authenticate via webhook secret
    const secret = request.headers.get('x-webhook-secret');
    if (secret) {
        const { data: cred } = await supabase
            .from('tenant_credentials')
            .select('n8n_webhook_secret')
            .eq('tenant_id', tenant_id)
            .maybeSingle();

        if (cred?.n8n_webhook_secret && cred.n8n_webhook_secret !== secret) {
            return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
        }
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

    if (!conversation_id || !contact_id) {
        return NextResponse.json(
            { error: 'Missing conversation_id or contact_id' },
            { status: 400 }
        );
    }

    const { data: message, error } = await supabase
        .from('messages')
        .insert({
            tenant_id,
            conversation_id,
            contact_id,
            direction: 'outbound' as const,
            content_type: (content_type ?? 'text') as MessageType,
            content: content ?? null,
            media_url: media_url ?? null,
            wa_message_id: wa_message_id ?? null,
            status: 'sent' as const,
            delivery_status: 'sent' as const,
            sender_type: 'human' as const,
            sent_by_name: sent_by_name ?? 'Agente',
            is_note: false,
        })
        .select('id')
        .single();

    if (error) {
        console.error('[n8n webhook] message_sent insert error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update conversation metadata
    await supabase
        .from('conversations')
        .update({
            last_message: content?.substring(0, 255) ?? `[${content_type ?? 'text'}]`,
            last_message_at: new Date().toISOString(),
        })
        .eq('id', conversation_id);

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

    const update: Record<string, unknown> = {
        delivery_status: status,
    };
    if (['sent', 'delivered', 'read', 'failed'].includes(status)) {
        update.status = status;
    }
    if (status === 'failed') {
        update.error_code = body.error_code ?? null;
        update.error_message = body.error_message ?? null;
    }

    const { error } = await supabase
        .from('messages')
        .update(update)
        .eq('wa_message_id', wa_message_id)
        .eq('tenant_id', tenant_id);

    if (error) {
        console.error('[n8n webhook] message_status update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ updated: true });
}

/**
 * N8N's AI generated a response and wants to save it as a bot message.
 */
async function handleAiResponse(
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
    } = body;

    if (!conversation_id || !contact_id) {
        return NextResponse.json(
            { error: 'Missing conversation_id or contact_id' },
            { status: 400 }
        );
    }

    const { data: message, error } = await supabase
        .from('messages')
        .insert({
            tenant_id,
            conversation_id,
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

    // Update conversation
    const now = new Date().toISOString();
    await supabase
        .from('conversations')
        .update({
            last_message: content?.substring(0, 255) ?? `[${content_type ?? 'text'}]`,
            last_message_at: now,
        })
        .eq('id', conversation_id);

    // Update contact's last_contacted_at
    await supabase
        .from('contacts')
        .update({ last_contacted_at: now })
        .eq('id', contact_id);

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
};
