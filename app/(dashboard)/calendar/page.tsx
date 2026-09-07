'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin } from 'lucide-react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { mockCalendarEvents, mockContacts } from '@/lib/mock-data';
import { EVENT_TYPE_COLORS } from '@/lib/utils/colors';
import { EVENT_TYPE_LABELS } from '@/lib/utils/constants';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { CalendarEvent } from '@/lib/types/database';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Pad start of month
    const startDayOfWeek = getDay(monthStart);
    const paddingDays = Array.from({ length: startDayOfWeek }, (_, i) => {
        const d = new Date(monthStart);
        d.setDate(d.getDate() - (startDayOfWeek - i));
        return d;
    });

    const allDays = [...paddingDays, ...days];

    const getEventsForDay = (day: Date) => {
        return mockCalendarEvents.filter((event) =>
            isSameDay(new Date(event.start_time), day)
        );
    };

    return (
        <>
            <Breadcrumb />
            <PageHeader
                title="Calendario"
                description="Gestiona tus reuniones y seguimientos"
            >
                <Button className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white">
                    <Plus size={16} />
                    Nuevo evento
                </Button>
            </PageHeader>

            {/* Month Selector */}
            <div className="flex items-center gap-3 mb-5">
                <button
                    onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#E8E8EC] text-[#9CA3AF] hover:bg-[#F9FAFB] transition-colors"
                >
                    <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1.5 overflow-x-auto">
                    {MONTHS.map((month, idx) => (
                        <button
                            key={month}
                            onClick={() => {
                                const d = new Date(currentDate);
                                d.setMonth(idx);
                                setCurrentDate(d);
                            }}
                            className={`px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all ${idx === currentMonth
                                    ? 'bg-[#1A1A2E] text-white'
                                    : 'text-[#6B7280] hover:bg-[#F3F4F6]'
                                }`}
                        >
                            {month}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#E8E8EC] text-[#9CA3AF] hover:bg-[#F9FAFB] transition-colors"
                >
                    <ChevronRight size={16} />
                </button>
                <span className="text-[15px] font-semibold text-[#1A1A2E] ml-2">
                    {currentYear}
                </span>
            </div>

            {/* Calendar Grid */}
            <div className="crm-card overflow-hidden">
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-[#E8E8EC]">
                    {DAYS.map((day) => (
                        <div
                            key={day}
                            className="py-3 text-center text-[12px] font-semibold text-[#9CA3AF] uppercase"
                        >
                            {day}
                        </div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7">
                    {allDays.map((day, idx) => {
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isToday = isSameDay(day, new Date());
                        const dayEvents = getEventsForDay(day);

                        return (
                            <div
                                key={idx}
                                className={`min-h-[100px] border-b border-r border-[#F3F4F6] p-2 ${!isCurrentMonth ? 'bg-[#FAFAFA]' : 'bg-white'
                                    }`}
                            >
                                <span
                                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px] font-medium mb-1 ${isToday
                                            ? 'bg-[#818CF8] text-white'
                                            : isCurrentMonth
                                                ? 'text-[#1A1A2E]'
                                                : 'text-[#D1D5DB]'
                                        }`}
                                >
                                    {format(day, 'd')}
                                </span>
                                <div className="space-y-1">
                                    {dayEvents.slice(0, 2).map((event) => {
                                        const colors = EVENT_TYPE_COLORS[event.event_type] || EVENT_TYPE_COLORS.task;
                                        return (
                                            <button
                                                key={event.id}
                                                onClick={() => setSelectedEvent(event)}
                                                className="w-full text-left px-2 py-1 rounded-lg text-[11px] font-medium truncate transition-opacity hover:opacity-80"
                                                style={{ backgroundColor: colors.bg, color: colors.text }}
                                            >
                                                {format(new Date(event.start_time), 'HH:mm')} {event.title}
                                            </button>
                                        );
                                    })}
                                    {dayEvents.length > 2 && (
                                        <p className="text-[10px] text-[#9CA3AF] px-1">
                                            +{dayEvents.length - 2} más
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Event Detail Modal */}
            {selectedEvent && (
                <div
                    className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedEvent(null)}
                >
                    <div
                        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-[18px] font-bold text-[#1A1A2E]">
                                    {selectedEvent.title}
                                </h3>
                                <span
                                    className="text-[12px] font-medium px-2 py-0.5 rounded-full mt-1 inline-block"
                                    style={{
                                        backgroundColor: EVENT_TYPE_COLORS[selectedEvent.event_type]?.bg,
                                        color: EVENT_TYPE_COLORS[selectedEvent.event_type]?.text,
                                    }}
                                >
                                    {EVENT_TYPE_LABELS[selectedEvent.event_type]}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedEvent(null)}
                                className="text-[#9CA3AF] hover:text-[#6B7280]"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-[13px] text-[#6B7280]">
                                <Clock size={14} />
                                {format(new Date(selectedEvent.start_time), 'EEEE dd MMMM, HH:mm', { locale: es })}
                                {' — '}
                                {format(new Date(selectedEvent.end_time), 'HH:mm')}
                            </div>
                            {selectedEvent.location && (
                                <div className="flex items-center gap-2 text-[13px] text-[#6B7280]">
                                    <MapPin size={14} />
                                    {selectedEvent.location}
                                </div>
                            )}
                            {selectedEvent.description && (
                                <p className="text-[13px] text-[#6B7280] leading-relaxed pt-2 border-t border-[#F3F4F6]">
                                    {selectedEvent.description}
                                </p>
                            )}
                            {selectedEvent.contact_id && (
                                <div className="pt-2 border-t border-[#F3F4F6]">
                                    <p className="text-[12px] text-[#9CA3AF] mb-1">Contacto</p>
                                    <p className="text-[13px] font-medium text-[#1A1A2E]">
                                        {(() => {
                                            const c = mockContacts.find((c) => c.id === selectedEvent.contact_id);
                                            return c ? (c as unknown as { nombre?: string }).nombre ?? '—' : '—';
                                        })()}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
