'use client';

import { useState, useEffect, useRef } from 'react';
import { X, MessageCircle, ExternalLink, Users, Calendar, Clock, Phone, Mail, MapPin, Hash } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { RESERVATION_STATUS_LABELS, RESERVATION_OCCASION_LABELS, RESERVATION_SOURCE_LABELS } from '@/lib/utils/constants';
import type { Reservation, RestaurantTable, ReservationStatus } from '@/lib/types/database';

// ---- Exported type ----

export type ReservationWithRelations = Reservation & {
    contact: { id: string; nombre: string; wa_id: string | null } | null;
    table: { id: string; name: string; capacity: number } | null;
    event: { id: string; name: string } | null;
};

// ---- Status config ----

const STATUS_CONFIG: Record<ReservationStatus, { label: string; bg: string; text: string; border: string }> = {
    pending:   { label: 'Pendiente',        bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
    confirmed: { label: 'Confirmada',       bg: '#DCFCE7', text: '#14532D', border: '#22C55E' },
    seated:    { label: 'En mesa',          bg: '#EDE9FE', text: '#4C1D95', border: '#818CF8' },
    completed: { label: 'Completada',       bg: '#F3F4F6', text: '#374151', border: '#6B7280' },
    cancelled: { label: 'Cancelada',        bg: '#FEE2E2', text: '#7F1D1D', border: '#EF4444' },
    no_show:   { label: 'No se presentó',  bg: '#FFF7ED', text: '#7C2D12', border: '#F97316' },
};

const ALL_STATUSES: ReservationStatus[] = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];

// ---- Helper: info row ----

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3 py-2.5 border-b border-[#F3F4F6] last:border-0">
            <div className="w-7 h-7 rounded-lg bg-[#F8F8FA] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon size={13} className="text-[#9CA3AF]" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wide leading-none mb-0.5">{label}</p>
                <div className="text-[13px] text-[#1A1A2E] font-medium">{value}</div>
            </div>
        </div>
    );
}

// ---- Section title ----

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-3">{children}</p>
    );
}

// ---- Props ----

type Props = {
    reservation: ReservationWithRelations | null;
    tables: RestaurantTable[];
    onClose: () => void;
    onUpdate: (updated: Partial<ReservationWithRelations> & { id: string }) => void;
};

