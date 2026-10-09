'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarClock, Plus, Video, MapPin, Phone, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabaseClient } from '@/lib/supabase/client';
import {
    APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_STYLES, appointmentColor, type AppointmentRow,
} from '@/lib/appointments';
import { AppointmentDialog } from './appointment-dialog';

/**
 * Appointments of one contact: upcoming first, then past. Create / edit / delete
 * in place. Used in the chat side panel (compact) and on the contact page.
 */
export function ContactAppointments({
    contact,
    compact = false,
}: {
    contact: { id: string; nombre: string; wa_id: string | null; email: string | null };
    compact?: boolean;
}) {
    const supabase = useSupabaseClient();
    const [items, setItems] = useState<AppointmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<AppointmentRow | null>(null);
    const [showPast, setShowPast] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`/api/appointments?contact_id=${contact.id}`);
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setError(d.error || 'No se pudieron cargar las citas'); return; }
            setError(null);
            setItems(Array.isArray(d.appointments) ? d.appointments : []);
        } catch {
            setError('Error de conexión al cargar las citas');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [contact.id]);

    useEffect(() => { load(); }, [load]);

    // Realtime: changes from the calendar, other agents or the bot
    useEffect(() => {
        const channel = supabase
            .channel(`appointments:contact:${contact.id}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'appointments', filter: `contact_id=eq.${contact.id}`,
            }, () => load(true))
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [supabase, contact.id, load]);

    const { upcoming, past } = useMemo(() => {
        const now = Date.now();
        const up = items.filter((a) => new Date(a.end_time).getTime() >= now && a.status !== 'cancelled')
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
        const pa = items.filter((a) => !up.includes(a)).sort((a, b) => b.start_time.localeCompare(a.start_time));
        return { upcoming: up, past: pa };
    }, [items]);

    // Stable object: the dialog resets its form whenever the draft changes
    const newDraft = useMemo(
        () => ({ contact: { id: contact.id, nombre: contact.nombre, wa_id: contact.wa_id, email: contact.email } }),
        [contact.id, contact.nombre, contact.wa_id, contact.email]
    );

    function upsert(a: AppointmentRow) {
        setItems((prev) => {
            const rest = prev.filter((x) => x.id !== a.id);
            return a.contact_id === contact.id ? [...rest, a] : rest;
        });
    }

    function openNew() {
        setEditing(null);
        setDialogOpen(true);
    }

    function Row({ a }: { a: AppointmentRow }) {
        const s = new Date(a.start_time);
        const st = APPOINTMENT_STATUS_STYLES[a.status];
        const Icon = a.meeting_type === 'virtual' ? Video : a.meeting_type === 'presencial' ? MapPin : Phone;
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={() => { setEditing(a); setDialogOpen(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(a); setDialogOpen(true); } }}
                className={cn(
                    'w-full text-left flex gap-2 rounded-lg border border-[#F0F0F3] hover:border-[#C7D2FE] hover:bg-[#FAFAFF] transition-colors cursor-pointer',
                    compact ? 'px-2 py-1.5' : 'px-3 py-2.5'
                )}
            >
                <span className="w-1 rounded-full flex-shrink-0" style={{ backgroundColor: appointmentColor(a) }} />
                <div className="min-w-0 flex-1">
                    <p className={cn('font-medium text-[#1A1A2E] truncate', compact ? 'text-[11px]' : 'text-[13px]', a.status === 'cancelled' && 'line-through text-[#9CA3AF]')}>
                        {a.title}
                    </p>
                    <p className={cn('text-[#6B7280] capitalize flex items-center gap-1', compact ? 'text-[10px]' : 'text-[12px]')}>
                        <Icon size={compact ? 9 : 11} className="flex-shrink-0" />
                        {format(s, compact ? "EEE d MMM · h:mm a" : "EEEE d 'de' MMMM · h:mm a", { locale: es })}
                    </p>
                    {!compact && (a.notes || a.description) && (
                        <p className="text-[12px] text-[#9CA3AF] truncate mt-0.5">{a.notes || a.description}</p>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: st.bg, color: st.text }}>
                        {APPOINTMENT_STATUS_LABELS[a.status]}
                    </span>
                    {a.meeting_type === 'virtual' && a.meeting_url && new Date(a.end_time).getTime() >= Date.now() && (
                        <a
                            href={a.meeting_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] font-medium text-[#4F46E5] hover:underline inline-flex items-center gap-0.5"
                        >
                            Unirse <ExternalLink size={9} />
                        </a>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <p className={cn(
                    'font-semibold uppercase tracking-wider flex items-center gap-1',
                    compact ? 'text-[10px] text-[#9CA3AF]' : 'text-[12px] text-[#6B7280]'
                )}>
                    <CalendarClock size={compact ? 10 : 13} /> Citas ({items.length})
                </p>
                <div className="flex items-center gap-2">
                    {!compact && (
                        <Link href="/appointments" className="text-[12px] text-[#818CF8] hover:underline">Ver calendario</Link>
                    )}
                    <button
                        onClick={openNew}
                        className={cn(
                            'flex items-center gap-1 rounded-lg font-medium transition-colors',
                            compact
                                ? 'px-1.5 py-0.5 text-[10px] border border-dashed border-[#C4C4CE] text-[#9CA3AF] hover:border-[#818CF8] hover:text-[#818CF8]'
                                : 'px-3 py-1.5 text-[12px] bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                        )}
                    >
                        <Plus size={compact ? 9 : 13} /> {compact ? 'Agendar' : 'Nueva cita'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-[#C4C4CE]" /></div>
            ) : error ? (
                <div className="text-[11px] text-red-500 flex items-center gap-2">
                    {error}
                    <button onClick={() => load()} className="underline">Reintentar</button>
                </div>
            ) : items.length === 0 ? (
                <p className={cn('text-[#C4C4CE] italic', compact ? 'text-[11px]' : 'text-[13px] py-6 text-center')}>
                    Sin citas. {!compact && 'Agenda la primera con el botón “Nueva cita”.'}
                </p>
            ) : (
                <div className="space-y-1.5">
                    {upcoming.length > 0 && !compact && <p className="text-[11px] font-semibold text-[#4F46E5]">Próximas</p>}
                    {upcoming.map((a) => <Row key={a.id} a={a} />)}
                    {upcoming.length === 0 && compact && <p className="text-[11px] text-[#C4C4CE] italic">Sin citas próximas.</p>}
                    {past.length > 0 && (
                        <>
                            <button
                                onClick={() => setShowPast((v) => !v)}
                                className={cn('text-[#818CF8] hover:underline', compact ? 'text-[10px]' : 'text-[12px] pt-2')}
                            >
                                {showPast ? 'Ocultar anteriores' : `Ver anteriores y canceladas (${past.length})`}
                            </button>
                            {showPast && past.map((a) => <Row key={a.id} a={a} />)}
                        </>
                    )}
                </div>
            )}

            <AppointmentDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                appointment={editing}
                draft={editing ? undefined : newDraft}
                lockContact
                onSaved={upsert}
                onDeleted={(id) => setItems((prev) => prev.filter((x) => x.id !== id))}
            />
        </div>
    );
}
