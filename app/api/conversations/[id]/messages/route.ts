import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import { n8nHeaders } from '@/lib/n8n';
import { getActorName } from '@/lib/activity';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('chat');

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
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
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
    const TENANT_ID = await requireModule('chat');
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
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        const senderName = await getActorName();

        // Notes are saved directly (they never go to WhatsApp). They also go to
        // contact_notes so they show in the contact panel and the contact page.
        if (isNote) {
            if (!content) return NextResponse.json({ error: 'La nota está vacía.' }, { status: 400 });

            const { data: message, error } = await supabase
                .from('messages')
                .insert({
                    tenant_id: TENANT_ID,
                    conversation_id: id,
                    contact_id: conversation.contact_id,
                    content,
                    content_type: 'text',
                    direction: 'outbound' as const,
                    status: 'sent' as const,
                    sender_type: 'human' as const,
                    sent_by_name: senderName,
                    is_note: true,
                })
                .select()
                .single();

            if (error) {
                console.error('Error inserting note:', error);
                return NextResponse.json({ error: 'No se pudo guardar la nota.' }, { status: 500 });
            }

            const { error: noteError } = await supabase.from('contact_notes').insert({
                tenant_id: TENANT_ID,
                contact_id: conversation.contact_id,
                content,
                created_by: null,
            });
            if (noteError) console.error('Error mirroring note to contact_notes:', noteError);

            return NextResponse.json(message, { status: 201 });
        }

        // Template messages: validated here, sent by n8n (works outside the 24h window)
        const isTemplate = body.content_type === 'template';
        let template: { id: string; name: string; language: string; components: unknown } | null = null;
        let renderedTemplate = '';
        let templateHeader: { format: string; url: string | null } | null = null;
        const templateVariables: Record<string, string> = body.template_variables ?? {};
        if (isTemplate) {
            const { data } = await supabase
                .from('message_templates')
                .select('id, name, language, components, status')
                .eq('id', body.template_id)
                .eq('tenant_id', TENANT_ID)
                .maybeSingle();
            if (!data) return NextResponse.json({ error: 'Plantilla no encontrada.' }, { status: 404 });
            if (data.status !== 'APPROVED') {
                return NextResponse.json({ error: 'La plantilla aún no está aprobada por Meta.' }, { status: 422 });
            }
            template = { id: data.id, name: data.name, language: data.language, components: data.components };
            const bodyText = (data.components as Array<{ type: string; text?: string }> | null)
                ?.find((c) => c.type === 'BODY')?.text ?? '';
            renderedTemplate = bodyText.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => templateVariables[k] ?? m);
            // Media header (image / video / PDF): sent with the sample file uploaded when the template was created
            const h = (data.components as Array<{ type: string; format?: string; example?: { header_url?: string[]; header_handle?: string[] } }> | null)
                ?.find((c) => c.type === 'HEADER');
            if (h && h.format && h.format !== 'TEXT') {
                templateHeader = { format: h.format, url: h.example?.header_url?.[0] ?? h.example?.header_handle?.[0] ?? null };
            }
        } else if (!content && !body.media_url) {
            return NextResponse.json({ error: 'El mensaje está vacío.' }, { status: 400 });
        }

        // Regular messages: do NOT save to DB here.
        // n8n sends via WhatsApp and reports back (message_sent), which inserts the message.
        const { data: credentials } = await supabase
            .from('tenant_credentials')
            .select('n8n_send_message_webhook, n8n_webhook_secret')
            .eq('tenant_id', TENANT_ID)
            .maybeSingle();

        const webhookUrl = credentials?.n8n_send_message_webhook ?? undefined;
        if (!webhookUrl) {
            return NextResponse.json(
                { error: 'Falta configurar el webhook de mensajes de n8n en Configuración → Integraciones.' },
                { status: 503 }
            );
        }

        const contact = Array.isArray(conversation.contact)
            ? conversation.contact[0]
            : conversation.contact;
        if (!contact?.wa_id) {
            return NextResponse.json({ error: 'El contacto no tiene número de WhatsApp.' }, { status: 422 });
        }

        let webhookRes: Response;
        try {
            webhookRes = await fetch(webhookUrl, {
                method: 'POST',
                headers: n8nHeaders(credentials?.n8n_webhook_secret),
                signal: AbortSignal.timeout(10000),
                body: JSON.stringify({
                    action: 'send_message',
                    tenant_id: TENANT_ID,
                    conversation_id: id,
                    contact_id: contact.id,
                    wa_id: contact.wa_id,
                    contact_name: contact.nombre ?? null,
                    message: isTemplate ? renderedTemplate : content,
                    content_type: isTemplate ? 'template' : (body.content_type ?? 'text'),
                    media_url: isTemplate ? (templateHeader?.url ?? null) : (body.media_url ?? null),
                    media_filename: body.media_filename ?? null,
                    sent_by_name: senderName,
                    template: template ? { name: template.name, language: template.language, components: template.components } : null,
                    template_variables: isTemplate ? templateVariables : null,
                    template_header: templateHeader,
                }),
            });
        } catch {
            return NextResponse.json({ error: 'No se pudo contactar a n8n. El mensaje no se envió.' }, { status: 502 });
        }

        if (!webhookRes.ok) {
            return NextResponse.json(
                { error: `n8n respondió con error (${webhookRes.status}). El mensaje no se envió.` },
                { status: 502 }
            );
        }

        return NextResponse.json({ queued: true }, { status: 202 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('Unexpected error in POST /api/conversations/[id]/messages:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
