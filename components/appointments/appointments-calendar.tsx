'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    addDays, addMinutes, addMonths, addWeeks, differenceInMinutes, endOfWeek, format, isSameDay,
    isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
    ChevronLeft, ChevronRight, Plus, Search, Video, MapPin, Phone, CalendarDays, Loader2, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabaseClient } from '@/lib/supabase/client';
import { useTenantId } from '@/components/providers/tenant-provider';
import {
    APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_STYLES, appointmentColor,
    type AppointmentRow,
} from '@/lib/appointments';
import type { AppointmentStatus } from '@/lib/types/database';
import { AppointmentDialog, type AppointmentDraft } from './appointment-dialog';
import { AppointmentDetails } from './appointment-details';

type View = 'day' | 'week' | 'month' | 'agenda';

const VIEW_LABELS: Record<View, string> = { day: 'Día', week: 'Semana', month: 'Mes', agenda: 'Agenda' };
const HOUR_PX = 56;
const SNAP_MIN = 15;
const WEEK_OPTS = { weekStartsOn: 1 as const, locale: es };
const VIEW_KEY = 'aikon.appointments.view';

// ─── helpers ────────────────────────────────────────────────────────────────
function visibleRange(view: View, cursor: Date): { start: Date; end: Date } {
    if (view === 'day') return { start: startOfDay(cursor), end: addDays(startOfDay(cursor), 1) };
    if (view === 'week') {
        const s = startOfWeek(cursor, WEEK_OPTS);
        return { start: s, end: addDays(s, 7) };
    }
    if (view === 'month') {
        const s = startOfWeek(startOfMonth(cursor), WEEK_OPTS);
        return { start: s, end: addDays(s, 42) };
    }
    return { start: startOfDay(cursor), end: addDays(startOfDay(cursor), 60) };
}

function rangeTitle(view: View, cursor: Date): string {
    if (view === 'day') return format(cursor, "EEEE d 'de' MMMM yyyy", { locale: es });
    if (view === 'week') {
        const s = startOfWeek(cursor, WEEK_OPTS);
        const e = endOfWeek(cursor, WEEK_OPTS);
        return isSameMonth(s, e)
            ? `${format(s, 'd')} – ${format(e, "d 'de' MMMM yyyy", { locale: es })}`
            : `${format(s, 'd MMM', { locale: es })} – ${format(e, 'd MMM yyyy', { locale: es })}`;
    }
    if (view === 'month') return format(cursor, 'MMMM yyyy', { locale: es });
    return `Desde ${format(cursor, "d 'de' MMMM", { locale: es })}`;
}

function minutesOfDay(d: Date) {
    return d.getHours() * 60 + d.getMinutes();
}

/** Side-by-side columns for overlapping events (Google Calendar style). */
function layoutDay(events: AppointmentRow[], day: Date) {
    const dayStart = startOfDay(day);
    const dayEnd = addDays(dayStart, 1);
    const items = events
        .map((e) => {
            const s = new Date(e.start_time);
            const en = new Date(e.end_time);
            const top = Math.max(0, differenceInMinutes(s < dayStart ? dayStart : s, dayStart));
            const bottom = Math.min(24 * 60, differenceInMinutes(en > dayEnd ? dayEnd : en, dayStart));
            return { e, top, bottom: Math.max(bottom, top + 15) };
        })
        .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

    const out: { e: AppointmentRow; top: number; bottom: number; col: number; cols: number }[] = [];
    let cluster: typeof out = [];
    let clusterEnd = -1;
    const flush = () => {
        const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
        cluster.forEach((c) => { c.cols = cols; out.push(c); });
        cluster = [];
    };
    for (const it of items) {
        if (it.top >= clusterEnd && cluster.length) flush();
        const used = new Set(cluster.filter((c) => c.bottom > it.top).map((c) => c.col));
        let col = 0;
        while (used.has(col)) col++;
        cluster.push({ ...it, col, cols: 1 });
        clusterEnd = Math.max(clusterEnd, it.bottom);
    }
    if (cluster.length) flush();
    return out;
}

function MeetingIcon({ type, size = 10 }: { type: AppointmentRow['meeting_type']; size?: number }) {
    const Icon = type === 'virtual' ? Video : type === 'presencial' ? MapPin : Phone;
    return <Icon size={size} className="flex-shrink-0" />;
}

type DragState = {
    mode: 'move' | 'resize' | 'create';
    id: string | null;
    pointerStartY: number;
    origStart: Date;
    origEnd: Date;
    origDayIndex: number;
    moved: boolean;
};

