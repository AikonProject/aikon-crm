import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('chat');
        const { data, error } = await supabase
            .from('message_templates')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ templates: data ?? [] });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/templates]', err);
        return NextResponse.json({ error: 'Error fetching templates' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, content, category, language = 'es', variables } = body;

        if (!name || !content) {
            return NextResponse.json({ error: 'name and content are required' }, { status: 400 });
        }

        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('chat');
        const { data, error } = await supabase
            .from('message_templates')
            .insert({
                tenant_id: TENANT_ID,
                name,
                content,
                category: category ?? null,
                language,
                variables: variables ?? null,
                is_active: true,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ template: data }, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/templates]', err);
        return NextResponse.json({ error: 'Error creating template' }, { status: 500 });
    }
}
