import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('custom_fields')
            .select('*')
            .eq('tenant_id', MOCK_TENANT_ID)
            .order('position', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ fields: data ?? [] });
    } catch (err) {
        console.error('[GET /api/settings/custom-fields]', err);
        return NextResponse.json({ error: 'Error fetching custom fields' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { field_key, label, field_type, options, position, is_required } = body;

        if (!field_key || !label || !field_type) {
            return NextResponse.json({ error: 'field_key, label, field_type are required' }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('custom_fields')
            .insert({
                tenant_id: MOCK_TENANT_ID,
                field_key,
                label,
                field_type,
                options: options ?? null,
                position: position ?? 0,
                is_required: is_required ?? false,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ field: data }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/settings/custom-fields]', err);
        return NextResponse.json({ error: 'Error creating custom field' }, { status: 500 });
    }
}
