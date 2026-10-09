'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { format, addMinutes, differenceInMinutes } from 'date-fns';
import {
    Video, MapPin, Phone, Mail, MessageCircle, User, Search, X, Trash2, Loader2, Link2, CalendarClock,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
    APPOINTMENT_COLORS, APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_STYLES,
    MEETING_TYPES, MEETING_TYPE_LABELS, type AppointmentRow,
} from '@/lib/appointments';
import type { AppointmentMeetingType, AppointmentStatus } from '@/lib/types/database';

export type AppointmentDraft = {
    start?: Date;
    end?: Date;
    contact?: { id: string; nombre: string; wa_id: string | null; email: string | null } | null;
};

type ContactOption = { id: string; nombre: string; wa_id: string | null; email: string | null };
type TeamMember = { id: string; full_name: string };

const DURATIONS = [15, 30, 45, 60, 90, 120];

type FormState = {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    meeting_type: AppointmentMeetingType;
    meeting_url: string;
    location: string;
    contact_name: string;
    contact_phone: string;
    contact_email: string;
    assigned_to: string;
    status: AppointmentStatus;
    color: string;
    description: string;
    notes: string;
};

function roundedNow(): Date {
    const d = new Date();
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    return d;
}

function initialForm(appointment: AppointmentRow | null, draft: AppointmentDraft | undefined): FormState {
    if (appointment) {
        const s = new Date(appointment.start_time);
        const e = new Date(appointment.end_time);
        return {
            title: appointment.title,
            date: format(s, 'yyyy-MM-dd'),
            startTime: format(s, 'HH:mm'),
            endTime: format(e, 'HH:mm'),
            meeting_type: appointment.meeting_type ?? 'virtual',
            meeting_url: appointment.meeting_url ?? '',
            location: appointment.location ?? '',
            contact_name: appointment.contact_name ?? appointment.contact?.nombre ?? '',
            contact_phone: appointment.contact_phone ?? appointment.contact?.wa_id ?? '',
            contact_email: appointment.contact_email ?? appointment.contact?.email ?? '',
            assigned_to: appointment.assigned_to ?? '',
            status: appointment.status,
            color: appointment.color ?? '',
            description: appointment.description ?? '',
            notes: appointment.notes ?? '',
        };
    }
    const start = draft?.start ?? roundedNow();
    const end = draft?.end ?? addMinutes(start, 30);
    const c = draft?.contact ?? null;
    return {
        title: '',
        date: format(start, 'yyyy-MM-dd'),
        startTime: format(start, 'HH:mm'),
        endTime: format(end, 'HH:mm'),
        meeting_type: 'virtual',
        meeting_url: '',
        location: '',
        contact_name: c?.nombre ?? '',
        contact_phone: c?.wa_id ?? '',
        contact_email: c?.email ?? '',
        assigned_to: '',
        status: 'scheduled',
        color: '',
        description: '',
        notes: '',
    };
}

function toDate(date: string, time: string): Date {
    return new Date(`${date}T${time}:00`);
}

