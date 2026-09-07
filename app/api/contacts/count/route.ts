import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';
import type { ContactSource } from '@/lib/types/database';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const funnel_stage_id = searchParams.get('funnel_stage_id');
        const source = searchParams.get('source');

        const supabase = createAdminClient();
        let query = supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', MOCK_TENANT_ID);

        if (funnel_stage_id) query = query.eq('funnel_stage_id', funnel_stage_id);
        if (source) query = query.eq('source', source as ContactSource);

        const { count, error } = await query;

        if (error) throw error;

        return NextResponse.json({ count: count ?? 0 });
    } catch (err) {
        console.error('[GET /api/contacts/count]', err);
        return NextResponse.json({ count: 0 });
    }
}
