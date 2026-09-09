import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const run = <T>(q: any): Promise<{ data: T | null; error: unknown }> => q;

        const [contactRes, tagsRes, fieldsRes, reservationsRes, notesRes, activityRes] = await Promise.all([
            run(supabase.from('contacts').select('*, funnel_stage:funnel_stages(id, name, color)').eq('id', id).eq('tenant_id', TENANT_ID).single()),
            run(supabase.from('contact_tags').select('tag:tags(id, name, color)').eq('contact_id', id)),
            run(supabase.from('contact_field_values').select('field_key, value, custom_field:custom_fields(label, field_type)').eq('contact_id', id)),
            run(supabase.from('reservations').select('id, reservation_date, reservation_time, party_size, status, occasion').eq('contact_id', id).eq('tenant_id', TENANT_ID).order('reservation_date', { ascending: false }).limit(5)),
            run(supabase.from('contact_notes').select('id, content, created_at, user:users(full_name)').eq('contact_id', id).eq('tenant_id', TENANT_ID).order('created_at', { ascending: false }).limit(5)),
            run(supabase.from('activity_log').select('id, activity_type, description, created_at, performed_by_name').eq('contact_id', id).eq('tenant_id', TENANT_ID).order('created_at', { ascending: false }).limit(10)),
        ]);

        if (contactRes.error || !contactRes.data) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toArr = (d: any) => Array.isArray(d) ? d : (d ?? []);

        return NextResponse.json({
            contact: contactRes.data,
            tags: toArr(tagsRes.data),
            custom_fields: toArr(fieldsRes.data).filter((f: { value: string | null }) => f.value !== null && f.value !== ''),
            reservations: toArr(reservationsRes.data),
            notes: toArr(notesRes.data),
            activity: toArr(activityRes.data),
        });
    } catch (err) {
        console.error('[GET /api/contacts/[id]]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

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
            'is_blocked', 'avatar_url', 'ai_active',
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('contacts')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/contacts/[id]]', err);
        return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }
}
