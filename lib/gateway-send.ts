import { createAdminClient } from '@/lib/supabase/admin';
import { n8nHeaders } from '@/lib/n8n';

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * Sends a text message through the tenant's n8n gateway (action send_message),
 * the same path an agent's message takes. n8n reports back with message_sent.
 */
export async function sendTextViaGateway(
    supabase: Supabase,
    tenantId: string,
    msg: { conversationId: string; contactId: string; waId: string; contactName?: string | null; text: string; sentByName: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data: credentials } = await supabase
        .from('tenant_credentials')
        .select('n8n_send_message_webhook, n8n_webhook_secret')
        .eq('tenant_id', tenantId)
        .maybeSingle();
    const url = credentials?.n8n_send_message_webhook;
    if (!url) return { ok: false, error: 'Webhook de mensajes de n8n no configurado' };
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: n8nHeaders(credentials?.n8n_webhook_secret),
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
                action: 'send_message',
                tenant_id: tenantId,
                conversation_id: msg.conversationId,
                contact_id: msg.contactId,
                wa_id: msg.waId,
                contact_name: msg.contactName ?? null,
                message: msg.text,
                content_type: 'text',
                media_url: null,
                sent_by_name: msg.sentByName,
            }),
        });
        return res.ok ? { ok: true } : { ok: false, error: `n8n respondió ${res.status}` };
    } catch {
        return { ok: false, error: 'No se pudo contactar a n8n' };
    }
}
