import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MessageType } from '@/lib/types/database';

// ============================================================
// WhatsApp Cloud API Webhook
// Meta sends all inbound messages + status updates here.
// Multi-tenant: we resolve the tenant via phone_number_id.
// ============================================================

/** Meta webhook verification (GET) */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token || !challenge) {
        return new NextResponse('Bad request', { status: 400 });
    }

    // Look up any tenant whose meta_webhook_verify_token matches
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('tenant_credentials')
        .select('tenant_id')
        .eq('meta_webhook_verify_token', token)
        .limit(1)
        .maybeSingle();

    if (!data) {
        console.warn('[whatsapp webhook] Verify token mismatch');
        return new NextResponse('Forbidden', { status: 403 });
    }

    // Return challenge as plain text (Meta requirement)
    return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
    });
}

/** Receive inbound messages + status updates (POST) */
export async function POST(request: NextRequest) {
    const supabase = createAdminClient();

    let body: MetaWebhookPayload;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Meta always sends { object: 'whatsapp_business_account', entry: [...] }
    if (body.object !== 'whatsapp_business_account') {
        return NextResponse.json({ received: true }); // ignore non-WA
    }

    for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
            if (change.field !== 'messages') continue;
            const value = change.value;
            if (!value) continue;

            const phoneNumberId = value.metadata?.phone_number_id;
            if (!phoneNumberId) continue;

            // Resolve tenant by phone_number_id
            const { data: cred } = await supabase
                .from('tenant_credentials')
                .select('tenant_id')
                .eq('phone_number_id', phoneNumberId)
                .maybeSingle();

            if (!cred) {
                console.warn(`[whatsapp webhook] No tenant for phone_number_id=${phoneNumberId}`);
                continue;
            }

            const tenantId = cred.tenant_id;

            // ---- Process status updates (delivery receipts) ----
            for (const status of value.statuses ?? []) {
                await processStatus(supabase, tenantId, status);
            }

            // ---- Process inbound messages ----
            for (const msg of value.messages ?? []) {
                const contactProfile = value.contacts?.find(
                    (c: MetaContact) => c.wa_id === msg.from
                );
                await processInboundMessage(
                    supabase,
                    tenantId,
                    msg,
                    contactProfile
                );
            }
        }
    }

    // Meta expects a 200 quickly — always return OK
    return NextResponse.json({ received: true });
}

// ============================================================
// Helpers
// ============================================================

async function processStatus(
    supabase: ReturnType<typeof createAdminClient>,
    tenantId: string,
    status: MetaStatus
) {
    const deliveryMap: Record<string, string> = {
        sent: 'sent',
        delivered: 'delivered',
        read: 'read',
        failed: 'failed',
    };

    const deliveryStatus = deliveryMap[status.status];
    if (!deliveryStatus) return;

    const waMessageId = status.id;
    if (!waMessageId) return;

    const update: Record<string, unknown> = {
        delivery_status: deliveryStatus,
    };

    // Also promote message status for sent/delivered/read
    if (['sent', 'delivered', 'read'].includes(deliveryStatus)) {
        update.status = deliveryStatus;
    }
    if (deliveryStatus === 'failed') {
        update.status = 'failed';
        update.error_code = status.errors?.[0]?.code?.toString() ?? null;
        update.error_message = status.errors?.[0]?.title ?? null;
    }

    const { error } = await supabase
        .from('messages')
        .update(update)
        .eq('wa_message_id', waMessageId)
        .eq('tenant_id', tenantId);

    if (error) {
        console.error(`[whatsapp webhook] Status update failed for wa_message_id=${waMessageId}:`, error);
    }
}