export function ReservationDetailSlideover({ reservation, tables, onClose, onUpdate }: Props) {
    const [notes, setNotes] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState<ReservationStatus | null>(null);
    const [updatingTable, setUpdatingTable] = useState(false);
    const [sendingConfirm, setSendingConfirm] = useState(false);
    const notesRef = useRef<HTMLTextAreaElement>(null);

    // Sync notes when reservation changes
    useEffect(() => {
        setNotes(reservation?.internal_notes ?? '');
    }, [reservation?.id, reservation?.internal_notes]);

    // Trap scroll on body when open
    useEffect(() => {
        if (reservation) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [!!reservation]);

    if (!reservation) return null;

    // Narrowed constant — safe to use inside async closures without TS re-checking null
    const rsv = reservation;
    const config = STATUS_CONFIG[rsv.status];

    // ---- Patch helper ----
    async function patch(body: Record<string, unknown>) {
        const res = await fetch(`/api/reservations/${rsv.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to update');
        return res.json();
    }

    // ---- Status change ----
    async function handleStatusChange(status: ReservationStatus) {
        if (status === rsv.status) return;
        setUpdatingStatus(status);
        try {
            await patch({ status });
            onUpdate({ id: rsv.id, status });
            toast.success(`Estado cambiado a "${STATUS_CONFIG[status].label}"`);
        } catch {
            toast.error('Error al cambiar el estado');
        } finally {
            setUpdatingStatus(null);
        }
    }

    // ---- Notes save on blur ----
    async function handleNotesBlur() {
        if (notes === (rsv.internal_notes ?? '')) return;
        setSavingNotes(true);
        try {
            await patch({ internal_notes: notes });
            onUpdate({ id: rsv.id, internal_notes: notes });
            toast.success('Notas guardadas');
        } catch {
            toast.error('Error al guardar las notas');
        } finally {
            setSavingNotes(false);
        }
    }

    // ---- Table assignment ----
    async function handleTableChange(tableId: string) {
        setUpdatingTable(true);
        try {
            const newTableId = tableId || null;
            await patch({ table_id: newTableId });
            const newTable = tables.find((t) => t.id === tableId) ?? null;
            // Pass the full RestaurantTable object to satisfy the union type, or null
            onUpdate({
                id: rsv.id,
                table_id: newTableId,
                table: newTable ?? null,
            });
            toast.success(newTable ? `Mesa "${newTable.name}" asignada` : 'Mesa removida');
        } catch {
            toast.error('Error al asignar la mesa');
        } finally {
            setUpdatingTable(false);
        }
    }

    // ---- Send WhatsApp confirmation ----
    async function handleSendConfirmation() {
        setSendingConfirm(true);
        try {
            const res = await fetch(`/api/reservations/${rsv.id}/confirm`, {
                method: 'POST',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Failed');
            if (data.sent) {
                toast.success('Confirmación enviada por WhatsApp');
            } else {
                toast.info('No se pudo enviar: webhook no configurado');
            }
        } catch {
            toast.error('Error al enviar la confirmación');
        } finally {
            setSendingConfirm(false);
        }
    }

    const activeTables = tables.filter((t) => t.is_active);
    const hasWaId = !!rsv.contact?.wa_id;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-300"
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className="fixed right-0 top-0 bottom-0 w-full max-w-[420px] bg-white z-50 flex flex-col shadow-2xl
                           translate-x-0 transition-transform duration-300 ease-out"
                style={{ borderLeft: '1px solid #E8E8EC' }}
            >
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-[#E8E8EC] flex-shrink-0">
                    <div className="min-w-0 flex-1 pr-3">
                        <h2 className="text-[16px] font-bold text-[#1A1A2E] truncate leading-tight">
                            {rsv.guest_name}
                        </h2>
                        {rsv.confirmation_code && (
                            <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                                #{rsv.confirmation_code}
                            </p>
                        )}
                        <div className="mt-1.5">
                            <span
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ backgroundColor: config.bg, color: config.text, border: `1px solid ${config.border}40` }}
                            >
                                {config.label}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#1A1A2E] transition-colors flex-shrink-0"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Info section */}
                    <div className="px-5 pt-4 pb-2">
                        <SectionTitle>Detalles</SectionTitle>
                        <div>
                            <InfoRow
                                icon={Calendar}
                                label="Fecha"
                                value={format(parseISO(rsv.reservation_date), "EEEE d 'de' MMMM yyyy", { locale: es })}
                            />
                            <InfoRow
                                icon={Clock}
                                label="Hora"
                                value={rsv.reservation_time.slice(0, 5)}
                            />
                            <InfoRow
                                icon={Users}
                                label="Personas"
                                value={`${rsv.party_size} persona${rsv.party_size !== 1 ? 's' : ''}`}
                            />
                            {rsv.guest_phone && (
                                <InfoRow
                                    icon={Phone}
                                    label="Teléfono"
                                    value={
                                        <a href={`tel:${rsv.guest_phone}`} className="hover:text-[#818CF8] transition-colors">
                                            {rsv.guest_phone}
                                        </a>
                                    }
                                />
                            )}
                            {rsv.guest_email && (
                                <InfoRow
                                    icon={Mail}
                                    label="Email"
                                    value={
                                        <a href={`mailto:${rsv.guest_email}`} className="hover:text-[#818CF8] transition-colors">
                                            {rsv.guest_email}
                                        </a>
                                    }
                                />
                            )}
                            {rsv.table && (
                                <InfoRow
                                    icon={MapPin}
                                    label="Mesa actual"
                                    value={`${rsv.table.name} · ${rsv.table.capacity} personas`}
                                />
                            )}
                            {rsv.occasion && (
                                <InfoRow
                                    icon={Calendar}
                                    label="Ocasión"
                                    value={RESERVATION_OCCASION_LABELS[rsv.occasion] ?? rsv.occasion}
                                />
                            )}
                            {rsv.source && (
                                <InfoRow
                                    icon={Hash}
                                    label="Fuente"
                                    value={RESERVATION_SOURCE_LABELS[rsv.source] ?? rsv.source}
                                />
                            )}
                            {rsv.special_requests && (
                                <InfoRow
                                    icon={MessageCircle}
                                    label="Peticiones especiales"
                                    value={<span className="text-[#6B7280]">{rsv.special_requests}</span>}
                                />
                            )}
                            {rsv.event && (
                                <InfoRow
                                    icon={Calendar}
                                    label="Evento"
                                    value={rsv.event.name}
                                />
                            )}
                        </div>
                    </div>

                    {/* Contact link */}
                    {rsv.contact && (
                        <div className="px-5 pb-4">
                            <a
                                href={`/contacts/${rsv.contact.id}`}
                                className="inline-flex items-center gap-1.5 text-[12px] text-[#818CF8] font-medium hover:underline"
                            >
                                <ExternalLink size={12} />
                                Ver contacto: {rsv.contact.nombre}
                            </a>
                        </div>
                    )}

                    <div className="border-t border-[#F3F4F6]" />

                    {/* Status change */}
                    <div className="px-5 py-4">
                        <SectionTitle>Cambiar estado</SectionTitle>
                        <div className="flex flex-wrap gap-2">
                            {ALL_STATUSES.map((s) => {
                                const sc = STATUS_CONFIG[s];
                                const isActive = rsv.status === s;
                                const isLoading = updatingStatus === s;
                                return (
                                    <button
                                        key={s}
                                        onClick={() => handleStatusChange(s)}
                                        disabled={isActive || updatingStatus !== null}
                                        className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={
                                            isActive
                                                ? { backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }
                                                : { backgroundColor: '#F8F8FA', color: '#6B7280', border: '1px solid #E8E8EC' }
                                        }
                                    >
                                        {isLoading ? '...' : sc.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-t border-[#F3F4F6]" />

                    {/* Table assignment */}
                    <div className="px-5 py-4">
                        <SectionTitle>Asignar mesa</SectionTitle>
                        <div className="relative">
                            <select
                                value={rsv.table_id ?? ''}
                                onChange={(e) => handleTableChange(e.target.value)}
                                disabled={updatingTable}
                                className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-[10px] outline-none focus:border-[#818CF8] transition-colors appearance-none cursor-pointer disabled:opacity-60"
                            >
                                <option value="">Sin mesa asignada</option>
                                {activeTables.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name} · {t.capacity} personas
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#9CA3AF]">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-[#F3F4F6]" />

                    {/* Internal notes */}
                    <div className="px-5 py-4">
                        <SectionTitle>Notas internas</SectionTitle>
                        <div className="relative">
                            <textarea
                                ref={notesRef}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                onBlur={handleNotesBlur}
                                placeholder="Agregar notas internas..."
                                rows={4}
                                className="w-full px-3 py-2.5 text-[13px] text-[#1A1A2E] bg-[#F8F8FA] border border-[#E8E8EC] rounded-[10px] outline-none focus:border-[#818CF8] focus:bg-white transition-colors resize-none placeholder:text-[#D1D5DB]"
                            />
                            {savingNotes && (
                                <span className="absolute bottom-2.5 right-3 text-[11px] text-[#9CA3AF]">Guardando...</span>
                            )}
                        </div>
                        <p className="text-[11px] text-[#9CA3AF] mt-1.5">Se guarda automáticamente al perder el foco</p>
                    </div>

                    {/* WhatsApp confirmation */}
                    {hasWaId && (
                        <>
                            <div className="border-t border-[#F3F4F6]" />
                            <div className="px-5 py-4">
                                <SectionTitle>WhatsApp</SectionTitle>
                                <button
                                    onClick={handleSendConfirmation}
                                    disabled={sendingConfirm}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                    style={{ backgroundColor: '#25D366' }}
                                >
                                    <MessageCircle size={15} />
                                    {sendingConfirm ? 'Enviando...' : 'Enviar confirmación por WhatsApp'}
                                </button>
                            </div>
                        </>
                    )}

                    {/* Bottom spacer */}
                    <div className="h-6" />
                </div>
            </div>
        </>
    );
}
