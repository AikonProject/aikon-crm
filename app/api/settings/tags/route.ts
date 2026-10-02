import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('tags')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ tags: data ?? [] });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/settings/tags]', err);
        return NextResponse.json({ error: 'Error fetching tags' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, color } = body;

        if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('tags')
            .insert({ tenant_id: TENANT_ID, name, color: color ?? null })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ tag: data }, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/settings/tags]', err);
        return NextResponse.json({ error: 'Error creating tag' }, { status: 500 });
    }
}
