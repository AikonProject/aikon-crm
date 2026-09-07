'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    Plus,
    Search,
    Clock,
    Users,
    MapPin,
    ChevronRight,
    ChevronDown,
    ExternalLink,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NewReservationDialog } from '@/components/reservations/new-reservation-dialog';
import { ReservationDetailSlideover } from '@/components/reservations/reservation-detail-slideover';
import type { ReservationWithRelations } from '@/components/reservations/reservation-detail-slideover';
import { RESERVATION_STATUS_LABELS } from '@/lib/utils/constants';
import type { RestaurantTable, RestaurantEvent, ReservationStatus } from '@/lib/types/database';

// ---- Avatar color ----

function avatarColor(name: string): string {
    const colors = ['#818CF8', '#34D399', '#F97316', '#F59E0B', '#60A5FA', '#A78BFA', '#EC4899', '#14B8A6'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
    return colors[h];
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ---- Status config ----

const STATUS_DOT: Record<ReservationStatus, string> = {
    pending: '#F59E0B',
    confirmed: '#22C55E',
    seated: '#3B82F6',
    completed: '#9CA3AF',
    cancelled: '#EF4444',
    no_show: '#F97316',
};

const STATUS_BG: Record<ReservationStatus, string> = {
    pending: 'bg-amber-50 text-amber-700',
    confirmed: 'bg-green-50 text-green-700',
    seated: 'bg-blue-50 text-blue-700',
    completed: 'bg-gray-100 text-gray-500',
    cancelled: 'bg-red-50 text-red-600',
    no_show: 'bg-orange-50 text-orange-700',
};

// ---- Status Badge ----

function StatusBadge({ status }: { status: ReservationStatus }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${STATUS_BG[status]}`}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_DOT[status] }} />
            {RESERVATION_STATUS_LABELS[status]}
        </span>
    );
}

// ---- Status Dropdown ----

function StatusDropdown({
    reservationId,
    currentStatus,
    onUpdate,
}: {
    reservationId: string;
    currentStatus: ReservationStatus;
    onUpdate: (id: string, status: ReservationStatus) => void;
}) {
    const [open, setOpen] = useState(false);
    const statuses: ReservationStatus[] = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];

    return (
        <div className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(!open);
                }}
                className="p-1 rounded-lg hover:bg-[#F3F4F6] transition-colors text-[#9CA3AF] hover:text-[#6B7280]"
                title="Cambiar estado"
            >
                <ChevronDown size={14} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-8 z-20 bg-white rounded-xl border border-[#E8E8EC] shadow-lg py-1 min-w-[160px]">
                        <p className="px-3 py-1.5 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">
                            Cambiar estado
                        </p>
                        {statuses.map((s) => (
                            <button
                                key={s}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdate(reservationId, s);
                                    setOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[#F8F8FA] transition-colors flex items-center gap-2 ${
                                    s === currentStatus ? 'font-semibold text-[#1A1A2E]' : 'text-[#6B7280]'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_DOT[s] }} />
                                {RESERVATION_STATUS_LABELS[s]}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ---- Filter pill ----

type StatusFilter = '' | ReservationStatus;

const FILTER_PILLS: { key: StatusFilter; label: string }[] = [
    { key: '', label: 'Todas' },
    { key: 'pending', label: 'Pendiente' },
    { key: 'confirmed', label: 'Confirmada' },
    { key: 'completed', label: 'Completada' },
    { key: 'cancelled', label: 'Cancelada' },
    { key: 'no_show', label: 'No asistió' },
];

// ---- Reservation Row ----

function ReservationRow({
    r,
    onSelect,
    onUpdate,
}: {
    r: ReservationWithRelations;
    onSelect: (r: ReservationWithRelations) => void;
    onUpdate: (id: string, status: ReservationStatus) => void;
}) {
    const color = avatarColor(r.guest_name);
    const inits = initials(r.guest_name);

    const dateLabel = format(parseISO(r.reservation_date), "EEE, d MMM / yyyy", { locale: es });
    const timeLabel = r.reservation_time.slice(0, 5);

    const tableLabel = r.table
        ? `${r.table.location ? r.table.location + ' · ' : ''}${r.table.name}`
        : null;

    return (
        <div
            onClick={() => onSelect(r)}
            className="bg-white rounded-xl border border-[#F0F0F4] shadow-sm px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-[#E0E0EA] hover:shadow-md transition-all"
        >
            {/* Avatar */}
            <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0"
                style={{ backgroundColor: color }}
            >
                {inits}
            </div>

            {/* Name + contact */}
            <div className="w-44 flex-shrink-0 min-w-0">
                <p className="text-[13px] font-semibold text-[#1A1A2E] truncate">{r.guest_name}</p>
                {r.guest_phone && (
                    <p className="text-[11px] text-[#9CA3AF] truncate">{r.guest_phone}</p>
                )}
                {r.guest_email && !r.guest_phone && (
                    <p className="text-[11px] text-[#9CA3AF] truncate">{r.guest_email}</p>
                )}
            </div>

            {/* Separator */}
            <div className="hidden sm:block w-px h-8 bg-[#F0F0F4] flex-shrink-0" />

            {/* Date */}
            <div className="hidden sm:block flex-shrink-0 min-w-[130px]">
                <p className="text-[12px] text-[#6B7280] capitalize">{dateLabel}</p>
            </div>

            {/* Time */}
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 w-16">
                <Clock size={13} className="text-[#9CA3AF]" />
                <span className="text-[12px] text-[#6B7280]">{timeLabel}</span>
            </div>

            {/* Party size */}
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 w-10">
                <Users size={13} className="text-[#9CA3AF]" />
                <span className="text-[12px] text-[#6B7280]">{r.party_size}</span>
            </div>

            {/* Table / zone */}
            <div className="hidden lg:flex items-center gap-1.5 flex-1 min-w-0">
                <MapPin size={13} className="text-[#9CA3AF] flex-shrink-0" />
                {tableLabel ? (
                    <span className="text-[12px] text-[#6B7280] truncate">{tableLabel}</span>
                ) : (
                    <span className="text-[12px] text-[#D1D5DB]">Sin mesa</span>
                )}
            </div>

            {/* Status badge + dropdown */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                <StatusBadge status={r.status} />
                <StatusDropdown
                    reservationId={r.id}
                    currentStatus={r.status}
                    onUpdate={onUpdate}
                />
            </div>

            {/* Arrow */}
            <ChevronRight size={15} className="text-[#D1D5DB] flex-shrink-0" />
        </div>
    );
}

// ---- Main Component ----

export function ReservationsPageClient({
    reservations: initialReservations,
    tables,
    events,
    today,
    slug,
}: {
    reservations: ReservationWithRelations[];
    tables: RestaurantTable[];
    events: RestaurantEvent[];
    today: string;
    slug: string;
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [reservations, setReservations] = useState(initialReservations);
    const [filterStatus, setFilterStatus] = useState<StatusFilter>('');
    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedReservation, setSelectedReservation] = useState<ReservationWithRelations | null>(null);

    // ---- Counts per status for filter pills ----
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { '': reservations.length };
        for (const r of reservations) {
            counts[r.status] = (counts[r.status] ?? 0) + 1;
        }
        return counts;
    }, [reservations]);

    // ---- Filtered list ----
    const filtered = useMemo(() => {
        let list = reservations;
        if (filterStatus) list = list.filter((r) => r.status === filterStatus);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(
                (r) =>
                    r.guest_name.toLowerCase().includes(q) ||
                    r.guest_phone?.toLowerCase().includes(q) ||
                    r.guest_email?.toLowerCase().includes(q) ||
                    r.contact?.nombre?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [reservations, filterStatus, search]);

    // ---- Group by date ----
    const grouped = useMemo(() => {
        const map = new Map<string, ReservationWithRelations[]>();
        for (const r of filtered) {
            const d = r.reservation_date;
            if (!map.has(d)) map.set(d, []);
            map.get(d)!.push(r);
        }
        // Sort dates descending
        return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
    }, [filtered]);

    // ---- Handlers ----
    async function handleStatusUpdate(id: string, status: ReservationStatus) {
        setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        try {
            const res = await fetch(`/api/reservations/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error();
            toast.success('Estado actualizado');
            startTransition(() => router.refresh());
        } catch {
            toast.error('Error al actualizar el estado');
            setReservations(initialReservations);
        }
    }

    function handleCreated() {
        setDialogOpen(false);
        toast.success('Reserva creada exitosamente');
        router.refresh();
    }

    function handleSlideoverUpdate(updated: Partial<ReservationWithRelations> & { id: string }) {
        setReservations((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
        setSelectedReservation((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
    }

    function formatDateHeader(dateStr: string): string {
        return format(parseISO(dateStr), "EEEE, d 'de' MMMM", { locale: es })
            .replace(/^./, (c) => c.toUpperCase());
    }

    const bookingUrl = slug ? `/${slug}` : null;

    return (
        <>
            {/* "Ver página del cliente" button */}
            {bookingUrl && (
                <div className="mb-4">
                    <a
                        href={bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-[13px] font-medium transition-opacity hover:opacity-90"
                        style={{ backgroundColor: '#F59E0B' }}
                    >
                        Ver página del cliente
                        <ExternalLink size={13} />
                    </a>
                </div>
            )}

            {/* Top bar: search + filter pills */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                {/* Search */}
                <div className="relative flex-shrink-0 sm:w-72">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Nombre, email, teléfono o código..."
                        className="w-full pl-9 pr-4 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-[10px] outline-none focus:border-[#818CF8] transition-colors"
                    />
                </div>

                {/* Filter pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {FILTER_PILLS.map(({ key, label }) => {
                        const count = statusCounts[key] ?? 0;
                        const active = filterStatus === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setFilterStatus(key)}
                                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all whitespace-nowrap ${
                                    active
                                        ? 'bg-[#1A1A2E] text-white'
                                        : 'bg-white border border-[#E8E8EC] text-[#6B7280] hover:border-[#C4C4CC]'
                                }`}
                            >
                                {label} {count}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-[18px] font-bold text-[#1A1A2E]">Reservas</h2>
                    <span className="px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[12px] font-medium text-[#6B7280]">
                        {filtered.length}
                    </span>
                </div>
                <NewReservationDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    tables={tables}
                    events={events}
                    onCreated={handleCreated}
                >
                    <Button
                        onClick={() => setDialogOpen(true)}
                        className="gap-1.5 rounded-[10px] bg-[#1A1A2E] hover:bg-[#2D2D44] text-white text-[13px] h-9"
                    >
                        <Plus size={15} />
                        Nueva reserva
                    </Button>
                </NewReservationDialog>
            </div>

            {/* Grouped list */}
            {grouped.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-[#F3F4F6] flex items-center justify-center">
                        <Search size={24} className="text-[#D1D5DB]" />
                    </div>
                    <p className="text-[14px] font-medium text-[#6B7280]">No se encontraron reservas</p>
                    <p className="text-[12px] text-[#9CA3AF]">Intenta cambiar los filtros o crea una nueva reserva</p>
                    <Button
                        onClick={() => setDialogOpen(true)}
                        variant="outline"
                        className="gap-2 rounded-[10px] border-[#E8E8EC] text-[#6B7280] mt-2"
                    >
                        <Plus size={14} />
                        Nueva Reserva
                    </Button>
                </div>
            ) : (
                <div className="space-y-5">
                    {grouped.map(([date, rows]) => (
                        <div key={date}>
                            {/* Date section header */}
                            <div className="flex items-center justify-between py-2 mb-2">
                                <span className="text-[13px] font-semibold text-[#6B7280]">
                                    {formatDateHeader(date)}
                                </span>
                                <span className="text-[12px] text-[#9CA3AF]">
                                    {rows.length} reserva{rows.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            {/* Rows */}
                            <div className="space-y-2">
                                {rows.map((r) => (
                                    <ReservationRow
                                        key={r.id}
                                        r={r}
                                        onSelect={setSelectedReservation}
                                        onUpdate={handleStatusUpdate}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ReservationDetailSlideover
                reservation={selectedReservation}
                tables={tables}
                onClose={() => setSelectedReservation(null)}
                onUpdate={handleSlideoverUpdate}
            />
        </>
    );
}
