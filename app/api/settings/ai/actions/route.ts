import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';

/** GET /api/settings/ai/actions?status=failed&limit=100 — what the AI agent did in the CRM (ai_actions). */
export async function GET(req: NextRequest) {
    try {
        const TENANT_ID = await getServerTenantId();
        const supabase = createAdminClient();
        const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 100));
        const status = req.nextUrl.searchParams.get('status');
        let q = supabase
            .from('ai_actions')
            .select('id, tool_name, status, summary, reasoning, created_at, contact:contacts ( id, nombre )')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (status === 'failed' || status === 'completed') q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw error;
        return NextResponse.json({ actions: data ?? [] });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/settings/ai/actions]', err);
        return NextResponse.json({ error: 'No se pudo leer el historial' }, { status: 500 });
    }
}
