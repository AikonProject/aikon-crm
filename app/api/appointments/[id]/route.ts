import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import { getActorName, logActivity } from '@/lib/activity';
import { APPOINTMENT_SELECT, APPOINTMENT_STATUS_LABELS, type AppointmentRow } from '@/lib/appointments';
import { buildAppointmentFields, formatWhen, ValidationError } from '../shared';

type Ctx = { params: Promise<{ id: string }> };

async function load(supabase: ReturnType<typeof createAdminClient>, tenantId: string, id: string) {
    const { data } = await supabase
        .from('appointments')
        .select(APPOINTMENT_SELECT)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
    return data as unknown as AppointmentRow | null;
}

function handleError(err: unknown, where: string) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(where, err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
    try {
        const { id } = await params;
        const TENANT_ID = await requireModule('appointments');
        const appointment = await load(createAdminClient(), TENANT_ID, id);
        if (!appointment) return NextResponse.json({ error: 'Cita no encontrada.' }, { status: 404 });
        return NextResponse.json({ appointment });
    } catch (err) {
        return handleError(err, '[GET /api/appointments/[id]]');
    }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
    try {
        const { id } = await params;
        const TENANT_ID = await requireModule('appointments');
        const supabase = createAdminClient();
        const before = await load(supabase, TENANT_ID, id);
        if (!before) return NextResponse.json({ error: 'Cita no encontrada.' }, { status: 404 });

        const body = await req.json().catch(() => null);
        if (!body) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
        const { fields } = await buildAppointmentFields(supabase, TENANT_ID, body, true);

        const start = (fields.start_time as string | undefined) ?? before.start_time;
        const end = (fields.end_time as string | undefined) ?? before.end_time;
        if (new Date(end) <= new Date(start)) {
            return NextResponse.json({ error: 'La hora de fin debe ser posterior a la de inicio.' }, { status: 400 });
        }

        const { error } = await supabase
            .from('appointments')
            .update(fields as never)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID);
        if (error) {
            console.error('[PATCH /api/appointments/[id]]', error);
            return NextResponse.json({ error: `No se pudo actualizar la cita: ${error.message}` }, { status: 500 });
        }
        const after = await load(supabase, TENANT_ID, id);

        const contactId = after?.contact_id ?? before.contact_id;
        if (contactId && after) {
            const actor = await getActorName();
            let description: string | null = null;
            let type = 'appointment_updated';
            if (fields.status && fields.status !== before.status) {
                type = 'appointment_status';
                description = `Cita "${after.title}": ${APPOINTMENT_STATUS_LABELS[after.status]}`;
            } else if (start !== before.start_time) {
                type = 'appointment_rescheduled';
                description = `Reprogramó "${after.title}" para el ${formatWhen(start)}`;
            } else {
                description = `Editó la cita "${after.title}"`;
            }
            await logActivity(supabase, {
                tenantId: TENANT_ID, contactId, type, description, performedByName: actor,
                metadata: { appointment_id: id },
            });
        }
        return NextResponse.json({ appointment: after });
    } catch (err) {
        return handleError(err, '[PATCH /api/appointments/[id]]');
    }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
    try {
        const { id } = await params;
        const TENANT_ID = await requireModule('appointments');
        const supabase = createAdminClient();
        const before = await load(supabase, TENANT_ID, id);
        if (!before) return NextResponse.json({ error: 'Cita no encontrada.' }, { status: 404 });

        const { error } = await supabase.from('appointments').delete().eq('id', id).eq('tenant_id', TENANT_ID);
        if (error) {
            console.error('[DELETE /api/appointments/[id]]', error);
            return NextResponse.json({ error: `No se pudo eliminar la cita: ${error.message}` }, { status: 500 });
        }
        if (before.contact_id) {
            await logActivity(supabase, {
                tenantId: TENANT_ID,
                contactId: before.contact_id,
                type: 'appointment_deleted',
                description: `Eliminó la cita "${before.title}" del ${formatWhen(before.start_time)}`,
                metadata: { appointment_id: id },
            });
        }
        return NextResponse.json({ deleted: true });
    } catch (err) {
        return handleError(err, '[DELETE /api/appointments/[id]]');
    }
}
