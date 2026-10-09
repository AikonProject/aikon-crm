import type { AppointmentMeetingType, AppointmentStatus } from '@/lib/types/database';

/** Columns + joins returned by every appointments endpoint. */
export const APPOINTMENT_SELECT = `
    id, tenant_id, contact_id, assigned_to, service_id, title, description, notes,
    location, meeting_type, meeting_url, contact_name, contact_phone, contact_email,
    start_time, end_time, timezone, status, color, created_by, created_at, updated_at,
    contact:contacts ( id, nombre, wa_id, email ),
    assigned_user:users!appointments_assigned_to_fkey ( id, full_name ),
    service:services ( id, name, duration_minutes )
`;

export type AppointmentRow = {
    id: string;
    tenant_id: string;
    contact_id: string | null;
    assigned_to: string | null;
    service_id: string | null;
    title: string;
    description: string | null;
    notes: string | null;
    location: string | null;
    meeting_type: AppointmentMeetingType;
    meeting_url: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    start_time: string;
    end_time: string;
    timezone: string | null;
    status: AppointmentStatus;
    color: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    contact: { id: string; nombre: string; wa_id: string | null; email: string | null } | null;
    assigned_user: { id: string; full_name: string } | null;
    service: { id: string; name: string; duration_minutes: number | null } | null;
};

export const APPOINTMENT_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
    scheduled: 'Agendada',
    confirmed: 'Confirmada',
    completed: 'Realizada',
    cancelled: 'Cancelada',
    no_show: 'No asistió',
};

export const APPOINTMENT_STATUS_STYLES: Record<AppointmentStatus, { bg: string; text: string; dot: string }> = {
    scheduled: { bg: '#EEF2FF', text: '#4F46E5', dot: '#6366F1' },
    confirmed: { bg: '#ECFDF5', text: '#047857', dot: '#10B981' },
    completed: { bg: '#F3F4F6', text: '#4B5563', dot: '#9CA3AF' },
    cancelled: { bg: '#FEF2F2', text: '#B91C1C', dot: '#EF4444' },
    no_show: { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316' },
};

export const MEETING_TYPES: AppointmentMeetingType[] = ['virtual', 'presencial', 'llamada'];

export const MEETING_TYPE_LABELS: Record<AppointmentMeetingType, string> = {
    virtual: 'Reunión virtual',
    presencial: 'Presencial',
    llamada: 'Llamada',
};

/** Colors offered for an appointment (calendar block). */
export const APPOINTMENT_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#64748B'];

export function appointmentColor(a: Pick<AppointmentRow, 'color' | 'status'>): string {
    if (a.status === 'cancelled') return '#EF4444';
    return a.color ?? APPOINTMENT_STATUS_STYLES[a.status]?.dot ?? '#6366F1';
}

/** Phone digits only, for wa.me links. */
export function phoneDigits(phone: string | null | undefined): string {
    return (phone ?? '').replace(/\D/g, '');
}