export function AppointmentDialog({
    open,
    onOpenChange,
    appointment,
    draft,
    lockContact = false,
    onSaved,
    onDeleted,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Edit this appointment; null = create a new one */
    appointment: AppointmentRow | null;
    /** Prefill for a new appointment (time slot, contact) */
    draft?: AppointmentDraft;
    /** The contact can't be changed (opened from a contact or a chat) */
    lockContact?: boolean;
    onSaved?: (a: AppointmentRow) => void;
    onDeleted?: (id: string) => void;
}) {
    const [form, setForm] = useState<FormState>(() => initialForm(appointment, draft));
    const [contact, setContact] = useState<ContactOption | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [team, setTeam] = useState<TeamMember[]>([]);

    // Contact search
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ContactOption[]>([]);
    const [searching, setSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reset every time the dialog opens
    useEffect(() => {
        if (!open) return;
        setForm(initialForm(appointment, draft));
        setContact(appointment?.contact ?? draft?.contact ?? null);
        setConfirmDelete(false);
        setFormError(null);
        setQuery('');
        setResults([]);
    }, [open, appointment, draft]);

    useEffect(() => {
        if (!open || team.length) return;
        fetch('/api/settings/team')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setTeam(Array.isArray(d?.users) ? d.users : []))
            .catch(() => { /* optional field */ });
    }, [open, team.length]);

    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        const q = query.trim();
        if (q.length < 2) { setResults([]); return; }
        searchTimer.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`/api/contacts?search=${encodeURIComponent(q)}`);
                const d = await res.json().catch(() => ({}));
                setResults(Array.isArray(d.contacts) ? d.contacts : []);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 250);
    }, [query]);

    const duration = useMemo(() => {
        const s = toDate(form.date, form.startTime);
        const e = toDate(form.date, form.endTime);
        return differenceInMinutes(e, s);
    }, [form.date, form.startTime, form.endTime]);

    function set<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((f) => ({ ...f, [key]: value }));
    }

    function changeStart(time: string) {
        // Keep the duration when moving the start time
        const keep = duration > 0 ? duration : 30;
        const end = addMinutes(toDate(form.date, time), keep);
        setForm((f) => ({ ...f, startTime: time, endTime: format(end, 'HH:mm') }));
    }

    function setDuration(min: number) {
        set('endTime', format(addMinutes(toDate(form.date, form.startTime), min), 'HH:mm'));
    }

    function pickContact(c: ContactOption) {
        setContact(c);
        setShowResults(false);
        setQuery('');
        setForm((f) => ({
            ...f,
            contact_name: c.nombre,
            contact_phone: c.wa_id ?? f.contact_phone,
            contact_email: c.email ?? f.contact_email,
        }));
    }

    function clearContact() {
        setContact(null);
        setForm((f) => ({ ...f, contact_name: '', contact_phone: '', contact_email: '' }));
    }

    async function save() {
        const start = toDate(form.date, form.startTime);
        const end = toDate(form.date, form.endTime);
        const fail = (msg: string) => { setFormError(msg); toast.error(msg); };
        if (Number.isNaN(start.getTime())) { fail('Selecciona fecha y hora de inicio.'); return; }
        if (end <= start) { fail('La hora de fin debe ser posterior a la de inicio.'); return; }
        if (!contact && !form.contact_name.trim() && !form.contact_phone.trim()) {
            fail('Selecciona un contacto existente o escribe el nombre o WhatsApp del cliente.');
            return;
        }
        setFormError(null);

        setSaving(true);
        try {
            const payload = {
                title: form.title.trim() || null,
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                meeting_type: form.meeting_type,
                meeting_url: form.meeting_type === 'virtual' ? form.meeting_url : null,
                location: form.meeting_type === 'presencial' ? form.location : null,
                contact_id: contact?.id ?? null,
                contact_name: form.contact_name,
                contact_phone: form.contact_phone,
                contact_email: form.contact_email,
                assigned_to: form.assigned_to || null,
                status: form.status,
                color: form.color || null,
                description: form.description,
                notes: form.notes,
            };
            const res = await fetch(appointment ? `/api/appointments/${appointment.id}` : '/api/appointments', {
                method: appointment ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { fail(d.error || 'No se pudo guardar la cita.'); return; }
            toast.success(appointment ? 'Cita actualizada' : 'Cita agendada');
            onSaved?.(d.appointment as AppointmentRow);
            onOpenChange(false);
        } catch {
            fail('Error de conexión al guardar la cita.');
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (!appointment) return;
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setDeleting(true);
        try {
            const res = await fetch(`/api/appointments/${appointment.id}`, { method: 'DELETE' });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || 'No se pudo eliminar la cita'); return; }
            toast.success('Cita eliminada');
            onDeleted?.(appointment.id);
            onOpenChange(false);
        } catch {
            toast.error('Error de conexión al eliminar la cita');
        } finally {
            setDeleting(false);
        }
    }

    const inputCls = 'w-full text-[13px] text-[#1A1A2E] bg-white border border-[#E8E8EC] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 focus:border-[#818CF8] placeholder:text-[#C4C4CE]';
    const labelCls = 'block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[620px] p-0 gap-0 max-h-[92vh] overflow-hidden flex flex-col">
                <div className="px-6 pt-5 pb-3 border-b border-[#F3F4F6]">
                    <DialogTitle className="text-[17px] font-bold text-[#1A1A2E] flex items-center gap-2">
                        <CalendarClock size={18} className="text-[#818CF8]" />
                        {appointment ? 'Editar cita' : 'Nueva cita'}
                    </DialogTitle>
                    <DialogDescription className="text-[12px] text-[#9CA3AF] mt-0.5">
                        Todo queda guardado en el contacto y en el calendario.
                    </DialogDescription>
                </div>

                <div className="px-6 py-4 overflow-y-auto space-y-4">
                    {/* Title */}
                    <input
                        value={form.title}
                        onChange={(e) => set('title', e.target.value)}
                        placeholder={`Título (ej. Asesoría inicial${contact ? ` con ${contact.nombre}` : ''})`}
                        className="w-full text-[18px] font-semibold text-[#1A1A2E] border-0 border-b-2 border-[#E8E8EC] focus:border-[#818CF8] focus:outline-none pb-1.5 placeholder:text-[#C4C4CE] placeholder:font-normal"
                        autoFocus
                    />

                    {/* Date & time */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr] gap-2">
                        <div>
                            <label className={labelCls}>Fecha</label>
                            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Inicio</label>
                            <input type="time" step={300} value={form.startTime} onChange={(e) => changeStart(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Fin</label>
                            <input type="time" step={300} value={form.endTime} onChange={(e) => set('endTime', e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 -mt-2">
                        <span className="text-[11px] text-[#9CA3AF] mr-1">Duración:</span>
                        {DURATIONS.map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setDuration(m)}
                                className={cn(
                                    'px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
                                    duration === m ? 'bg-[#818CF8] border-[#818CF8] text-white' : 'border-[#E8E8EC] text-[#6B7280] hover:border-[#818CF8]'
                                )}
                            >
                                {m < 60 ? `${m} min` : `${m / 60} h`.replace('.5', ',5')}
                            </button>
                        ))}
                        {duration <= 0 && <span className="text-[11px] text-red-500 ml-1">La hora de fin debe ser posterior</span>}
                    </div>

                    {/* Contact */}
                    <div>
                        <label className={labelCls}>Contacto <span className="text-red-500">*</span> <span className="normal-case font-normal text-[#9CA3AF]">— busca uno existente o escribe nombre / WhatsApp abajo</span></label>
                        {contact ? (
                            <div className="flex items-center gap-2 bg-[#F5F5FF] border border-[#E0E3FF] rounded-lg px-3 py-2">
                                <User size={14} className="text-[#818CF8]" />
                                <span className="text-[13px] font-medium text-[#1A1A2E] flex-1 truncate">{contact.nombre}</span>
                                {contact.wa_id && <span className="text-[11px] text-[#9CA3AF]">{contact.wa_id}</span>}
                                {!lockContact && (
                                    <button type="button" onClick={clearContact} className="text-[#9CA3AF] hover:text-[#6B7280]" title="Quitar contacto">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C4C4CE]" />
                                <input
                                    value={query}
                                    onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
                                    onFocus={() => setShowResults(true)}
                                    onBlur={() => setTimeout(() => setShowResults(false), 150)}
                                    placeholder="Buscar contacto por nombre, WhatsApp o correo…"
                                    className={cn(inputCls, 'pl-8')}
                                />
                                {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#9CA3AF]" />}
                                {showResults && query.trim().length >= 2 && (
                                    <div className="absolute z-30 mt-1 w-full bg-white border border-[#E8E8EC] rounded-lg shadow-lg max-h-56 overflow-y-auto">
                                        {results.length === 0 && !searching ? (
                                            <p className="px-3 py-2 text-[12px] text-[#9CA3AF]">
                                                Sin resultados. Escribe los datos abajo y se creará el contacto.
                                            </p>
                                        ) : results.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => pickContact(c)}
                                                className="w-full text-left px-3 py-2 hover:bg-[#F9FAFB] flex items-center gap-2"
                                            >
                                                <User size={13} className="text-[#9CA3AF]" />
                                                <span className="text-[13px] text-[#1A1A2E] flex-1 truncate">{c.nombre}</span>
                                                <span className="text-[11px] text-[#9CA3AF]">{c.wa_id ?? c.email ?? ''}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                            <label className={labelCls}>Nombre</label>
                            <input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Nombre del cliente" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}><span className="inline-flex items-center gap-1"><MessageCircle size={10} /> WhatsApp</span></label>
                            <input value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} placeholder="573001234567" inputMode="tel" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}><span className="inline-flex items-center gap-1"><Mail size={10} /> Correo</span></label>
                            <input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} placeholder="cliente@correo.com" className={inputCls} />
                        </div>
                    </div>

                    {/* Meeting type */}
                    <div>
                        <label className={labelCls}>Tipo de cita</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {MEETING_TYPES.map((t) => {
                                const Icon = t === 'virtual' ? Video : t === 'presencial' ? MapPin : Phone;
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => set('meeting_type', t)}
                                        className={cn(
                                            'flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[12px] font-medium transition-colors',
                                            form.meeting_type === t
                                                ? 'bg-[#EEF0FF] border-[#818CF8] text-[#4F46E5]'
                                                : 'border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]'
                                        )}
                                    >
                                        <Icon size={13} /> {MEETING_TYPE_LABELS[t]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {form.meeting_type === 'virtual' && (
                        <div>
                            <label className={labelCls}><span className="inline-flex items-center gap-1"><Link2 size={10} /> Link de la reunión</span></label>
                            <input value={form.meeting_url} onChange={(e) => set('meeting_url', e.target.value)} placeholder="https://meet.google.com/… · zoom.us/j/… · teams…" className={inputCls} />
                        </div>
                    )}
                    {form.meeting_type === 'presencial' && (
                        <div>
                            <label className={labelCls}><span className="inline-flex items-center gap-1"><MapPin size={10} /> Dirección</span></label>
                            <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Dirección o lugar" className={inputCls} />
                        </div>
                    )}

                    {/* Assignment, status, color */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <label className={labelCls}>Responsable</label>
                            <select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)} className={inputCls}>
                                <option value="">Sin asignar</option>
                                {team.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Estado</label>
                            <select value={form.status} onChange={(e) => set('status', e.target.value as AppointmentStatus)} className={inputCls}>
                                {APPOINTMENT_STATUSES.map((s) => <option key={s} value={s}>{APPOINTMENT_STATUS_LABELS[s]}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}>Color</label>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => set('color', '')}
                                className={cn('h-6 px-2 rounded-full text-[10px] border', !form.color ? 'border-[#1A1A2E] text-[#1A1A2E]' : 'border-[#E8E8EC] text-[#9CA3AF]')}
                                title="Según el estado"
                            >
                                Auto
                            </button>
                            {APPOINTMENT_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => set('color', c)}
                                    className={cn('w-6 h-6 rounded-full border-2 transition-transform', form.color === c ? 'border-[#1A1A2E] scale-110' : 'border-white')}
                                    style={{ backgroundColor: c }}
                                    aria-label={`Color ${c}`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Text */}
                    <div>
                        <label className={labelCls}>Descripción / agenda</label>
                        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="Temas a tratar, servicio, objetivo…" className={cn(inputCls, 'resize-none')} />
                    </div>
                    <div>
                        <label className={labelCls}>Observaciones internas</label>
                        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Notas solo para el equipo" className={cn(inputCls, 'resize-none bg-amber-50/50')} />
                    </div>
                </div>

                {formError && (
                    <div role="alert" className="mx-6 mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
                        {formError}
                    </div>
                )}
                <div className="px-6 py-3 border-t border-[#F3F4F6] flex items-center gap-2 bg-[#FAFAFB]">
                    {appointment && (
                        <button
                            type="button"
                            onClick={remove}
                            disabled={deleting}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors',
                                confirmDelete ? 'bg-red-600 text-white hover:bg-red-700' : 'text-red-600 hover:bg-red-50'
                            )}
                        >
                            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            {confirmDelete ? '¿Eliminar? Confirmar' : 'Eliminar'}
                        </button>
                    )}
                    {appointment && (
                        <span className={cn('text-[11px] px-2 py-0.5 rounded-full')} style={{
                            backgroundColor: APPOINTMENT_STATUS_STYLES[form.status].bg,
                            color: APPOINTMENT_STATUS_STYLES[form.status].text,
                        }}>
                            {APPOINTMENT_STATUS_LABELS[form.status]}
                        </span>
                    )}
                    <div className="flex-1" />
                    <button type="button" onClick={() => onOpenChange(false)} className="px-3 py-2 rounded-lg text-[12px] font-medium text-[#6B7280] hover:bg-[#F3F4F6]">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || duration <= 0}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4F46E5] text-white text-[12px] font-semibold hover:bg-[#4338CA] disabled:opacity-50"
                    >
                        {saving && <Loader2 size={13} className="animate-spin" />}
                        {appointment ? 'Guardar cambios' : 'Agendar cita'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
