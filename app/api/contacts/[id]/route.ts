import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';
import { getTenantConfig, hasModule } from '@/lib/tenant-plan';
import { logActivity } from '@/lib/activity';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();
        const withReservations = hasModule(await getTenantConfig(TENANT_ID), 'reservations');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const run = <T>(q: any): Promise<{ data: T | null; error: unknown }> => q;

        const [contactRes, tagsRes, fieldsRes, fieldDefsRes, reservationsRes, notesRes, activityRes] = await Promise.all([
            run(supabase.from('contacts').select('*, funnel_stage:funnel_stages(id, name, color)').eq('id', id).eq('tenant_id', TENANT_ID).single()),
            run(supabase.from('contact_tags').select('tag:tags(id, name, color)').eq('contact_id', id)),
            // No FK between contact_field_values and custom_fields (joined by field_key), so fetch both
            run(supabase.from('contact_field_values').select('field_key, value').eq('contact_id', id).eq('tenant_id', TENANT_ID)),
            run(supabase.from('custom_fields').select('field_key, label, field_type').eq('tenant_id', TENANT_ID)),
            withReservations
                ? run(supabase.from('reservations').select('id, reservation_date, reservation_time, party_size, status, occasion').eq('contact_id', id).eq('tenant_id', TENANT_ID).order('reservation_date', { ascending: false }).limit(5))
                : Promise.resolve({ data: [], error: null }),
            run(supabase.from('contact_notes').select('id, content, created_at, user:users(full_name)').eq('contact_id', id).eq('tenant_id', TENANT_ID).order('created_at', { ascending: false }).limit(50)),
            run(supabase.from('activity_log').select('id, activity_type, description, created_at, performed_by_name').eq('contact_id', id).eq('tenant_id', TENANT_ID).order('created_at', { ascending: false }).limit(10)),
        ]);

        if (contactRes.error || !contactRes.data) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toArr = (d: any) => Array.isArray(d) ? d : (d ?? []);

        const fieldDefs = new Map<string, { label: string; field_type: string }>(
            toArr(fieldDefsRes.data).map((f: { field_key: string; label: string; field_type: string }) =>
                [f.field_key, { label: f.label, field_type: f.field_type }])
        );
        const customFields = toArr(fieldsRes.data)
            .filter((f: { value: string | null }) => f.value !== null && f.value !== '')
            .map((f: { field_key: string; value: string }) => ({ ...f, custom_field: fieldDefs.get(f.field_key) ?? null }));

        return NextResponse.json({
            contact: contactRes.data,
            tags: toArr(tagsRes.data),
            custom_fields: customFields,
            reservations: toArr(reservationsRes.data),
            notes: toArr(notesRes.data),
            activity: toArr(activityRes.data),
        });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
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

        if (body.funnel_stage_id !== undefined) {
            let stageName = 'sin etapa';
            if (body.funnel_stage_id) {
                const { data: stage } = await supabase.from('funnel_stages').select('name')
                    .eq('id', body.funnel_stage_id).eq('tenant_id', TENANT_ID).maybeSingle();
                stageName = stage?.name ?? 'otra etapa';
            }
            await logActivity(supabase, {
                tenantId: TENANT_ID, contactId: id, type: 'stage_changed', description: `Movió el contacto a "${stageName}"`,
            });
        }
        if (typeof body.ai_active === 'boolean') {
            await logActivity(supabase, {
                tenantId: TENANT_ID, contactId: id, type: body.ai_active ? 'ai_enabled' : 'ai_disabled',
                description: body.ai_active ? 'Activó la IA para el contacto' : 'Desactivó la IA para el contacto',
            });
        }
        return NextResponse.json(data);
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/contacts/[id]]', err);
        return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }
}
