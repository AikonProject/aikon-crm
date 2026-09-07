'use client';

import { useState } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isSameDay,
    isToday,
    addMonths,
    subMonths,
    getDay,
    parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Users, Clock } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import type { Reservation, ReservationStatus } from '@/lib/types/database';
import { RESERVATION_STATUS_LABELS } from '@/lib/utils/constants';

type ReservationSummary = Pick<
    Reservation,
    'id' | 'reservation_date' | 'reservation_time' | 'status' | 'guest_name' | 'party_size'
>;

const STATUS_DOT: Record<ReservationStatus, string> = {
    pending: 'bg-yellow-400',
    confirmed: 'bg-green-400',
    seated: 'bg-blue-400',
    completed: 'bg-gray-400',
    cancelled: 'bg-red-400',
    no_show: 'bg-orange-400',
};

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

export function ReservationCalendarClient({
    reservations,
}: {
    reservations: ReservationSummary[];
}) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Padding at start (0 = Sunday)
    const startPadding = getDay(monthStart);

    // Group reservations by date
    const byDate = reservations.reduce<Record<string, ReservationSummary[]>>((acc, r) => {
        if (!acc[r.reservation_date]) acc[r.reservation_date] = [];
        acc[r.reservation_date].push(r);
        return acc;
    }, {});

    const selectedReservations = selectedDay ? (byDate[selectedDay] ?? []) : [];

    return (
        <>
            <PageHeader title="Calendario de Reservas" description="Vista mensual">
                <Link href="/reservations">
                    <Button
                        variant="outline"
                        className="gap-2 rounded-[10px] border-[#E8E8EC] text-[#6B7280]"
                    >
                        <ChevronLeft size={15} />
                        Ver lista
                    </Button>
                </Link>
            </PageHeader>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E8E8EC] p-5">
                    {/* Month nav */}
                    <div className="flex items-center justify-between mb-5">
                        <button
                            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                            className="w-8 h-8 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center transition-colors"
                        >
                            <ChevronLeft size={16} className="text-[#6B7280]" />
                        </button>
                        <h2 className="text-[15px] font-bold text-[#1A1A2E] capitalize">
                            {format(currentDate, 'MMMM yyyy', { locale: es })}
                        </h2>
                        <button
                            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                            className="w-8 h-8 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center transition-colors"
                        >
                            <ChevronRight size={16} className="text-[#6B7280]" />
                        </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 mb-2">
                        {DAY_LABELS.map((d) => (
                            <div
                                key={d}
                                className="text-center text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide py-1"
                            >
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Cells */}
                    <div className="grid grid-cols-7 gap-1">
                        {/* Padding cells */}
                        {Array.from({ length: startPadding }).map((_, i) => (
                            <div key={`pad-${i}`} />
                        ))}

                        {days.map((day) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const dayRes = byDate[dateStr] ?? [];
                            const isSelected = selectedDay === dateStr;
                            const todayDay = isToday(day);

                            return (
                                <button
                                    key={dateStr}
                                    onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                                    className={`relative p-2 rounded-xl min-h-[64px] flex flex-col items-start transition-all text-left ${
                                        isSelected
                                            ? 'bg-[#818CF8] text-white ring-2 ring-[#818CF8]/30'
                                            : todayDay
                                            ? 'bg-[#EEF0FF] text-[#6366F1]'
                                            : 'hover:bg-[#F8F8FA] text-[#1A1A2E]'
                                    }`}
                                >
                                    <span
                                        className={`text-[12px] font-semibold mb-1 ${
                                            isSelected ? 'text-white' : todayDay ? 'text-[#6366F1]' : 'text-[#1A1A2E]'
                                        }`}
                                    >
                                        {format(day, 'd')}
                                    </span>

                                    {dayRes.length > 0 && (
                                        <div className="flex flex-wrap gap-0.5">
                                            {dayRes.slice(0, 3).map((r) => (
                                                <span
                                                    key={r.id}
                                                    className={`w-1.5 h-1.5 rounded-full ${
                                                        isSelected ? 'bg-white/70' : STATUS_DOT[r.status]
                                                    }`}
                                                />
                                            ))}
                                            {dayRes.length > 3 && (
                                                <span
                                                    className={`text-[9px] font-bold ${
                                                        isSelected ? 'text-white/80' : 'text-[#9CA3AF]'
                                                    }`}
                                                >
                                                    +{dayRes.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {dayRes.length > 0 && (
                                        <span
                                            className={`text-[9px] font-medium mt-auto ${
                                                isSelected ? 'text-white/80' : 'text-[#9CA3AF]'
                                            }`}
                                        >
                                            {dayRes.length} res.
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Day detail */}
                <div className="bg-white rounded-2xl border border-[#E8E8EC] p-5">
                    {selectedDay ? (
                        <>
                            <h3 className="text-[14px] font-bold text-[#1A1A2E] mb-1 capitalize">
                                {format(parseISO(selectedDay), "d 'de' MMMM", { locale: es })}
                            </h3>
                            <p className="text-[12px] text-[#9CA3AF] mb-4">
                                {selectedReservations.length} reserva{selectedReservations.length !== 1 ? 's' : ''}
                            </p>

                            {selectedReservations.length === 0 ? (
                                <p className="text-[13px] text-[#9CA3AF] text-center py-8">
                                    Sin reservas este dia
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {selectedReservations.map((r) => (
                                        <div
                                            key={r.id}
                                            className="p-3 rounded-xl border border-[#E8E8EC] hover:border-[#D1D5DB] transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-[13px] font-semibold text-[#1A1A2E] truncate">
                                                    {r.guest_name}
                                                </p>
                                                <span
                                                    className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${STATUS_DOT[r.status]}`}
                                                    title={RESERVATION_STATUS_LABELS[r.status]}
                                                />
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className="flex items-center gap-1 text-[11px] text-[#9CA3AF]">
                                                    <Clock size={10} />
                                                    {r.reservation_time.slice(0, 5)}
                                                </span>
                                                <span className="flex items-center gap-1 text-[11px] text-[#9CA3AF]">
                                                    <Users size={10} />
                                                    {r.party_size} pers.
                                                </span>
                                            </div>
                                            <span className="inline-block mt-1.5 text-[10px] text-[#9CA3AF]">
                                                {RESERVATION_STATUS_LABELS[r.status]}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                            <p className="text-[13px] text-[#9CA3AF]">
                                Selecciona un dia para ver sus reservas
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
