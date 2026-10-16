import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyN8nRequest } from './auth';
import type { Contact } from './catalog';

type Admin = ReturnType<typeof createAdminClient>;

/** Authenticated tenant for bot calls, or the error response to return. */
export async function botAuth(request: NextRequest, tenantId: string): Promise<{ supabase: Admin } | { error: NextResponse }> {
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return { error: NextResponse.json({ ok: false, error: 'Falta tenant_id' }, { status: 400 }) };
    const supabase = createAdminClient();
    const denied = await verifyN8nRequest(supabase, request, tenantId);
    return denied ? { error: denied } : { supabase };
}

/** The customer the agent is talking to (by contact_id or WhatsApp number) and their conversation. */
export async function resolveContact(
    supabase: Admin,
    tenantId: string,
    args: { contact_id?: unknown; wa_id?: unknown; phone?: unknown; conversation_id?: unknown }
): Promise<{ contact: Contact | null; conversationId: string | null; notFound: boolean }> {
    const contactId = typeof args.contact_id === 'string' && args.contact_id ? args.contact_id : '';
    const phone = String(args.wa_id ?? args.phone ?? '').replace(/\D/g, '');
    if (!contactId && !phone) return { contact: null, conversationId: null, notFound: false };

    let q = supabase.from('contacts').select('id, nombre, wa_id, funnel_stage_id').eq('tenant_id', tenantId);
    q = contactId ? q.eq('id', contactId) : q.eq('wa_id', phone);
    const { data: contact } = await q.maybeSingle();
    if (!contact) return { contact: null, conversationId: null, notFound: true };

    let conversationId: string | null = null;
    if (typeof args.conversation_id === 'string' && args.conversation_id) {
        const { data } = await supabase.from('conversations').select('id').eq('id', args.conversation_id)
            .eq('tenant_id', tenantId).eq('contact_id', contact.id).maybeSingle();
        conversationId = data?.id ?? null;
    }
    if (!conversationId) {
        const { data } = await supabase.from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contact.id).maybeSingle();
        conversationId = data?.id ?? null;
    }
    return { contact: contact as Contact, conversationId, notFound: false };
}

/** Query string → tool args (comma lists for arrays, JSON for objects). */
export function argsFromQuery(params: URLSearchParams): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) {
        const t = v.trim();
        if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
            try { out[k] = JSON.parse(t); continue; } catch { /* plain text */ }
        }
        out[k] = v;
    }
    return out;
}