function MiniMonth({
    cursor, range, view, appointments, onPick,
}: {
    cursor: Date;
    range: { start: Date; end: Date };
    view: View;
    appointments: AppointmentRow[];
    onPick: (d: Date) => void;
}) {
    const [month, setMonth] = useState(() => startOfMonth(cursor));
    useEffect(() => { setMonth(startOfMonth(cursor)); }, [cursor]);
    const start = startOfWeek(month, WEEK_OPTS);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const busy = useMemo(() => new Set(appointments.map((a) => format(new Date(a.start_time), 'yyyy-MM-dd'))), [appointments]);
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] font-semibold text-[#1A1A2E] capitalize">{format(month, 'MMMM yyyy', { locale: es })}</p>
                <div className="flex">
                    <button onClick={() => setMonth(subMonths(month, 1))} className="p-1 rounded hover:bg-[#F3F4F6]" aria-label="Mes anterior"><ChevronLeft size={14} /></button>
                    <button onClick={() => setMonth(addMonths(month, 1))} className="p-1 rounded hover:bg-[#F3F4F6]" aria-label="Mes siguiente"><ChevronRight size={14} /></button>
                </div>
            </div>
            <div className="grid grid-cols-7 text-center">
                {cells.slice(0, 7).map((d) => (
                    <span key={d.toISOString()} className="text-[10px] text-[#9CA3AF] py-1 uppercase">{format(d, 'EEEEE', { locale: es })}</span>
                ))}
                {cells.map((d) => {
                    const inRange = d >= range.start && d < range.end && (view === 'week' || view === 'day');
                    return (
                        <button
                            key={d.toISOString()}
                            onClick={() => onPick(d)}
                            className={cn(
                                'relative h-7 w-7 mx-auto rounded-full text-[11px] hover:bg-[#E8E8EC]',
                                !isSameMonth(d, month) && 'text-[#C4C4CE]',
                                inRange && 'bg-[#EEF0FF]',
                                isSameDay(d, cursor) && 'bg-[#C7D2FE]',
                                isToday(d) && 'bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                            )}
                        >
                            {format(d, 'd')}
                            {busy.has(format(d, 'yyyy-MM-dd')) && !isToday(d) && (
                                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#818CF8]" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── component ──────────────────────────────────────────────────────────────
export function AppointmentsCalendar() {
    const supabase = useSupabaseClient();
    const tenantId = useTenantId();

    const [view, setView] = useState<View>('week');
    const [cursor, setCursor] = useState(() => new Date());
    const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [hiddenStatuses, setHiddenStatuses] = useState<Set<AppointmentStatus>>(new Set());
    const [assignee, setAssignee] = useState('');
    const [team, setTeam] = useState<{ id: string; full_name: string }[]>([]);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<AppointmentRow | null>(null);
    const [draft, setDraft] = useState<AppointmentDraft | undefined>(undefined);

    const [drag, setDrag] = useState<DragState | null>(null);
    const [preview, setPreview] = useState<{ id: string | null; start: Date; end: Date } | null>(null);
    const [now, setNow] = useState(() => new Date());

    const gridRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const range = useMemo(() => visibleRange(view, cursor), [view, cursor]);
    const days = useMemo(() => {
        if (view === 'day') return [startOfDay(cursor)];
        if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(range.start, i));
        return [];
    }, [view, cursor, range.start]);

    // ── Remember the chosen view ──────────────────────────────────────────
    useEffect(() => {
        try {
            const v = localStorage.getItem(VIEW_KEY) as View | null;
            if (v && v in VIEW_LABELS) setView(v);
        } catch { /* storage unavailable */ }
    }, []);
    function changeView(v: View) {
        setView(v);
        try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
    }

    // ── Data ───────────────────────────────────────────────────────────────
    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const params = new URLSearchParams({ from: range.start.toISOString(), to: range.end.toISOString() });
            const res = await fetch(`/api/appointments?${params}`);
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (!silent) toast.error(d.error || 'No se pudieron cargar las citas');
                return;
            }
            setAppointments(Array.isArray(d.appointments) ? d.appointments : []);
        } catch {
            if (!silent) toast.error('Error de conexión al cargar las citas');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [range.start, range.end]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        fetch('/api/settings/team')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setTeam(Array.isArray(d?.users) ? d.users : []))
            .catch(() => { /* filter is optional */ });
    }, []);

    // Realtime: other agents (or the bot) create/move appointments
    useEffect(() => {
        const channel = supabase
            .channel('appointments-calendar')
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'appointments', filter: `tenant_id=eq.${tenantId}`,
            }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    const id = (payload.old as { id?: string })?.id;
                    if (id) setAppointments((prev) => prev.filter((a) => a.id !== id));
                }
                if (refreshTimer.current) clearTimeout(refreshTimer.current);
                refreshTimer.current = setTimeout(() => load(true), 300);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [supabase, tenantId, load]);

    // Current-time line
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(t);
    }, []);

    // Scroll the time grid to the working day
    useEffect(() => {
        if ((view === 'week' || view === 'day') && scrollRef.current) {
            const hour = days.some((d) => isToday(d)) ? Math.max(0, new Date().getHours() - 2) : 7;
            scrollRef.current.scrollTop = hour * HOUR_PX;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, cursor]);

    // ── Filters ────────────────────────────────────────────────────────────
    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return appointments.filter((a) => {
            if (hiddenStatuses.has(a.status)) return false;
            if (assignee === '__none' ? a.assigned_to : assignee && a.assigned_to !== assignee) return false;
            if (!q) return true;
            return [a.title, a.contact?.nombre, a.contact_name, a.contact_phone, a.contact_email, a.notes]
                .some((v) => (v ?? '').toLowerCase().includes(q));
        });
    }, [appointments, search, hiddenStatuses, assignee]);

    const selected = appointments.find((a) => a.id === selectedId) ?? null;

    // ── Navigation & shortcuts ────────────────────────────────────────────
    const go = useCallback((dir: -1 | 1) => {
        setCursor((c) => {
            if (view === 'day') return dir === 1 ? addDays(c, 1) : subDays(c, 1);
            if (view === 'week') return dir === 1 ? addWeeks(c, 1) : subWeeks(c, 1);
            if (view === 'month') return dir === 1 ? addMonths(c, 1) : subMonths(c, 1);
            return dir === 1 ? addDays(c, 30) : subDays(c, 30);
        });
    }, [view]);

    const openCreate = useCallback((start?: Date, end?: Date) => {
        setEditing(null);
        setDraft({ start, end });
        setDialogOpen(true);
    }, []);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const t = e.target as HTMLElement;
            if (dialogOpen || t.closest('input, textarea, select, [contenteditable]')) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const k = e.key.toLowerCase();
            if (k === 't') setCursor(new Date());
            else if (k === 'd') changeView('day');
            else if (k === 'w' || k === 's') changeView('week');
            else if (k === 'm') changeView('month');
            else if (k === 'a') changeView('agenda');
            else if (k === 'n' || k === 'c') openCreate();
            else if (e.key === 'ArrowLeft') go(-1);
            else if (e.key === 'ArrowRight') go(1);
            else if (e.key === 'Escape') setSelectedId(null);
            else return;
            e.preventDefault();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dialogOpen, go, openCreate]);

    // ── Save a moved/resized appointment ──────────────────────────────────
    async function reschedule(id: string, start: Date, end: Date) {
        const prev = appointments.find((a) => a.id === id);
        if (!prev) return;
        setAppointments((list) => list.map((a) => (a.id === id ? { ...a, start_time: start.toISOString(), end_time: end.toISOString() } : a)));
        try {
            const res = await fetch(`/api/appointments/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start_time: start.toISOString(), end_time: end.toISOString() }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || 'No se pudo mover la cita');
            setAppointments((list) => list.map((a) => (a.id === id ? d.appointment : a)));
            toast.success(`Cita movida al ${format(start, "EEE d MMM, h:mm a", { locale: es })}`);
        } catch (err) {
            setAppointments((list) => list.map((a) => (a.id === id ? prev : a)));
            toast.error(err instanceof Error ? err.message : 'No se pudo mover la cita');
        }
    }

    // ── Time-grid pointer interactions (move / resize / drag-to-create) ───
    function pointerToSlot(clientX: number, clientY: number): { dayIndex: number; minutes: number } | null {
        const grid = gridRef.current;
        if (!grid) return null;
        const rect = grid.getBoundingClientRect();
        const colW = rect.width / days.length;
        const dayIndex = Math.min(days.length - 1, Math.max(0, Math.floor((clientX - rect.left) / colW)));
        const minutes = Math.min(24 * 60, Math.max(0, ((clientY - rect.top) / HOUR_PX) * 60));
        return { dayIndex, minutes };
    }

    function startDrag(e: React.PointerEvent, mode: DragState['mode'], appt: AppointmentRow | null, dayIndex: number) {
        if (e.button !== 0) return;
        e.stopPropagation();
        const slot = pointerToSlot(e.clientX, e.clientY);
        if (!slot) return;
        let origStart: Date;
        let origEnd: Date;
        if (appt) {
            origStart = new Date(appt.start_time);
            origEnd = new Date(appt.end_time);
        } else {
            const snapped = Math.floor(slot.minutes / 30) * 30;
            origStart = addMinutes(days[dayIndex], snapped);
            origEnd = addMinutes(origStart, 30);
        }
        setDrag({ mode, id: appt?.id ?? null, pointerStartY: e.clientY, origStart, origEnd, origDayIndex: dayIndex, moved: false });
        if (mode === 'create') setPreview({ id: null, start: origStart, end: origEnd });
    }

    useEffect(() => {
        if (!drag) return;
        function onMove(e: PointerEvent) {
            if (!drag) return;
            const slot = pointerToSlot(e.clientX, e.clientY);
            if (!slot) return;
            const dy = e.clientY - drag.pointerStartY;
            const deltaMin = Math.round(((dy / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN;
            const moved = drag.moved || Math.abs(dy) > 4 || slot.dayIndex !== drag.origDayIndex;
            if (moved && !drag.moved) setDrag({ ...drag, moved: true });
            if (!moved) return;
            if (drag.mode === 'move') {
                const dayShift = slot.dayIndex - drag.origDayIndex;
                const start = addMinutes(addDays(drag.origStart, dayShift), deltaMin);
                const end = addMinutes(addDays(drag.origEnd, dayShift), deltaMin);
                setPreview({ id: drag.id, start, end });
            } else if (drag.mode === 'resize') {
                const end = addMinutes(drag.origEnd, deltaMin);
                setPreview({ id: drag.id, start: drag.origStart, end: end <= addMinutes(drag.origStart, SNAP_MIN) ? addMinutes(drag.origStart, SNAP_MIN) : end });
            } else {
                const day = days[drag.origDayIndex];
                const cur = addMinutes(day, Math.round(slot.minutes / SNAP_MIN) * SNAP_MIN);
                const anchor = drag.origStart;
                if (cur > addMinutes(anchor, SNAP_MIN)) setPreview({ id: null, start: anchor, end: cur });
                else if (cur < anchor) setPreview({ id: null, start: cur, end: addMinutes(anchor, 30) });
                else setPreview({ id: null, start: anchor, end: addMinutes(anchor, 30) });
            }
        }
        function onUp() {
            const d = drag;
            const p = preview;
            setDrag(null);
            setPreview(null);
            if (!d) return;
            if (d.mode === 'create') {
                openCreate(p?.start ?? d.origStart, p?.end ?? d.origEnd);
                return;
            }
            if (!d.moved || !p || !d.id) {
                if (d.id) setSelectedId(d.id);
                return;
            }
            if (p.start.getTime() !== d.origStart.getTime() || p.end.getTime() !== d.origEnd.getTime()) {
                reschedule(d.id, p.start, p.end);
            }
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drag, preview, days]);

    // ── Month drag & drop (keeps the time, changes the day) ───────────────
    function dropOnDay(id: string, day: Date) {
        const a = appointments.find((x) => x.id === id);
        if (!a) return;
        const s = new Date(a.start_time);
        const e = new Date(a.end_time);
        const ns = new Date(day);
        ns.setHours(s.getHours(), s.getMinutes(), 0, 0);
        if (isSameDay(ns, s)) return;
        reschedule(id, ns, addMinutes(ns, differenceInMinutes(e, s)));
    }

    // ── Upcoming (side list) ──────────────────────────────────────────────
    const [upcoming, setUpcoming] = useState<AppointmentRow[]>([]);
    const loadUpcoming = useCallback(async () => {
        try {
            const params = new URLSearchParams({ from: new Date().toISOString(), to: addDays(new Date(), 14).toISOString() });
            const res = await fetch(`/api/appointments?${params}`);
            const d = await res.json().catch(() => ({}));
            if (res.ok) setUpcoming((d.appointments ?? []).filter((a: AppointmentRow) => a.status !== 'cancelled').slice(0, 8));
        } catch { /* side list only */ }
    }, []);
    useEffect(() => { loadUpcoming(); }, [loadUpcoming, appointments]);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const a of appointments) c[a.status] = (c[a.status] ?? 0) + 1;
        return c;
    }, [appointments]);

    function upsertLocal(a: AppointmentRow) {
        setAppointments((prev) => (prev.some((x) => x.id === a.id) ? prev.map((x) => (x.id === a.id ? a : x)) : [...prev, a]));
    }
    function removeLocal(id: string) {
        setAppointments((prev) => prev.filter((x) => x.id !== id));
        setSelectedId((s) => (s === id ? null : s));
    }

    // ── Render pieces ─────────────────────────────────────────────────────
    function renderTimeGrid() {
        const nowMin = minutesOfDay(now);
        return (
            <div className="flex flex-col flex-1 min-h-0">
                {/* Day headers */}
                <div className="flex border-b border-[#E8E8EC] bg-white sticky top-0 z-10">
                    <div className="w-14 flex-shrink-0 text-[10px] text-[#9CA3AF] flex items-end justify-end pr-2 pb-1">
                        GMT{format(now, 'xxx')}
                    </div>
                    {days.map((d) => (
                        <button
                            key={d.toISOString()}
                            onClick={() => { setCursor(d); changeView('day'); }}
                            className="flex-1 py-2 text-center border-l border-[#F3F4F6] hover:bg-[#F9FAFB]"
                        >
                            <p className={cn('text-[11px] font-medium uppercase', isToday(d) ? 'text-[#4F46E5]' : 'text-[#6B7280]')}>
                                {format(d, 'EEE', { locale: es })}
                            </p>
                            <p className={cn(
                                'mx-auto mt-0.5 w-9 h-9 rounded-full flex items-center justify-center text-[20px]',
                                isToday(d) ? 'bg-[#4F46E5] text-white font-semibold' : 'text-[#1A1A2E]'
                            )}>
                                {format(d, 'd')}
                            </p>
                        </button>
                    ))}
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto relative select-none">
                    <div className="flex relative" style={{ height: HOUR_PX * 24 }}>
                        {/* Hours gutter */}
                        <div className="w-14 flex-shrink-0 relative">
                            {Array.from({ length: 24 }, (_, h) => (
                                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-[#9CA3AF]" style={{ top: h * HOUR_PX }}>
                                    {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'h a')}
                                </span>
                            ))}
                        </div>

                        {/* Columns */}
                        <div ref={gridRef} className="flex-1 flex relative">
                            {Array.from({ length: 24 }, (_, h) => (
                                <div key={h} className="absolute left-0 right-0 border-t border-[#F0F0F3]" style={{ top: h * HOUR_PX }}>
                                    <div className="border-t border-dashed border-[#F7F7F9]" style={{ marginTop: HOUR_PX / 2 - 1 }} />
                                </div>
                            ))}
                            {days.map((d, dayIndex) => {
                                const dayEvents = visible.filter((a) => {
                                    if (preview?.id === a.id) return false;
                                    const s = new Date(a.start_time);
                                    const e = new Date(a.end_time);
                                    return s < addDays(startOfDay(d), 1) && e > startOfDay(d);
                                });
                                const laid = layoutDay(dayEvents, d);
                                const previewHere = preview && isSameDay(preview.start, d);
                                const previewAppt = preview?.id ? appointments.find((a) => a.id === preview.id) : null;
                                return (
                                    <div
                                        key={d.toISOString()}
                                        className={cn('flex-1 relative border-l border-[#F0F0F3]', isToday(d) && 'bg-[#FAFAFF]')}
                                        onPointerDown={(e) => startDrag(e, 'create', null, dayIndex)}
                                    >
                                        {laid.map(({ e: a, top, bottom, col, cols }) => {
                                            const color = appointmentColor(a);
                                            const height = ((bottom - top) / 60) * HOUR_PX;
                                            const short = height < 38;
                                            return (
                                                <div
                                                    key={a.id}
                                                    onPointerDown={(ev) => startDrag(ev, 'move', a, dayIndex)}
                                                    className={cn(
                                                        'absolute rounded-md px-1.5 py-0.5 text-white overflow-hidden cursor-grab active:cursor-grabbing shadow-sm border border-white/60 group',
                                                        selectedId === a.id && 'ring-2 ring-offset-1 ring-[#1A1A2E]/40',
                                                        a.status === 'cancelled' && 'opacity-60',
                                                        (a.status === 'completed' || new Date(a.end_time) < now) && 'opacity-80'
                                                    )}
                                                    style={{
                                                        top: (top / 60) * HOUR_PX,
                                                        height: Math.max(height - 1, 16),
                                                        left: `calc(${(col / cols) * 100}% + 2px)`,
                                                        width: `calc(${100 / cols}% - 4px)`,
                                                        backgroundColor: color,
                                                    }}
                                                    title={`${a.title} · ${format(new Date(a.start_time), 'h:mm a')}`}
                                                >
                                                    <p className={cn('text-[11px] font-semibold leading-tight truncate', a.status === 'cancelled' && 'line-through')}>
                                                        {short ? `${a.title}, ${format(new Date(a.start_time), 'h:mm a')}` : a.title}
                                                    </p>
                                                    {!short && (
                                                        <p className="text-[10px] opacity-90 leading-tight truncate flex items-center gap-1">
                                                            <MeetingIcon type={a.meeting_type} />
                                                            {format(new Date(a.start_time), 'h:mm')} – {format(new Date(a.end_time), 'h:mm a')}
                                                        </p>
                                                    )}
                                                    {height > 56 && (a.contact?.nombre || a.contact_name) && (
                                                        <p className="text-[10px] opacity-90 truncate">{a.contact?.nombre ?? a.contact_name}</p>
                                                    )}
                                                    <div
                                                        onPointerDown={(ev) => startDrag(ev, 'resize', a, dayIndex)}
                                                        className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-black/10"
                                                    />
                                                </div>
                                            );
                                        })}

                                        {previewHere && preview && (
                                            <div
                                                className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-white shadow-lg z-20 pointer-events-none"
                                                style={{
                                                    top: (minutesOfDay(preview.start) / 60) * HOUR_PX,
                                                    height: Math.max((differenceInMinutes(preview.end, preview.start) / 60) * HOUR_PX - 1, 16),
                                                    backgroundColor: previewAppt ? appointmentColor(previewAppt) : '#818CF8',
                                                    opacity: 0.9,
                                                }}
                                            >
                                                <p className="text-[11px] font-semibold truncate">{previewAppt?.title ?? '(Nueva cita)'}</p>
                                                <p className="text-[10px]">{format(preview.start, 'h:mm')} – {format(preview.end, 'h:mm a')}</p>
                                            </div>
                                        )}

                                        {isToday(d) && (
                                            <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: (nowMin / 60) * HOUR_PX }}>
                                                <div className="relative border-t-2 border-red-500">
                                                    <span className="absolute -left-1.5 -top-[7px] w-3 h-3 rounded-full bg-red-500" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    function renderMonth() {
        const cells = Array.from({ length: 42 }, (_, i) => addDays(range.start, i));
        return (
            <div className="flex flex-col flex-1 min-h-0">
                <div className="grid grid-cols-7 border-b border-[#E8E8EC]">
                    {cells.slice(0, 7).map((d) => (
                        <p key={d.toISOString()} className="text-center text-[11px] font-medium uppercase text-[#6B7280] py-2">
                            {format(d, 'EEE', { locale: es })}
                        </p>
                    ))}
                </div>
                <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-[560px]">
                    {cells.map((d) => {
                        const list = visible
                            .filter((a) => isSameDay(new Date(a.start_time), d))
                            .sort((a, b) => a.start_time.localeCompare(b.start_time));
                        return (
                            <div
                                key={d.toISOString()}
                                onClick={() => openCreate(addMinutes(startOfDay(d), 9 * 60), addMinutes(startOfDay(d), 9 * 60 + 30))}
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-[#EEF0FF]'); }}
                                onDragLeave={(e) => e.currentTarget.classList.remove('bg-[#EEF0FF]')}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.remove('bg-[#EEF0FF]');
                                    const id = e.dataTransfer.getData('text/appointment');
                                    if (id) dropOnDay(id, d);
                                }}
                                className={cn(
                                    'border-r border-b border-[#F0F0F3] p-1 min-h-0 overflow-hidden cursor-pointer hover:bg-[#FAFAFB] transition-colors',
                                    !isSameMonth(d, cursor) && 'bg-[#FAFAFB]'
                                )}
                            >
                                <button
                                    onClick={(e) => { e.stopPropagation(); setCursor(d); changeView('day'); }}
                                    className={cn(
                                        'w-6 h-6 rounded-full text-[12px] flex items-center justify-center mx-auto mb-0.5 hover:bg-[#E8E8EC]',
                                        isToday(d) ? 'bg-[#4F46E5] text-white font-semibold hover:bg-[#4338CA]' : isSameMonth(d, cursor) ? 'text-[#1A1A2E]' : 'text-[#C4C4CE]'
                                    )}
                                >
                                    {format(d, 'd')}
                                </button>
                                <div className="space-y-0.5">
                                    {list.slice(0, 3).map((a) => (
                                        <div
                                            key={a.id}
                                            draggable
                                            onDragStart={(e) => e.dataTransfer.setData('text/appointment', a.id)}
                                            onClick={(e) => { e.stopPropagation(); setSelectedId(a.id); }}
                                            className={cn(
                                                'flex items-center gap-1 px-1 py-0.5 rounded text-[11px] truncate hover:bg-[#F3F4F6] cursor-pointer',
                                                selectedId === a.id && 'bg-[#EEF0FF]'
                                            )}
                                        >
                                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: appointmentColor(a) }} />
                                            <span className="text-[#6B7280] flex-shrink-0">{format(new Date(a.start_time), 'h:mma').toLowerCase()}</span>
                                            <span className={cn('truncate text-[#1A1A2E] font-medium', a.status === 'cancelled' && 'line-through text-[#9CA3AF]')}>{a.title}</span>
                                        </div>
                                    ))}
                                    {list.length > 3 && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setCursor(d); changeView('day'); }}
                                            className="text-[11px] font-medium text-[#6B7280] hover:text-[#4F46E5] px-1"
                                        >
                                            {list.length - 3} más
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    function renderAgenda() {
        const byDay = new Map<string, AppointmentRow[]>();
        for (const a of [...visible].sort((x, y) => x.start_time.localeCompare(y.start_time))) {
            const k = format(new Date(a.start_time), 'yyyy-MM-dd');
            byDay.set(k, [...(byDay.get(k) ?? []), a]);
        }
        if (byDay.size === 0) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
                    <CalendarDays size={36} className="text-[#C4C4CE] mb-3" />
                    <p className="text-[14px] text-[#6B7280]">No hay citas en los próximos 60 días.</p>
                    <button onClick={() => openCreate()} className="mt-3 text-[13px] text-[#4F46E5] font-medium hover:underline">+ Agendar una cita</button>
                </div>
            );
        }
        return (
            <div className="flex-1 overflow-y-auto divide-y divide-[#F3F4F6]">
                {[...byDay.entries()].map(([k, list]) => {
                    const d = new Date(`${k}T00:00:00`);
                    return (
                        <div key={k} className="flex gap-4 px-4 py-3">
                            <div className="w-20 flex-shrink-0 text-center">
                                <p className={cn('text-[24px] leading-none', isToday(d) ? 'text-[#4F46E5] font-semibold' : 'text-[#1A1A2E]')}>{format(d, 'd')}</p>
                                <p className="text-[11px] uppercase text-[#6B7280] mt-1">{format(d, 'MMM, EEE', { locale: es })}</p>
                            </div>
                            <div className="flex-1 space-y-1 min-w-0">
                                {list.map((a) => (
                                    <button
                                        key={a.id}
                                        onClick={() => setSelectedId(a.id)}
                                        className={cn('w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#F9FAFB]', selectedId === a.id && 'bg-[#EEF0FF]')}
                                    >
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: appointmentColor(a) }} />
                                        <span className="text-[12px] text-[#6B7280] w-32 flex-shrink-0">
                                            {format(new Date(a.start_time), 'h:mm a')} – {format(new Date(a.end_time), 'h:mm a')}
                                        </span>
                                        <span className={cn('text-[13px] font-medium text-[#1A1A2E] truncate', a.status === 'cancelled' && 'line-through text-[#9CA3AF]')}>{a.title}</span>
                                        <span className="text-[12px] text-[#9CA3AF] truncate hidden md:inline">{a.contact?.nombre ?? a.contact_name ?? ''}</span>
                                        <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                                            <span className="text-[#9CA3AF]"><MeetingIcon type={a.meeting_type} size={13} /></span>
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: APPOINTMENT_STATUS_STYLES[a.status].bg, color: APPOINTMENT_STATUS_STYLES[a.status].text }}>
                                                {APPOINTMENT_STATUS_LABELS[a.status]}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // ── Layout ────────────────────────────────────────────────────────────
    return (
        <div className="-m-6 lg:-m-8 -mt-2 lg:-mt-4 flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-1rem)] bg-white border-t border-[#E8E8EC]">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#E8E8EC]">
                <h1 className="text-[20px] font-bold text-[#1A1A2E] mr-2 flex items-center gap-2">
                    <CalendarDays size={20} className="text-[#818CF8]" /> Citas
                </h1>
                <button onClick={() => setCursor(new Date())} className="px-3 py-1.5 rounded-lg border border-[#E8E8EC] text-[13px] font-medium text-[#1A1A2E] hover:bg-[#F9FAFB]" title="Hoy (T)">
                    Hoy
                </button>
                <div className="flex">
                    <button onClick={() => go(-1)} className="p-1.5 rounded-full hover:bg-[#F3F4F6]" title="Anterior (←)"><ChevronLeft size={18} /></button>
                    <button onClick={() => go(1)} className="p-1.5 rounded-full hover:bg-[#F3F4F6]" title="Siguiente (→)"><ChevronRight size={18} /></button>
                </div>
                <p className="text-[17px] font-medium text-[#1A1A2E] capitalize min-w-0 truncate">{rangeTitle(view, cursor)}</p>
                {loading && <Loader2 size={15} className="animate-spin text-[#9CA3AF]" />}

                <div className="flex-1" />

                <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#C4C4CE]" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar citas…"
                        className="w-44 pl-7 pr-2 py-1.5 text-[13px] border border-[#E8E8EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30"
                    />
                </div>
                <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="py-1.5 px-2 text-[13px] border border-[#E8E8EC] rounded-lg bg-white focus:outline-none"
                    title="Responsable"
                >
                    <option value="">Todo el equipo</option>
                    <option value="__none">Sin asignar</option>
                    {team.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
                <div className="flex rounded-lg border border-[#E8E8EC] overflow-hidden">
                    {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
                        <button
                            key={v}
                            onClick={() => changeView(v)}
                            className={cn('px-3 py-1.5 text-[13px] font-medium transition-colors', view === v ? 'bg-[#EEF0FF] text-[#4F46E5]' : 'text-[#6B7280] hover:bg-[#F9FAFB]')}
                        >
                            {VIEW_LABELS[v]}
                        </button>
                    ))}
                </div>
                <button onClick={() => load()} className="p-1.5 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]" title="Actualizar">
                    <RefreshCw size={15} />
                </button>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Left rail */}
                <aside className="hidden xl:flex w-64 flex-shrink-0 flex-col gap-5 p-4 border-r border-[#E8E8EC] overflow-y-auto">
                    <button
                        onClick={() => openCreate()}
                        className="flex items-center gap-2 self-start pl-3 pr-5 py-3 rounded-2xl bg-white shadow-md border border-[#E8E8EC] text-[14px] font-semibold text-[#1A1A2E] hover:shadow-lg hover:bg-[#F9FAFB] transition-all"
                        title="Nueva cita (N)"
                    >
                        <Plus size={20} className="text-[#4F46E5]" /> Nueva cita
                    </button>
                    <MiniMonth cursor={cursor} range={range} view={view} appointments={appointments} onPick={setCursor} />
                    <div>
                        <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Estados</p>
                        <div className="space-y-1">
                            {APPOINTMENT_STATUSES.map((s) => (
                                <label key={s} className="flex items-center gap-2 text-[13px] text-[#1A1A2E] cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!hiddenStatuses.has(s)}
                                        onChange={() => setHiddenStatuses((prev) => {
                                            const n = new Set(prev);
                                            if (n.has(s)) n.delete(s); else n.add(s);
                                            return n;
                                        })}
                                        className="w-3.5 h-3.5 rounded"
                                        style={{ accentColor: APPOINTMENT_STATUS_STYLES[s].dot }}
                                    />
                                    <span className="flex-1">{APPOINTMENT_STATUS_LABELS[s]}</span>
                                    <span className="text-[11px] text-[#9CA3AF]">{counts[s] ?? 0}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Próximas citas</p>
                        {upcoming.length === 0 ? (
                            <p className="text-[12px] text-[#C4C4CE] italic">Nada en los próximos 14 días.</p>
                        ) : (
                            <div className="space-y-1">
                                {upcoming.map((a) => (
                                    <button
                                        key={a.id}
                                        onClick={() => { setCursor(new Date(a.start_time)); setSelectedId(a.id); }}
                                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#F9FAFB] flex gap-2"
                                    >
                                        <span className="w-1 rounded-full flex-shrink-0" style={{ backgroundColor: appointmentColor(a) }} />
                                        <span className="min-w-0">
                                            <span className="block text-[12px] font-medium text-[#1A1A2E] truncate">{a.title}</span>
                                            <span className="block text-[11px] text-[#9CA3AF] capitalize">{format(new Date(a.start_time), "EEE d MMM · h:mm a", { locale: es })}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="text-[10px] text-[#C4C4CE] leading-relaxed mt-auto">
                        Atajos: <b>N</b> nueva · <b>T</b> hoy · <b>D/S/M/A</b> vistas · <b>← →</b> navegar. Arrastra para mover o crear.
                    </p>
                </aside>

                {/* Main view */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
                    {(view === 'week' || view === 'day') && renderTimeGrid()}
                    {view === 'month' && renderMonth()}
                    {view === 'agenda' && renderAgenda()}

                    {/* Floating create button (small screens) */}
                    <button
                        onClick={() => openCreate()}
                        className="xl:hidden absolute bottom-5 right-5 z-20 w-14 h-14 rounded-2xl bg-[#4F46E5] text-white shadow-lg flex items-center justify-center hover:bg-[#4338CA]"
                        title="Nueva cita"
                    >
                        <Plus size={24} />
                    </button>
                </div>

                {/* Details */}
                {selected && (
                    <aside className="w-full sm:w-[360px] flex-shrink-0 border-l border-[#E8E8EC] absolute sm:relative inset-0 sm:inset-auto z-30 sm:z-auto">
                        <AppointmentDetails
                            appointment={selected}
                            onClose={() => setSelectedId(null)}
                            onEdit={() => { setEditing(selected); setDraft(undefined); setDialogOpen(true); }}
                            onChanged={upsertLocal}
                            onDeleted={removeLocal}
                        />
                    </aside>
                )}
            </div>

            <AppointmentDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                appointment={editing}
                draft={draft}
                onSaved={(a) => { upsertLocal(a); setSelectedId(a.id); }}
                onDeleted={removeLocal}
            />
        </div>
    );
}
