import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('tenant_id', MOCK_TENANT_ID)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ users: data ?? [] });
    } catch (err) {
        console.error('[GET /api/settings/team]', err);
        return NextResponse.json({ error: 'Error fetching team' }, { status: 500 });
    }
}
