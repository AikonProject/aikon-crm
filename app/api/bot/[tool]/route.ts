import { NextRequest, NextResponse } from 'next/server';
import { CATALOG, runTool } from '@/lib/bot/catalog';
import { argsFromQuery, botAuth, resolveContact } from '@/lib/bot/request';

/**
 * CRM API for the AI agent in n8n (REST). Same tools as the MCP server (/api/mcp/<tenant_id>).
 *   POST /api/bot/<tool>   body { tenant_id, wa_id | contact_id, conversation_id?, reason?, ...params }
 *   GET  /api/bot/<tool>?tenant_id=…&wa_id=…   (read tools only: get_*, list_*, search_*)
 *   header x-webhook-secret (same as /api/webhooks/n8n)
 * Catalog with every tool and its parameters: GET /api/bot?tenant_id=…  ·  Guide: docs/n8n-herramientas-bot.md
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ tool: string }> }) {
    const { tool } = await params;
    if (CATALOG[tool]?.write) return NextResponse.json({ ok: false, error: `${tool} cambia datos: usa POST` }, { status: 405 });
    return handle(request, tool, argsFromQuery(request.nextUrl.searchParams));
}

async function handle(request: NextRequest, tool: string, body: Record<string, unknown>) {
    const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : '';
    const auth = await botAuth(request, tenantId);
    if ('error' in auth) return auth.error;
    if (!CATALOG[tool]) {
        const names = Object.keys(CATALOG).filter((n) => !CATALOG[n].legacy).join(', ');
        return NextResponse.json({ ok: false, error: `Herramienta desconocida: ${tool}. Disponibles: ${names}` }, { status: 404 });
    }

    // Tenant-wide tools (create/upsert/search) take phone as data, not as the customer to act on
    const { contact, conversationId, notFound } = CATALOG[tool].contact === 'none'
        ? { contact: null, conversationId: null, notFound: false }
        : await resolveContact(auth.supabase, tenantId, body);
    if (notFound) return NextResponse.json({ ok: false, error: 'Contacto no encontrado' }, { status: 404 });

    const result = await runTool(tool, { supabase: auth.supabase, tenantId, contact, conversationId, body });
    // Input errors go back with 200 + ok:false so the agent reads the message and corrects itself
    return NextResponse.json(result, { status: !result.ok && result.status >= 500 ? 500 : 200 });
}
