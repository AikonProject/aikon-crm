import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import { getActorName, logActivity } from '@/lib/activity';
import { APPOINTMENT_SELECT } from '@/lib/appointments';
import { buildAppointmentFields, formatWhen, ValidationError } from './shared';
import type { AppointmentStatus } from '@/lib/types/database';

// GET /api/appointments?from=ISO&to=ISO&contact_id=&status=&assigned_to=
export async function GET(req: NextRequest) {
    try {
        const TENANT_ID = await requireModule('appointments');
        const supabase = createAdminClient();
        const sp = new URL(req.url).searchParams;

        let query = supabase
            .from('appointments')
            .select(APPOINTMENT_SELECT)
            .eq('tenant_id', TENANT_ID)
            .order('start_time', { ascending: true })
            .limit(1000);

        const from = sp.get('from');
        const to = sp.get('to');
        if (from) query = query.gte('end_time', from);
        if (to) query = query.lte('start_time', to);
        if (sp.get('contact_id')) query = query.eq('contact_id', sp.get('contact_id')!);
        if (sp.get('status')) query = query.eq('status', sp.get('status') as AppointmentStatus);
        if (sp.get('assigned_to')) query = query.eq('assigned_to', sp.get('assigned_to')!);

        const { data, error } = await query;
        if (error) {
            console.error('[GET /api/appointments]', error);
            return NextResponse.json({ error: 'No se pudieron cargar las citas.' }, { status: 500 });
        }
        return NextResponse.json({ appointments: data ?? [] });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/appointments] unexpected', err);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}

// POST /api/appointments
export async function POST(req: NextRequest) {
    try {
        const TENANT_ID = await requireModule('appointments');
        const supabase = createAdminClient();
        const body = await req.json().catch(() => null);
        if (!body) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });

        const { fields, contact } = await buildAppointmentFields(supabase, TENANT_ID, body, false);
        if (new Date(fields.end_time as string) <= new Date(fields.start_time as string)) {
            return NextResponse.json({ error: 'La hora de fin debe ser posterior a la de inicio.' }, { status: 400 });
        }
        const actor = await getActorName();

        const { data, error } = await supabase
            .from('appointments')
            .insert({ ...fields, tenant_id: TENANT_ID, created_by: actor } as never)
            .select(APPOINTMENT_SELECT)
            .single();
        if (error) {
            console.error('[POST /api/appointments]', error);
            return NextResponse.json({ error: `No se pudo crear la cita: ${error.message}` }, { status: 500 });
        }

        if (contact) {
            await logActivity(supabase, {
                tenantId: TENANT_ID,
                contactId: contact.id,
                type: 'appointment_created',
                description: `Agendó "${fields.title}" para el ${formatWhen(fields.start_time as string)}`,
                performedByName: actor,
                metadata: { appointment_id: (data as { id: string }).id },
            });
        }
        return NextResponse.json({ appointment: data }, { status: 201 });
    } catch (err) {
        if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: err.status });
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/appointments] unexpected', err);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
