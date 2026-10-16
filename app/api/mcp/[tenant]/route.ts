import { NextRequest, NextResponse } from 'next/server';
import { availableTools, CATALOG, runTool } from '@/lib/bot/catalog';
import { argsFromQuery, botAuth, resolveContact } from '@/lib/bot/request';

/**
 * MCP server (Streamable HTTP, stateless JSON responses) with the CRM tools for the AI agent.
 * In n8n: AI Agent → "MCP Client Tool" → Endpoint https://<crm>/api/mcp/<tenant_id>?wa_id={{ … }}
 * with Header Auth x-webhook-secret. The agent discovers every tool (name, description, schema).
 * The customer comes from ?wa_id= / ?contact_id= in the URL, or from each call's arguments.
 */

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const SERVER_INFO = { name: 'aikon-crm', version: '1.0.0' };
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
    const { tenant } = await params;
    const auth = await botAuth(request, tenant);
    if ('error' in auth) return auth.error;

    let payload: RpcRequest | RpcRequest[];
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
    }
    const urlArgs = argsFromQuery(request.nextUrl.searchParams);
    const handleOne = (msg: RpcRequest) => handleRpc(msg, auth.supabase, tenant, urlArgs);

    if (Array.isArray(payload)) {
        const results = (await Promise.all(payload.map(handleOne))).filter(Boolean);
        return results.length ? NextResponse.json(results) : new NextResponse(null, { status: 202 });
    }
    const result = await handleOne(payload);
    return result ? NextResponse.json(result) : new NextResponse(null, { status: 202 });
}

/** No server-initiated stream: every response comes back on the POST. */
export async function GET() {
    return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}

export async function DELETE() {
    return new NextResponse(null, { status: 204 });
}

async function handleRpc(
    msg: RpcRequest,
    supabase: Parameters<typeof runTool>[1]['supabase'],
    tenantId: string,
    urlArgs: Record<string, unknown>
) {
    const id = msg.id ?? null;
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result });
    const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
    // Notifications (no id) get no response
    if (msg.id === undefined && msg.method?.startsWith('notifications/')) return null;

    switch (msg.method) {
        case 'initialize': {
            const asked = String(msg.params?.protocolVersion ?? '');
            return reply({
                protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
                capabilities: { tools: { listChanged: false } },
                serverInfo: SERVER_INFO,
                instructions: 'Herramientas del CRM. Consulta get_contact antes de cambiar algo. Usa nombres de los catálogos (list_*). Si una herramienta responde ok:false, lee el error y corrige. En reason explica por qué.',
            });
        }
        case 'ping':
            return reply({});
        case 'tools/list': {
            const tools = await availableTools(tenantId);
            return reply({
                tools: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema,
                    annotations: { readOnlyHint: !t.write },
                })),
            });
        }
        case 'tools/call': {
            const name = String(msg.params?.name ?? '');
            if (!CATALOG[name] || CATALOG[name].legacy) return fail(-32602, `Herramienta desconocida: ${name}`);
            const args = { ...urlArgs, ...((msg.params?.arguments as Record<string, unknown>) ?? {}) };
            const { contact, conversationId, notFound } = await resolveContact(supabase, tenantId, args);
            const result = notFound
                ? { ok: false as const, error: 'Contacto no encontrado: revisa wa_id.', status: 404 }
                : await runTool(name, { supabase, tenantId, contact, conversationId, body: args });
            return reply({
                content: [{ type: 'text', text: JSON.stringify(result) }],
                isError: !result.ok,
            });
        }
        default:
            return fail(-32601, `Método no soportado: ${msg.method}`);
    }
}