async function processInboundMessage(
    supabase: ReturnType<typeof createAdminClient>,
    tenantId: string,
    msg: MetaMessage,
    contactProfile: MetaContact | undefined
) {
    const waId = msg.from; // sender phone number in international format
    if (!waId) return;

    // 1. Find or create contact
    const contactName =
        contactProfile?.profile?.name ?? waId;

    let { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('wa_id', waId)
        .maybeSingle();

    if (!contact) {
        // Create new contact — trigger auto-creates conversation
        const { data: newContact, error: insertErr } = await supabase
            .from('contacts')
            .insert({
                tenant_id: tenantId,
                nombre: contactName,
                wa_id: waId,
                source: 'whatsapp' as const,
            })
            .select('id')
            .single();

        if (insertErr) {
            console.error('[whatsapp webhook] Failed to create contact:', insertErr);
            return;
        }
        contact = newContact;
    }

    // 2. Find conversation (auto-created by trigger, or existing)
    let { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contact.id)
        .maybeSingle();

    if (!conversation) {
        // Shouldn't happen (trigger creates it), but just in case
        const { data: newConv, error: convErr } = await supabase
            .from('conversations')
            .insert({
                tenant_id: tenantId,
                contact_id: contact.id,
                channel: 'whatsapp' as const,
                status: 'open' as const,
            })
            .select('id')
            .single();

        if (convErr) {
            console.error('[whatsapp webhook] Failed to create conversation:', convErr);
            return;
        }
        conversation = newConv;
    }

    // 3. Extract message content based on type
    const { contentType, content, mediaUrl, mediaMime, mediaFilename } =
        extractMessageContent(msg);

    const now = new Date().toISOString();

    // 4. Insert into messages table (the "source of truth" for chat UI)
    const { error: msgErr } = await supabase.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversation.id,
        contact_id: contact.id,
        direction: 'inbound' as const,
        content_type: contentType as MessageType,
        content,
        media_url: mediaUrl,
        media_mime_type: mediaMime,
        media_filename: mediaFilename,
        wa_message_id: msg.id,
        status: 'delivered' as const,
        sender_type: 'contact' as const,
        is_note: false,
    });

    if (msgErr) {
        console.error('[whatsapp webhook] Failed to insert message:', msgErr);
    }

    // 5. Insert into message_buffer for AI processing
    const { error: bufErr } = await supabase.from('message_buffer').insert({
        tenant_id: tenantId,
        conversation_id: conversation.id,
        contact_id: contact.id,
        wa_message_id: msg.id,
        content,
        content_type: contentType,
        media_url: mediaUrl,
        media_mime_type: mediaMime,
        media_filename: mediaFilename,
        raw_payload: msg as unknown as Record<string, unknown>,
        status: 'pending' as const,
    });

    if (bufErr) {
        console.error('[whatsapp webhook] Failed to insert message_buffer:', bufErr);
    }

    // 6. Update conversation metadata (atomic unread_count increment)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcErr } = await (supabase.rpc as any)('increment_unread', {
        p_conversation_id: conversation.id,
        p_last_message: content?.substring(0, 255) ?? `[${contentType}]`,
        p_last_message_at: now,
    });
    if (rpcErr) {
        // Fallback: non-atomic update if RPC doesn't exist yet
        await supabase
            .from('conversations')
            .update({
                last_message: content?.substring(0, 255) ?? `[${contentType}]`,
                last_message_at: now,
                status: 'open',
            })
            .eq('id', conversation.id);
    }

    // Update contact's last_incoming_at
    await supabase
        .from('contacts')
        .update({ last_incoming_at: now })
        .eq('id', contact.id);
}

function extractMessageContent(msg: MetaMessage): {
    contentType: string;
    content: string | null;
    mediaUrl: string | null;
    mediaMime: string | null;
    mediaFilename: string | null;
} {
    switch (msg.type) {
        case 'text':
            return {
                contentType: 'text',
                content: msg.text?.body ?? null,
                mediaUrl: null,
                mediaMime: null,
                mediaFilename: null,
            };
        case 'image':
            return {
                contentType: 'image',
                content: msg.image?.caption ?? null,
                mediaUrl: msg.image?.id ?? null, // Media ID — resolve via Meta API
                mediaMime: msg.image?.mime_type ?? null,
                mediaFilename: null,
            };
        case 'audio':
            return {
                contentType: 'audio',
                content: null,
                mediaUrl: msg.audio?.id ?? null,
                mediaMime: msg.audio?.mime_type ?? null,
                mediaFilename: null,
            };
        case 'video':
            return {
                contentType: 'video',
                content: msg.video?.caption ?? null,
                mediaUrl: msg.video?.id ?? null,
                mediaMime: msg.video?.mime_type ?? null,
                mediaFilename: null,
            };
        case 'document':
            return {
                contentType: 'document',
                content: msg.document?.caption ?? null,
                mediaUrl: msg.document?.id ?? null,
                mediaMime: msg.document?.mime_type ?? null,
                mediaFilename: msg.document?.filename ?? null,
            };
        case 'sticker':
            return {
                contentType: 'sticker',
                content: null,
                mediaUrl: msg.sticker?.id ?? null,
                mediaMime: msg.sticker?.mime_type ?? null,
                mediaFilename: null,
            };
        case 'location':
            return {
                contentType: 'location',
                content: msg.location
                    ? `${msg.location.latitude},${msg.location.longitude}`
                    : null,
                mediaUrl: null,
                mediaMime: null,
                mediaFilename: null,
            };
        case 'reaction':
            return {
                contentType: 'reaction',
                content: msg.reaction?.emoji ?? null,
                mediaUrl: null,
                mediaMime: null,
                mediaFilename: null,
            };
        default:
            return {
                contentType: msg.type ?? 'unknown',
                content: null,
                mediaUrl: null,
                mediaMime: null,
                mediaFilename: null,
            };
    }
}

// ============================================================
// Meta webhook types (subset)
// ============================================================

type MetaWebhookPayload = {
    object: string;
    entry?: MetaEntry[];
};

type MetaEntry = {
    id: string;
    changes?: MetaChange[];
};

type MetaChange = {
    field: string;
    value?: MetaChangeValue;
};

type MetaChangeValue = {
    messaging_product: string;
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    contacts?: MetaContact[];
    messages?: MetaMessage[];
    statuses?: MetaStatus[];
};

type MetaContact = {
    wa_id: string;
    profile?: { name?: string };
};

type MetaMessage = {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; caption?: string; mime_type?: string };
    audio?: { id: string; mime_type?: string };
    video?: { id: string; caption?: string; mime_type?: string };
    document?: { id: string; caption?: string; mime_type?: string; filename?: string };
    sticker?: { id: string; mime_type?: string };
    location?: { latitude: number; longitude: number; name?: string; address?: string };
    reaction?: { message_id: string; emoji: string };
};

type MetaStatus = {
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
    errors?: { code: number; title: string }[];
};
