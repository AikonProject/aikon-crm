import { NextRequest, NextResponse } from 'next/server';
import { availableTools } from '@/lib/bot/catalog';
import { botAuth } from '@/lib/bot/request';

/** GET /api/bot?tenant_id=… — catalog of tools available for this tenant's plan, with their parameters. */
export async function GET(request: NextRequest) {
    const tenantId = request.nextUrl.searchParams.get('tenant_id') ?? '';
    const auth = await botAuth(request, tenantId);
    if ('error' in auth) return auth.error;
    const tools = await availableTools(tenantId);
    return NextResponse.json({
        ok: true,
        usage: {
            read: 'GET o POST /api/bot/<tool> (get_*, list_*, search_*)',
            write: 'POST /api/bot/<tool>',
            auth: 'header x-webhook-secret',
            common: 'tenant_id, wa_id (o contact_id), conversation_id?, reason?',
            mcp: `/api/mcp/${tenantId}`,
        },
        tools,
    });
}
