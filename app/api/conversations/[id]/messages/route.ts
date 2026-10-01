import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

        // Verify conversation belongs to this tenant
        const { data: conv } = await supabase
            .from('conversations')
            .select('id')
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single();
        if (!conv) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching messages:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Mark conversation as read when messages are fetched
        await supabase
            .from('conversations')
            .update({ unread_count: 0 })
            .eq('id', id)
            .eq('tenant_id', TENANT_ID);

        return NextResponse.json(messages ?? []);
    } catch (err) {
        console.error('Unexpected error in GET /api/conversations/[id]/messages:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const body = await request.json();

        // Fetch conversation — MUST belong to current tenant
        type ConvWithContact = {
            id: string;
            tenant_id: string;
            contact_id: string;
            contact: { id: string; nombre: string; wa_id: string | null } | { id: string; nombre: string; wa_id: string | null }[] | null;
        };
        const convQueryResult = await (supabase
            .from('conversations')
            .select('id, tenant_id, contact_id, contact:contacts!conversations_contact_id_fkey(id, nombre, wa_id)')
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single() as unknown as Promise<{ data: ConvWithContact | null; error: unknown }>);
        const { data: conversation, error: convError } = convQueryResult;

        if (convError || !conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        const isNote = body.is_note === true;

        // Notes are saved directly to DB (they don't go through WhatsApp)
        if (isNote) {
            const { data: message, error } = await supabase
                .from('messages')
                .insert({
                    tenant_id: TENANT_ID,
                    conversation_id: id,
                    contact_id: conversation.contact_id,
                    content: body.content,
                    content_type: 'text',
                    direction: 'outbound' as const,
                    status: 'sent' as const,
                    sender_type: 'human' as const,
                    sent_by_name: body.sent_by_name ?? 'Agente',
                    is_note: true,
                })
                .select()
                .single();

            if (error) {
                console.error('Error inserting note:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            await supabase
                .from('conversations')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', id);

            return NextResponse.json(message, { status: 201 });
        }

        // Regular messages: do NOT save to DB here.
        // n8n will send via WhatsApp, get the wa_message_id, then insert into DB.
        const { data: credentials } = await supabase
            .from('tenant_credentials')
            .select('n8n_send_message_webhook')
            .eq('tenant_id', TENANT_ID)
            .maybeSingle();

        const webhookUrl = credentials?.n8n_send_message_webhook ?? undefined;
        console.log(`[messages POST] tenant_id=${TENANT_ID} webhook_url=${webhookUrl ?? 'NOT_CONFIGURED'}`);

        if (!webhookUrl) {
            console.warn(`[messages POST] n8n_send_message_webhook not configured for tenant ${TENANT_ID}`);
            return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
        }

        const contact = Array.isArray(conversation.contact)
            ? conversation.contact[0]
            : conversation.contact;

        const webhookRes = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
                tenant_id: TENANT_ID,
                conversation_id: id,
                contact_id: contact?.id,
                wa_id: contact?.wa_id,
                contact_name: contact?.nombre ?? null,
                message: body.content,
                content_type: body.content_type ?? 'text',
                media_url: body.media_url ?? null,
                sent_by_name: body.sent_by_name ?? 'Agente',
            }),
        });

        console.log(`[messages POST] webhook responded: ${webhookRes.status}`);

        if (!webhookRes.ok) {
            return NextResponse.json({ error: 'Webhook error', status: webhookRes.status }, { status: 502 });
        }

        return NextResponse.json({ queued: true }, { status: 202 });
    } catch (err) {
        console.error('Unexpected error in POST /api/conversations/[id]/messages:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
