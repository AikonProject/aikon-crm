'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    X, Pencil, Trash2, Video, MapPin, Phone, Mail, MessageCircle, User, UserCheck, Clock, StickyNote,
    FileText, ExternalLink, Copy, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_STYLES, MEETING_TYPE_LABELS, appointmentColor, phoneDigits,
    type AppointmentRow,
} from '@/lib/appointments';
import type { AppointmentStatus } from '@/lib/types/database';

const QUICK_STATUSES: AppointmentStatus[] = ['confirmed', 'completed', 'no_show', 'cancelled'];

export function AppointmentDetails({
    appointment,
    onClose,
    onEdit,
    onChanged,
    onDeleted,
}: {
    appointment: AppointmentRow;
    onClose: () => void;
    onEdit: () => void;
    onChanged: (a: AppointmentRow) => void;
    onDeleted: (id: string) => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const a = appointment;
    const start = new Date(a.start_time);
    const end = new Date(a.end_time);
    const color = appointmentColor(a);
    const phone = a.contact_phone ?? a.contact?.wa_id ?? null;
    const email = a.contact_email ?? a.contact?.email ?? null;
    const name = a.contact?.nombre ?? a.contact_name ?? null;
    const MeetingIcon = a.meeting_type === 'virtual' ? Video : a.meeting_type === 'presencial' ? MapPin : Phone;

    async function setStatus(status: AppointmentStatus) {
        setBusy(status);
        try {
            const res = await fetch(`/api/appointments/${a.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || 'No se pudo cambiar el estado'); return; }
            toast.success(`Cita marcada como ${APPOINTMENT_STATUS_LABELS[status].toLowerCase()}`);
            onChanged(d.appointment);
        } catch {
            toast.error('Error de conexión al cambiar el estado');
        } finally {
            setBusy(null);
        }
    }

    async function remove() {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setBusy('delete');
        try {
            const res = await fetch(`/api/appointments/${a.id}`, { method: 'DELETE' });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || 'No se pudo eliminar la cita'); return; }
            toast.success('Cita eliminada');
            onDeleted(a.id);
        } catch {
            toast.error('Error de conexión al eliminar la cita');
        } finally {
            setBusy(null);
        }
    }

    function copyLink() {
        if (!a.meeting_url) return;
        navigator.clipboard.writeText(a.meeting_url)
            .then(() => toast.success('Link copiado'))
            .catch(() => toast.error('No se pudo copiar el link'));
    }

    const st = APPOINTMENT_STATUS_STYLES[a.status];

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="h-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
            <div className="flex items-center justify-end gap-1 px-3 pt-2">
                <button onClick={onEdit} className="p-2 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]" title="Editar">
                    <Pencil size={15} />
                </button>
                <button
                    onClick={remove}
                    disabled={busy === 'delete'}
                    className={cn('p-2 rounded-lg transition-colors', confirmDelete ? 'bg-red-600 text-white' : 'text-[#6B7280] hover:bg-red-50 hover:text-red-600')}
                    title={confirmDelete ? 'Haz clic otra vez para eliminar' : 'Eliminar'}
                >
                    {busy === 'delete' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
                <button onClick={onClose} className="p-2 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]" title="Cerrar">
                    <X size={15} />
                </button>
            </div>
            {confirmDelete && (
                <p className="mx-5 mb-1 text-[11px] text-red-600 text-right">Haz clic de nuevo en la papelera para eliminar.</p>
            )}

            <div className="px-5 pb-5 overflow-y-auto space-y-4">
                <div className="flex gap-3">
                    <span className="mt-1.5 w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: color }} />
                    <div className="min-w-0">
                        <h3 className={cn('text-[18px] font-bold text-[#1A1A2E] leading-tight break-words', a.status === 'cancelled' && 'line-through text-[#9CA3AF]')}>
                            {a.title}
                        </h3>
                        <p className="text-[13px] text-[#6B7280] mt-1 capitalize">
                            {format(start, "EEEE d 'de' MMMM", { locale: es })}
                        </p>
                        <p className="text-[13px] text-[#6B7280] flex items-center gap-1">
                            <Clock size={12} /> {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
                        </p>
                        <span className="inline-block mt-2 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: st.bg, color: st.text }}>
                            {APPOINTMENT_STATUS_LABELS[a.status]}
                        </span>
                    </div>
                </div>

                {/* Meeting */}
                <div className="flex gap-3 items-start">
                    <MeetingIcon size={16} className="text-[#9CA3AF] mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[#1A1A2E]">{MEETING_TYPE_LABELS[a.meeting_type]}</p>
                        {a.meeting_type === 'virtual' && a.meeting_url && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                                <a
                                    href={a.meeting_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4F46E5] text-white text-[12px] font-semibold hover:bg-[#4338CA]"
                                >
                                    <Video size={13} /> Unirse a la reunión
                                </a>
                                <button onClick={copyLink} className="p-1.5 rounded-lg border border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]" title="Copiar link">
                                    <Copy size={13} />
                                </button>
                            </div>
                        )}
                        {a.meeting_type === 'virtual' && a.meeting_url && (
                            <p className="text-[11px] text-[#9CA3AF] truncate mt-1">{a.meeting_url}</p>
                        )}
                        {a.meeting_type === 'virtual' && !a.meeting_url && (
                            <p className="text-[12px] text-[#C4C4CE] italic">Sin link de reunión</p>
                        )}
                        {a.meeting_type === 'presencial' && (
                            <p className="text-[12px] text-[#6B7280]">{a.location || <span className="italic text-[#C4C4CE]">Sin dirección</span>}</p>
                        )}
                    </div>
                </div>

                {/* Contact */}
                <div className="flex gap-3 items-start">
                    <User size={16} className="text-[#9CA3AF] mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        {a.contact ? (
                            <Link href={`/contacts/${a.contact.id}`} className="text-[13px] font-medium text-[#4F46E5] hover:underline inline-flex items-center gap-1">
                                {name} <ExternalLink size={11} />
                            </Link>
                        ) : (
                            <p className="text-[13px] font-medium text-[#1A1A2E]">{name ?? 'Sin contacto'}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                            {phone && (
                                <a
                                    href={`https://wa.me/${phoneDigits(phone)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-medium hover:bg-emerald-100"
                                >
                                    <MessageCircle size={11} /> {phone}
                                </a>
                            )}
                            {email && (
                                <a href={`mailto:${email}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-50 text-sky-700 text-[11px] font-medium hover:bg-sky-100">
                                    <Mail size={11} /> {email}
                                </a>
                            )}
                        </div>
                        {a.contact && (
                            <Link href={`/conversations?contact=${a.contact.id}`} className="text-[11px] text-[#818CF8] hover:underline">
                                Abrir chat →
                            </Link>
                        )}
                    </div>
                </div>

                {a.assigned_user && (
                    <div className="flex gap-3 items-center">
                        <UserCheck size={16} className="text-[#9CA3AF] flex-shrink-0" />
                        <p className="text-[13px] text-[#1A1A2E]">{a.assigned_user.full_name}</p>
                    </div>
                )}

                {a.description && (
                    <div className="flex gap-3 items-start">
                        <FileText size={16} className="text-[#9CA3AF] mt-0.5 flex-shrink-0" />
                        <p className="text-[13px] text-[#1A1A2E] whitespace-pre-wrap break-words">{a.description}</p>
                    </div>
                )}
                {a.notes && (
                    <div className="flex gap-3 items-start">
                        <StickyNote size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-[13px] text-[#1A1A2E] whitespace-pre-wrap break-words bg-amber-50 rounded-lg px-2.5 py-2 flex-1">{a.notes}</p>
                    </div>
                )}

                {/* Quick status */}
                <div>
                    <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5">Cambiar estado</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {QUICK_STATUSES.map((s) => (
                            <button
                                key={s}
                                onClick={() => setStatus(s)}
                                disabled={!!busy || a.status === s}
                                className={cn(
                                    'flex items-center justify-center gap-1 py-1.5 rounded-lg border text-[11px] font-medium transition-colors disabled:opacity-60',
                                    a.status === s ? 'border-transparent' : 'border-[#E8E8EC] hover:bg-[#F9FAFB]'
                                )}
                                style={a.status === s ? { backgroundColor: APPOINTMENT_STATUS_STYLES[s].bg, color: APPOINTMENT_STATUS_STYLES[s].text } : undefined}
                            >
                                {busy === s && <Loader2 size={11} className="animate-spin" />}
                                {APPOINTMENT_STATUS_LABELS[s]}
                            </button>
                        ))}
                        {a.status !== 'scheduled' && (
                            <button
                                onClick={() => setStatus('scheduled')}
                                disabled={!!busy}
                                className="col-span-2 py-1.5 rounded-lg border border-dashed border-[#E8E8EC] text-[11px] text-[#6B7280] hover:bg-[#F9FAFB]"
                            >
                                Volver a «Agendada»
                            </button>
                        )}
                    </div>
                </div>

                <p className="text-[10px] text-[#C4C4CE]">
                    Creada {a.created_by ? `por ${a.created_by} ` : ''}el {format(new Date(a.created_at), "d MMM yyyy, h:mm a", { locale: es })}
                </p>
            </div>
        </div>
    );
}
