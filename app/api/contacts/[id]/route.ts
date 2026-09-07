import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        // Allowlist of patchable fields (must match actual DB schema)
        const allowed = [
            'nombre', 'email', 'wa_id', 'job_title', 'source',
            'funnel_stage_id', 'assigned_to', 'lead_score',
            'is_blocked', 'avatar_url',
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('contacts')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', MOCK_TENANT_ID)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/contacts/[id]]', err);
        return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }
}
