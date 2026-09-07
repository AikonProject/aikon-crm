'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RESERVATION_OCCASION_LABELS } from '@/lib/utils/constants';
import type { RestaurantTable, RestaurantEvent } from '@/lib/types/database';
import { format } from 'date-fns';

type FormState = {
    guest_name: string;
    guest_phone: string;
    guest_email: string;
    reservation_date: string;
    reservation_time: string;
    party_size: string;
    table_id: string;
    event_id: string;
    occasion: string;
    special_requests: string;
    internal_notes: string;
    source: string;
};

const INITIAL_FORM: FormState = {
    guest_name: '',
    guest_phone: '',
    guest_email: '',
    reservation_date: format(new Date(), 'yyyy-MM-dd'),
    reservation_time: '20:00',
    party_size: '2',
    table_id: '',
    event_id: '',
    occasion: '',
    special_requests: '',
    internal_notes: '',
    source: 'manual',
};

// Generate time slots every 30 minutes
function generateTimeSlots(): string[] {
    const slots: string[] = [];
    for (let h = 12; h <= 23; h++) {
        slots.push(`${String(h).padStart(2, '0')}:00`);
        slots.push(`${String(h).padStart(2, '0')}:30`);
    }
    return slots;
}

const TIME_SLOTS = generateTimeSlots();

type NewReservationDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tables: RestaurantTable[];
    events: RestaurantEvent[];
    onCreated: () => void;
    children?: React.ReactNode;
};

export function NewReservationDialog({
    open,
    onOpenChange,
    tables,
    events,
    onCreated,
    children,
}: NewReservationDialogProps) {
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [loading, setLoading] = useState(false);

    function update(field: keyof FormState, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!form.guest_name.trim()) {
            toast.error('El nombre del cliente es requerido');
            return;
        }
        if (!form.party_size || Number(form.party_size) < 1) {
            toast.error('Cantidad de personas invalida');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/reservations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    party_size: Number(form.party_size),
                    table_id: form.table_id || null,
                    event_id: form.event_id || null,
                    occasion: form.occasion || null,
                    guest_phone: form.guest_phone || null,
                    guest_email: form.guest_email || null,
                    special_requests: form.special_requests || null,
                    internal_notes: form.internal_notes || null,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error ?? 'Error al crear la reserva');
            }

            setForm(INITIAL_FORM);
            onCreated();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al crear la reserva');
        } finally {
            setLoading(false);
        }
    }

    const labelClass = 'block text-[12px] font-semibold text-[#6B7280] mb-1';
    const inputClass =
        'w-full px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-[10px] outline-none focus:border-[#818CF8] transition-colors bg-white';
    const selectClass = inputClass + ' cursor-pointer';

    return (
        <>
            {children}
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-[18px] font-bold text-[#1A1A2E]">
                            Nueva Reserva
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                        {/* Guest info */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>
                                    Nombre del cliente <span className="text-[#EF4444]">*</span>
                                </label>
                                <input
                                    required
                                    value={form.guest_name}
                                    onChange={(e) => update('guest_name', e.target.value)}
                                    placeholder="Nombre completo"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Telefono</label>
                                <input
                                    value={form.guest_phone}
                                    onChange={(e) => update('guest_phone', e.target.value)}
                                    placeholder="+57 300 000 0000"
                                    type="tel"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Email</label>
                                <input
                                    value={form.guest_email}
                                    onChange={(e) => update('guest_email', e.target.value)}
                                    placeholder="correo@ejemplo.com"
                                    type="email"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>
                                    Personas <span className="text-[#EF4444]">*</span>
                                </label>
                                <input
                                    required
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={form.party_size}
                                    onChange={(e) => update('party_size', e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        {/* Date and time */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>
                                    Fecha <span className="text-[#EF4444]">*</span>
                                </label>
                                <input
                                    required
                                    type="date"
                                    value={form.reservation_date}
                                    onChange={(e) => update('reservation_date', e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>
                                    Hora <span className="text-[#EF4444]">*</span>
                                </label>
                                <select
                                    required
                                    value={form.reservation_time}
                                    onChange={(e) => update('reservation_time', e.target.value)}
                                    className={selectClass}
                                >
                                    {TIME_SLOTS.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Table and event */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Mesa</label>
                                <select
                                    value={form.table_id}
                                    onChange={(e) => update('table_id', e.target.value)}
                                    className={selectClass}
                                >
                                    <option value="">Sin asignar</option>
                                    {tables.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} ({t.capacity} personas)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Evento (opcional)</label>
                                <select
                                    value={form.event_id}
                                    onChange={(e) => update('event_id', e.target.value)}
                                    className={selectClass}
                                >
                                    <option value="">Ninguno</option>
                                    {events.map((ev) => (
                                        <option key={ev.id} value={ev.id}>
                                            {ev.name} {ev.event_date ? `· ${ev.event_date}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Occasion and source */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Ocasion</label>
                                <select
                                    value={form.occasion}
                                    onChange={(e) => update('occasion', e.target.value)}
                                    className={selectClass}
                                >
                                    <option value="">Sin especificar</option>
                                    {Object.entries(RESERVATION_OCCASION_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Fuente</label>
                                <select
                                    value={form.source}
                                    onChange={(e) => update('source', e.target.value)}
                                    className={selectClass}
                                >
                                    <option value="manual">Manual</option>
                                    <option value="phone">Telefono</option>
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="web">Web</option>
                                </select>
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className={labelClass}>Solicitudes especiales</label>
                            <textarea
                                value={form.special_requests}
                                onChange={(e) => update('special_requests', e.target.value)}
                                placeholder="Alergias, preferencias, decoracion..."
                                rows={2}
                                className={inputClass + ' resize-none'}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Notas internas</label>
                            <textarea
                                value={form.internal_notes}
                                onChange={(e) => update('internal_notes', e.target.value)}
                                placeholder="Notas del equipo (no visibles para el cliente)"
                                rows={2}
                                className={inputClass + ' resize-none'}
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                className="rounded-[10px] border-[#E8E8EC] text-[#6B7280]"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading}
                                className="rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
                            >
                                {loading ? 'Creando...' : 'Crear Reserva'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
