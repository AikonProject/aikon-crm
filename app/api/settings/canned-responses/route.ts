import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('canned_responses')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ responses: data ?? [] });
    } catch (err) {
        console.error('[GET /api/settings/canned-responses]', err);
        return NextResponse.json({ error: 'Error fetching canned responses' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { shortcut, title, content } = body;

        if (!content) {
            return NextResponse.json({ error: 'content is required' }, { status: 400 });
        }

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('canned_responses')
            .insert({
                tenant_id: TENANT_ID,
                title: title ?? shortcut ?? 'Sin título',
                shortcut: shortcut ?? null,
                content,
                created_by: null,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ response: data }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/settings/canned-responses]', err);
        return NextResponse.json({ error: 'Error creating canned response' }, { status: 500 });
    }
}
