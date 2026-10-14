import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyN8nRequest } from '@/lib/bot/auth';
import { runTool, TOOL_NAMES } from '@/lib/bot/tools';

/**
 * CRM tools for the AI agent in n8n: POST /api/bot/<tool>
 *   header x-webhook-secret (same as /api/webhooks/n8n)
 *   body { tenant_id, contact_id | wa_id, conversation_id?, reason?, ...tool params }
 * Tools: context, update_contact, tags, stage, fields, note, appointment, deal, order, handoff.
 * The agent never touches Supabase: every change goes through here and is recorded
 * in ai_actions and in the contact's timeline. Guide: docs/n8n-herramientas-bot.md
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tool: string }> }) {
    const { tool } = await params;
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
    }
    return handle(request, tool, body ?? {});
}

/** GET /api/bot/context?tenant_id=…&wa_id=… (read-only, for n8n tools that only support GET) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tool: string }> }) {
    const { tool } = await params;
    if (tool !== 'context') return NextResponse.json({ ok: false, error: 'Usa POST' }, { status: 405 });
    return handle(request, tool, Object.fromEntries(request.nextUrl.searchParams.entries()));
}

async function handle(request: NextRequest, tool: string, body: Record<string, unknown>) {
    const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return NextResponse.json({ ok: false, error: 'Falta tenant_id' }, { status: 400 });
    if (!TOOL_NAMES.includes(tool)) {
        return NextResponse.json({ ok: false, error: `Herramienta desconocida: ${tool}. Disponibles: ${TOOL_NAMES.join(', ')}` }, { status: 404 });
    }

    const supabase = createAdminClient();
    const denied = await verifyN8nRequest(supabase, request, tenantId);
    if (denied) return denied;

    // The contact the agent is talking to (by id or by WhatsApp number)
    const contactId = typeof body.contact_id === 'string' ? body.contact_id : '';
    const phone = String(body.wa_id ?? body.phone ?? '').replace(/\D/g, '');
    if (!contactId && !phone) return NextResponse.json({ ok: false, error: 'Falta contact_id o wa_id' }, { status: 400 });
    let q = supabase.from('contacts').select('id, nombre, wa_id, funnel_stage_id').eq('tenant_id', tenantId);
    q = contactId ? q.eq('id', contactId) : q.eq('wa_id', phone);
    const { data: contact } = await q.maybeSingle();
    if (!contact) return NextResponse.json({ ok: false, error: 'Contacto no encontrado' }, { status: 404 });

    let conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : null;
    if (conversationId) {
        const { data: conv } = await supabase.from('conversations').select('id').eq('id', conversationId)
            .eq('tenant_id', tenantId).eq('contact_id', contact.id).maybeSingle();
        conversationId = conv?.id ?? null;
    }
    if (!conversationId) {
        const { data: conv } = await supabase.from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contact.id).maybeSingle();
        conversationId = conv?.id ?? null;
    }

    const result = await runTool(tool, {
        supabase,
        tenantId,
        contact: contact as { id: string; nombre: string; wa_id: string | null; funnel_stage_id: string | null },
        conversationId,
        body,
    });
    // Errors go back with 200 + ok:false so the agent reads the message and can correct itself
    return NextResponse.json(result, { status: !result.ok && result.status >= 500 ? 500 : 200 });
}
