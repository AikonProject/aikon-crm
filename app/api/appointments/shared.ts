import { createAdminClient } from '@/lib/supabase/admin';
import { APPOINTMENT_STATUSES, MEETING_TYPES, phoneDigits } from '@/lib/appointments';
import type { AppointmentMeetingType, AppointmentStatus } from '@/lib/types/database';

type Supabase = ReturnType<typeof createAdminClient>;

export class ValidationError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

export type AppointmentInput = Record<string, unknown>;

function str(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t : null;
}

function isoDate(v: unknown, label: string): string {
    const d = typeof v === 'string' ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) throw new ValidationError(`${label} no es válida.`);
    return d.toISOString();
}

/**
 * Validates an appointment payload and resolves the contact (an existing one, or
 * found/created from the WhatsApp number). `partial` = PATCH: only given fields.
 */
export async function buildAppointmentFields(
    supabase: Supabase,
    tenantId: string,
    body: AppointmentInput,
    partial: boolean
) {
    const out: Record<string, unknown> = {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

    if (!partial || has('title')) {
        const title = str(body.title);
        if (title) out.title = title;
        else if (partial) throw new ValidationError('El título no puede quedar vacío.');
    }
    for (const k of ['description', 'notes', 'location', 'meeting_url', 'contact_name', 'contact_email', 'color'] as const) {
        if (!partial || has(k)) out[k] = str(body[k]);
    }
    if (!partial || has('contact_phone')) out.contact_phone = str(body.contact_phone);

    if (out.meeting_url && !/^https?:\/\//i.test(out.meeting_url as string)) {
        out.meeting_url = `https://${out.meeting_url}`;
    }
    if (out.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contact_email as string)) {
        throw new ValidationError('El correo no es válido.');
    }

    if (!partial || has('start_time')) out.start_time = isoDate(body.start_time, 'La fecha de inicio');
    if (!partial || has('end_time')) out.end_time = isoDate(body.end_time, 'La hora de fin');

    if (has('meeting_type') || !partial) {
        const t = (body.meeting_type ?? 'virtual') as AppointmentMeetingType;
        if (!MEETING_TYPES.includes(t)) throw new ValidationError('Tipo de cita no válido.');
        out.meeting_type = t;
    }
    if (has('status') || !partial) {
        const s = (body.status ?? 'scheduled') as AppointmentStatus;
        if (!APPOINTMENT_STATUSES.includes(s)) throw new ValidationError('Estado no válido.');
        out.status = s;
    }
    if (has('timezone')) out.timezone = str(body.timezone) ?? 'America/Bogota';

    if (has('assigned_to') || !partial) {
        const userId = str(body.assigned_to);
        if (userId) {
            const { data } = await supabase.from('users').select('id').eq('id', userId).eq('tenant_id', tenantId).maybeSingle();
            if (!data) throw new ValidationError('El responsable no pertenece a tu equipo.');
        }
        out.assigned_to = userId;
    }
    if (has('service_id') || !partial) {
        const serviceId = str(body.service_id);
        if (serviceId) {
            const { data } = await supabase.from('services').select('id').eq('id', serviceId).eq('tenant_id', tenantId).maybeSingle();
            if (!data) throw new ValidationError('Servicio no encontrado.');
        }
        out.service_id = serviceId;
    }

    // Contact: explicit id, or find/create by WhatsApp number
    let contact: { id: string; nombre: string; wa_id: string | null; email: string | null } | null = null;
    if (has('contact_id') || !partial) {
        const contactId = str(body.contact_id);
        if (contactId) {
            const { data } = await supabase.from('contacts').select('id, nombre, wa_id, email')
                .eq('id', contactId).eq('tenant_id', tenantId).maybeSingle();
            if (!data) throw new ValidationError('Contacto no encontrado.', 404);
            contact = data;
        } else if (out.contact_phone && body.create_contact !== false) {
            const waId = phoneDigits(out.contact_phone as string);
            if (waId.length >= 7) {
                const { data: existing } = await supabase.from('contacts').select('id, nombre, wa_id, email')
                    .eq('tenant_id', tenantId).eq('wa_id', waId).maybeSingle();
                if (existing) {
                    contact = existing;
                } else {
                    const { data: created, error } = await supabase.from('contacts').insert({
                        tenant_id: tenantId,
                        nombre: (out.contact_name as string | null) ?? waId,
                        wa_id: waId,
                        email: (out.contact_email as string | null) ?? null,
                        source: 'manual',
                        lead_score: 0,
                        last_contacted_at: null,
                        assigned_to: null,
                    }).select('id, nombre, wa_id, email').single();
                    if (error) throw new ValidationError(`No se pudo crear el contacto: ${error.message}`, 500);
                    contact = created;
                }
            }
        }
        out.contact_id = contact?.id ?? null;
        if (contact) {
            out.contact_name = out.contact_name ?? contact.nombre;
            out.contact_phone = out.contact_phone ?? contact.wa_id;
            out.contact_email = out.contact_email ?? contact.email;
        }
    }

    if (!partial && !out.title) {
        out.title = `Cita con ${(out.contact_name as string | null) ?? 'cliente'}`;
    }

    return { fields: out, contact };
}

/** Readable date for activity descriptions (Bogotá time). */
export function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString('es-CO', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        hour12: true, timeZone: 'America/Bogota',
    });
}
