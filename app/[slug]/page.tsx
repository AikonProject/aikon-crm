'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Minus, Plus, Check, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TenantPublic = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color?: string | null;
  booking_bg_color?: string | null;
  booking_bg_image_url?: string | null;
  corporate_events_enabled?: boolean;
  corporate_min_party_size?: number;
  corporate_contact_link?: string | null;
  table_selection_enabled?: boolean;
  table_spaces?: string[];
};
type TableRow = {
  id: string;
  name: string;
  capacity: number;
  location: string | null;
};
type ScheduleRow = {
  id: string;
  day_of_week: number;
  shift_name: string | null;
  open_time: string;
  close_time: string;
  slot_duration_minutes: number | null;
};
type MenuRow = {
  id: string;
  name: string;
  menu_url: string | null;
  is_default: boolean | null;
};
type EventRow = {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  price: number | null;
  currency: string | null;
  max_guests: number | null;
  image_url: string | null;
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_HEADERS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
const QUICK_SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12];
type StepId = 'date' | 'time' | 'partysize' | 'table' | 'name' | 'contact' | 'confirm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

function generateTimeSlots(schedules: ScheduleRow[], dateStr: string): string[] {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun
  const matched = schedules.filter((s) => s.day_of_week === dow);
  const slots: string[] = [];
  for (const s of matched) {
    const [oh, om] = s.open_time.split(':').map(Number);
    const [ch, cm] = s.close_time.split(':').map(Number);
    const openMin = oh * 60 + om;
    // close_time "00:00" means midnight (next day) → 24*60 = 1440
    const closeMin = ch === 0 && cm === 0 ? 24 * 60 : ch * 60 + cm;
    const interval = s.slot_duration_minutes && s.slot_duration_minutes > 0 ? s.slot_duration_minutes : 90;
    let cur = openMin;
    while (cur < closeMin) {
      slots.push(`${pad2(Math.floor(cur / 60) % 24)}:${pad2(cur % 60)}`);
      cur += interval;
    }
  }
  // Deduplicate (in case shifts overlap) and sort
  return [...new Set(slots)].sort();
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function todayStr(): string {
  const n = new Date();
  return toDateStr(n.getFullYear(), n.getMonth(), n.getDate());
}

// ---------------------------------------------------------------------------
// Marquee CSS (injected once)
// ---------------------------------------------------------------------------
const marqueeCSS = `
@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
`;

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();

  // Data
  const [tenant, setTenant] = useState<TenantPublic | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Wizard state
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  // Calendar state
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const accent = tenant?.primary_color || '#C8961C';
  const bgColor = tenant?.booking_bg_color || '#0D0D0D';
  const bgImageUrl = tenant?.booking_bg_image_url || null;
  const corporateEnabled = tenant?.corporate_events_enabled ?? false;
  const corporateMinSize = tenant?.corporate_min_party_size ?? 10;
  const corporateLink = tenant?.corporate_contact_link ?? null;
  const tableSelectionEnabled = !!(tenant?.table_selection_enabled) && tables.length > 0;
  const tableSpaces = tenant?.table_spaces ?? [];

  // Build dynamic step sequence
  const stepIds: StepId[] = useMemo(() => {
    const ids: StepId[] = ['date', 'time', 'partysize'];
    if (tableSelectionEnabled) ids.push('table');
    ids.push('name', 'contact', 'confirm');
    return ids;
  }, [tableSelectionEnabled]);

  const TOTAL_STEPS = stepIds.length;
  const currentStepId = stepIds[step - 1] as StepId | undefined;

  // Filtered tables by selected space
  const filteredTables = useMemo(() => {
    if (!selectedSpace) return tables;
    return tables.filter((t) => t.location === selectedSpace);
  }, [tables, selectedSpace]);

  // Fetch tenant data
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/${slug}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setTenant(data.tenant);
        setSchedules(data.schedules ?? []);
        setEvents(data.events ?? []);
        setMenus(data.menus ?? []);
        setTables(data.tables ?? []);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Time slots for selected date
  const timeSlots = useMemo(() => {
    if (!selectedDate) return [];
    return generateTimeSlots(schedules, selectedDate);
  }, [selectedDate, schedules]);

  // Calendar days
  const calendarDays = useMemo(() => getCalendarDays(calYear, calMonth), [calYear, calMonth]);

  const today = todayStr();

  // Step titles (based on step ID)
  const stepTitleMap: Record<StepId, string> = {
    date: 'Elige tu fecha',
    time: 'Selecciona el horario',
    partysize: '¿Cuantos son?',
    table: 'Elige tu mesa',
    name: 'Tu nombre',
    contact: 'Tu contacto',
    confirm: 'Confirmación',
  };
  const currentStepTitle = currentStepId ? stepTitleMap[currentStepId] : '';

  // Can continue?
  const canContinue = useCallback((): boolean => {
    switch (currentStepId) {
      case 'date': return selectedDate !== '';
      case 'time': return selectedTime !== '';
      case 'partysize': return partySize >= 1 && partySize <= 20 && !(corporateEnabled && corporateLink && partySize >= corporateMinSize);
      case 'table': return selectedTableId !== null;
      case 'name': return guestName.trim().length > 0;
      case 'contact': return guestPhone.trim().length > 0 || guestEmail.trim().length > 0;
      case 'confirm': return true;
      default: return false;
    }
  }, [currentStepId, selectedDate, selectedTime, partySize, selectedTableId, guestName, guestPhone, guestEmail, corporateEnabled, corporateLink, corporateMinSize]);

  // Navigation
  function goBack() {
    if (step > 1) {
      setStep(step - 1);
      setFormError(null);
    }
  }

  function goNext() {
    if (!canContinue()) return;
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      setFormError(null);
    }
  }

  // Reset when date changes (clear time selection)
  function handleDateSelect(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedTime('');
  }

  // Submit reservation
  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/public/${slug}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim() || null,
          guest_email: guestEmail.trim() || null,
          reservation_date: selectedDate,
          reservation_time: selectedTime,
          party_size: partySize,
          table_id: selectedTableId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al crear la reserva');
      setConfirmationCode(data.reservation?.confirmation_code ?? null);
      setSubmitted(true);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error al crear la reserva');
    } finally {
      setSubmitting(false);
    }
  }

  function resetWizard() {
    setStep(1);
    setSelectedDate('');
    setSelectedTime('');
    setPartySize(2);
    setSelectedTableId(null);
    setSelectedSpace(null);
    setGuestName('');
    setGuestPhone('');
    setGuestEmail('');
    setSubmitted(false);
    setConfirmationCode(null);
    setFormError(null);
  }

  // Calendar navigation
  function prevMonth() {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  }
  function nextMonth() {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Not found
  // ---------------------------------------------------------------------------
  if (notFound || !tenant) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
          <span className="text-3xl">?</span>
        </div>
        <h1 className="text-xl font-bold text-white text-center">Restaurante no encontrado</h1>
        <p className="text-sm text-white/40 text-center max-w-xs">
          El enlace que visitaste no corresponde a ningún restaurante activo.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success screen
  // ---------------------------------------------------------------------------
  if (submitted) {
    return (
      <div
        className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-4"
        style={bgImageUrl ? {
          backgroundImage: `linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.65)), url(${bgImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {
          background: `radial-gradient(ellipse at bottom right, ${accent}15 0%, ${bgColor} 70%)`,
        }}
      >
        <style>{marqueeCSS}</style>
        <div className="flex flex-col items-center gap-6 max-w-[520px] w-full">
          {/* Checkmark */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: accent }}
          >
            <Check className="w-10 h-10 text-[#0D0D0D]" strokeWidth={3} />
          </div>

          <h2 className="text-2xl font-bold text-white text-center">Reserva confirmada</h2>

          {confirmationCode && (
            <div className="bg-[#1C1C1C] rounded-2xl border border-white/10 px-6 py-4 text-center">
              <p className="text-xs text-white/40 mb-1 uppercase tracking-wider">Codigo de reserva</p>
              <p className="text-2xl font-bold tracking-[0.2em]" style={{ color: accent }}>
                {confirmationCode}
              </p>
            </div>
          )}

          {/* Summary */}
          <div className="bg-[#1C1C1C] rounded-2xl border border-white/10 p-5 w-full space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-white/40">Fecha</span>
              <span className="text-white">{formatDateShort(selectedDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Hora</span>
              <span className="text-white">{selectedTime}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Personas</span>
              <span className="text-white">{partySize}</span>
            </div>
            {selectedTableId && (
              <div className="flex justify-between">
                <span className="text-white/40">Mesa</span>
                <span className="text-white">{tables.find((t) => t.id === selectedTableId)?.name ?? '—'}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-white/40">Nombre</span>
              <span className="text-white">{guestName}</span>
            </div>
          </div>

          {/* Menu link */}
          {menus.length > 0 && menus.find((m) => m.menu_url)?.menu_url && (
            <a
              href={menus.find((m) => m.menu_url)!.menu_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-2xl text-base font-bold text-center transition-opacity hover:opacity-90 border flex items-center justify-center gap-2"
              style={{ borderColor: `${accent}60`, color: accent }}
            >
              Ver el menú
            </a>
          )}

          <button
            onClick={resetWizard}
            className="w-full py-4 rounded-2xl text-base font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent, color: '#0D0D0D' }}
          >
            Hacer otra reserva
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main wizard
  // ---------------------------------------------------------------------------
  return (
    <div
      className="min-h-screen bg-[#0D0D0D] flex flex-col text-white"
      style={bgImageUrl ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.65)), url(${bgImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : {
        background: `radial-gradient(ellipse at bottom right, ${accent}15 0%, ${bgColor} 70%)`,
      }}
    >
      <style>{marqueeCSS}</style>

      {/* Events ticker */}
      {events.length > 0 && (
        <div
          className="w-full overflow-hidden py-2.5 text-sm font-medium"
          style={{ backgroundColor: `${accent}20`, color: accent }}
        >
          <div
            className="whitespace-nowrap flex"
            style={{ animation: 'marquee 30s linear infinite' }}
          >
            {/* Duplicate content for seamless loop */}
            {[...events, ...events].map((ev, i) => (
              <span key={`${ev.id}-${i}`} className="mx-6">
                ✦ {ev.name} · {formatEventDate(ev.event_date)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        {/* Back button */}
        <button
          onClick={goBack}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-opacity ${
            step === 1 ? 'opacity-0 pointer-events-none' : 'opacity-100 hover:bg-white/5'
          }`}
        >
          <ChevronLeft className="w-5 h-5 text-white/60" />
        </button>

        {/* Center: restaurant name + step title */}
        <div className="text-center flex-1">
          {tenant.logo_url && (
            <img
              src={tenant.logo_url}
              alt={tenant.name}
              className="h-8 object-contain mx-auto mb-1"
            />
          )}
          <p className="text-[11px] uppercase tracking-[0.15em] text-white/40 mb-0.5">
            {tenant.name}
          </p>
          <h1 className="text-lg font-bold text-white">{currentStepTitle}</h1>
        </div>

        {/* Right side: menu button or step counter */}
        <div className="w-auto min-w-[40px] flex items-center justify-end">
          {menus.length > 0 && menus[0].menu_url ? (
            <a
              href={menus[0].menu_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
              style={{ borderColor: `${accent}60`, color: accent }}
            >
              Ver menú
            </a>
          ) : (
            <span className="text-sm text-white/40 font-medium">{step}/{TOTAL_STEPS}</span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center px-5 py-4 overflow-y-auto">
        <div className="w-full max-w-[520px]">
          {/* Step: Date calendar */}
          {currentStepId === 'date' && (
            <div className="bg-[#1C1C1C] rounded-2xl border border-white/10 p-5">
              {/* Month/year header */}
              <div className="flex items-center justify-between mb-5">
                <button
                  onClick={prevMonth}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition"
                >
                  <ChevronLeft className="w-5 h-5 text-white/60" />
                </button>
                <h3 className="text-base font-semibold text-white">
                  {MONTH_NAMES[calMonth]} {calYear}
                </h3>
                <button
                  onClick={nextMonth}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition"
                >
                  <ChevronRight className="w-5 h-5 text-white/60" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-2">
                {DAY_HEADERS.map((dh) => (
                  <div key={dh} className="text-center text-xs text-white/30 font-medium py-1">
                    {dh}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-y-1">
                {calendarDays.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} />;
                  }
                  const dateStr = toDateStr(calYear, calMonth, day);
                  const isPast = dateStr < today;
                  const isToday = dateStr === today;
                  const isSelected = dateStr === selectedDate;

                  return (
                    <button
                      key={dateStr}
                      disabled={isPast}
                      onClick={() => handleDateSelect(dateStr)}
                      className={`relative mx-auto w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        isPast
                          ? 'opacity-30 cursor-not-allowed text-white/50'
                          : isSelected
                            ? 'text-[#0D0D0D] font-bold'
                            : 'text-white hover:bg-white/5 cursor-pointer'
                      }`}
                      style={isSelected ? { backgroundColor: accent } : undefined}
                    >
                      {day}
                      {isToday && !isSelected && (
                        <span
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                          style={{ backgroundColor: accent }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step: Time slots */}
          {currentStepId === 'time' && (
            <div>
              {timeSlots.length === 0 ? (
                <div className="bg-[#1C1C1C] rounded-2xl border border-white/10 p-8 text-center">
                  <p className="text-white/40 text-base">
                    No hay turnos disponibles para esta fecha
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {timeSlots.map((slot) => {
                    const isSelected = slot === selectedTime;
                    return (
                      <button
                        key={slot}
                        onClick={() => setSelectedTime(slot)}
                        className={`py-3.5 rounded-2xl text-base font-medium transition-all border ${
                          isSelected
                            ? 'border-transparent text-[#0D0D0D] font-bold'
                            : 'border-white/10 bg-[#1C1C1C] text-white hover:border-white/20'
                        }`}
                        style={isSelected ? { backgroundColor: accent } : undefined}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step: Party size */}
          {currentStepId === 'partysize' && (
            <div className="flex flex-col items-center gap-8">
              {/* Big counter */}
              <div className="flex items-center gap-8">
                <button
                  onClick={() => setPartySize(Math.max(1, partySize - 1))}
                  disabled={partySize <= 1}
                  className="w-14 h-14 rounded-full bg-[#1C1C1C] border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="w-6 h-6" />
                </button>
                <span className="text-7xl font-bold text-white tabular-nums min-w-[100px] text-center">
                  {partySize}
                </span>
                <button
                  onClick={() => setPartySize(Math.min(20, partySize + 1))}
                  disabled={partySize >= 20}
                  className="w-14 h-14 rounded-full bg-[#1C1C1C] border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              {/* Quick select pills */}
              <div className="flex flex-wrap justify-center gap-2.5">
                {QUICK_SIZES.map((n) => {
                  const isSelected = n === partySize;
                  return (
                    <button
                      key={n}
                      onClick={() => setPartySize(n)}
                      className={`w-12 h-12 rounded-full text-sm font-semibold transition-all border ${
                        isSelected
                          ? 'border-transparent text-[#0D0D0D]'
                          : 'border-white/10 bg-[#1C1C1C] text-white hover:border-white/20'
                      }`}
                      style={isSelected ? { backgroundColor: accent } : undefined}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>

              {/* Corporate events notice */}
              {corporateEnabled && corporateLink && partySize >= corporateMinSize && (
                <div className="w-full max-w-[520px] bg-[#1C1C1C] rounded-2xl border border-white/10 p-5 text-center mt-4">
                  <p className="text-white/70 text-sm mb-3">
                    Para grupos de {corporateMinSize}+ personas, contáctanos directamente para una atención personalizada.
                  </p>
                  <a
                    href={corporateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block w-full py-3 rounded-xl text-base font-bold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: accent, color: '#0D0D0D' }}
                  >
                    Contactar para evento corporativo
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Step: Table selection */}
          {currentStepId === 'table' && (
            <div className="flex flex-col gap-4">
              {/* Space selector (if spaces configured) */}
              {tableSpaces.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={() => setSelectedSpace(null)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                      selectedSpace === null
                        ? 'border-transparent text-[#0D0D0D] font-bold'
                        : 'border-white/10 bg-[#1C1C1C] text-white hover:border-white/20'
                    }`}
                    style={selectedSpace === null ? { backgroundColor: accent } : undefined}
                  >
                    Todos
                  </button>
                  {tableSpaces.map((space) => (
                    <button
                      key={space}
                      onClick={() => { setSelectedSpace(space); setSelectedTableId(null); }}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                        selectedSpace === space
                          ? 'border-transparent text-[#0D0D0D] font-bold'
                          : 'border-white/10 bg-[#1C1C1C] text-white hover:border-white/20'
                      }`}
                      style={selectedSpace === space ? { backgroundColor: accent } : undefined}
                    >
                      {space}
                    </button>
                  ))}
                </div>
              )}

              {/* Tables grid */}
              {filteredTables.length === 0 ? (
                <div className="bg-[#1C1C1C] rounded-2xl border border-white/10 p-8 text-center">
                  <p className="text-white/40 text-base">No hay mesas disponibles</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredTables.map((t) => {
                    const isSelected = t.id === selectedTableId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTableId(t.id)}
                        className={`p-4 rounded-2xl text-left transition-all border ${
                          isSelected
                            ? 'border-transparent'
                            : 'border-white/10 bg-[#1C1C1C] hover:border-white/20'
                        }`}
                        style={isSelected ? { backgroundColor: accent } : undefined}
                      >
                        <p className={`text-base font-bold ${isSelected ? 'text-[#0D0D0D]' : 'text-white'}`}>
                          {t.name}
                        </p>
                        <p className={`text-xs mt-0.5 ${isSelected ? 'text-[#0D0D0D]/70' : 'text-white/40'}`}>
                          {t.capacity} personas{t.location ? ` · ${t.location}` : ''}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step: Name */}
          {currentStepId === 'name' && (
            <div className="flex flex-col items-center gap-4">
              <label className="text-white/40 text-base">¿Como te llamamos?</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Tu nombre"
                autoFocus
                className="bg-[#1C1C1C] border border-white/15 rounded-2xl text-white text-lg px-5 py-4 w-full focus:outline-none text-center placeholder:text-white/20"
                style={{ boxShadow: guestName ? `0 0 0 2px ${accent}` : undefined }}
              />
            </div>
          )}

          {/* Step: Contact */}
          {currentStepId === 'contact' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-white/40 text-sm mb-2 block">Telefono</label>
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="+52 55 0000 0000"
                  autoFocus
                  className="bg-[#1C1C1C] border border-white/15 rounded-2xl text-white text-lg px-5 py-4 w-full focus:outline-none placeholder:text-white/20"
                  style={{
                    boxShadow: guestPhone ? `0 0 0 2px ${accent}` : undefined,
                  }}
                />
              </div>
              <div>
                <label className="text-white/40 text-sm mb-2 block">Correo electronico</label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="bg-[#1C1C1C] border border-white/15 rounded-2xl text-white text-lg px-5 py-4 w-full focus:outline-none placeholder:text-white/20"
                  style={{
                    boxShadow: guestEmail ? `0 0 0 2px ${accent}` : undefined,
                  }}
                />
              </div>
              <p className="text-white/30 text-xs text-center mt-1">
                Al menos uno de los dos es necesario
              </p>
            </div>
          )}

          {/* Step: Confirmation */}
          {currentStepId === 'confirm' && (
            <div className="flex flex-col gap-5">
              <div className="bg-[#1C1C1C] rounded-2xl border border-white/10 p-5 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Fecha</span>
                  <span className="text-white font-medium">{formatDateShort(selectedDate)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Hora</span>
                  <span className="text-white font-medium">{selectedTime}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Personas</span>
                  <span className="text-white font-medium">{partySize}</span>
                </div>
                {selectedTableId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Mesa</span>
                    <span className="text-white font-medium">
                      {tables.find((t) => t.id === selectedTableId)?.name ?? '—'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Nombre</span>
                  <span className="text-white font-medium">{guestName}</span>
                </div>
                {guestPhone && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Telefono</span>
                    <span className="text-white font-medium">{guestPhone}</span>
                  </div>
                )}
                {guestEmail && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Email</span>
                    <span className="text-white font-medium">{guestEmail}</span>
                  </div>
                )}
              </div>

              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3">
                  <p className="text-sm text-red-400">{formError}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 py-4">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <div
            key={s}
            className="w-2 h-2 rounded-full transition-all"
            style={{
              backgroundColor: s === step ? accent : 'rgba(255,255,255,0.15)',
            }}
          />
        ))}
      </div>

      {/* Continue / Confirm button */}
      <div className="px-5 pb-6">
        {currentStepId !== 'confirm' ? (
          <button
            onClick={goNext}
            disabled={!canContinue()}
            className="w-full py-4 rounded-2xl text-base font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              backgroundColor: canContinue() ? accent : `${accent}50`,
              color: '#0D0D0D',
            }}
          >
            Continuar
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-4 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: accent, color: '#0D0D0D' }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Enviando...
              </>
            ) : (
              'Confirmar reserva'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
