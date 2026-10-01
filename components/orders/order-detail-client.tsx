'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Package,
    User,
    Receipt,
    Loader2,
    ChevronDown,
    StickyNote,
    Clock,
    Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import type { OrderDetail } from '@/app/(dashboard)/orders/[id]/page';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMXN(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
    }).format(amount);
}

function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function shortId(id: string): string {
    return id.slice(-8).toUpperCase();
}

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

// ─── Status config ──────────────────────────────────────────────────────────

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled' | 'refunded';

const STATUS_LABELS: Record<OrderStatus, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    preparing: 'En preparación',
    ready: 'Listo',
    delivered: 'Entregado',
    completed: 'Completado',
    cancelled: 'Cancelado',
    refunded: 'Reembolsado',
};

const STATUS_STYLES: Record<OrderStatus, string> = {
    pending: 'bg-amber-50 text-amber-700',
    confirmed: 'bg-blue-50 text-blue-700',
    preparing: 'bg-orange-50 text-orange-700',
    ready: 'bg-green-50 text-green-700',
    delivered: 'bg-indigo-50 text-indigo-700',
    completed: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-red-50 text-red-600',
    refunded: 'bg-gray-100 text-gray-500',
};

const STATUS_DOT: Record<OrderStatus, string> = {
    pending: '#F59E0B',
    confirmed: '#3B82F6',
    preparing: '#F97316',
    ready: '#22C55E',
    delivered: '#6366F1',
    completed: '#10B981',
    cancelled: '#EF4444',
    refunded: '#9CA3AF',
};

const STATUS_FLOW: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'completed'];

function StatusBadge({ status }: { status: string }) {
    const s = status as OrderStatus;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium ${STATUS_STYLES[s] ?? 'bg-gray-100 text-gray-500'}`}>
            <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_DOT[s] ?? '#9CA3AF' }}
            />
            {STATUS_LABELS[s] ?? status}
        </span>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function OrderDetailClient({ order: initialOrder }: { order: OrderDetail }) {
    const router = useRouter();
    const [order, setOrder] = useState(initialOrder);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesValue, setNotesValue] = useState(order.notes ?? '');
    const [savingNotes, setSavingNotes] = useState(false);

    const status = order.status as OrderStatus;

    async function updateStatus(newStatus: OrderStatus) {
        setStatusUpdating(true);
        setShowStatusMenu(false);
        try {
            const res = await fetch(`/api/orders/${order.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setOrder((prev) => ({ ...prev, status: newStatus, updated_at: data.order.updated_at }));
            toast.success(`Estado actualizado a "${STATUS_LABELS[newStatus]}"`);
        } catch {
            toast.error('Error al actualizar el estado');
        } finally {
            setStatusUpdating(false);
        }
    }

    async function saveNotes() {
        setSavingNotes(true);
        try {
            const res = await fetch(`/api/orders/${order.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: notesValue.trim() || null }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setOrder((prev) => ({ ...prev, notes: notesValue.trim() || null, updated_at: data.order.updated_at }));
            setEditingNotes(false);
            toast.success('Notas guardadas');
        } catch {
            toast.error('Error al guardar las notas');
        } finally {
            setSavingNotes(false);
        }
    }

    // Next logical status in flow
    const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(status) + 1] as OrderStatus | undefined;

    return (
        <div className="max-w-4xl">
            {/* Back + header */}
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <Link
                        href="/orders"
                        className="inline-flex items-center gap-1.5 text-[13px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors mb-3"
                    >
                        <ArrowLeft size={14} />
                        Volver a Ventas
                    </Link>
                    <div className="flex items-center gap-3">
                        <h1 className="crm-page-title">
                            Pedido #{shortId(order.id)}
                        </h1>
                        <StatusBadge status={order.status} />
                    </div>
                    <p className="text-[13px] text-[#9CA3AF] mt-1 flex items-center gap-1.5">
                        <Clock size={12} />
                        Creado {formatDateTime(order.created_at)}
                        {order.source && (
                            <>
                                <span className="mx-1">&middot;</span>
                                Fuente: {order.source}
                            </>
                        )}
                    </p>
                </div>

                {/* Status actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    {nextStatus && (
                        <button
                            onClick={() => updateStatus(nextStatus)}
                            disabled={statusUpdating}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px] font-medium transition-colors disabled:opacity-60"
                        >
                            {statusUpdating ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : null}
                            {STATUS_LABELS[nextStatus]}
                        </button>
                    )}
                    <div className="relative">
                        <button
                            onClick={() => setShowStatusMenu(!showStatusMenu)}
                            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#E8E8EC] text-[13px] font-medium text-[#6B7280] hover:bg-[#F9FAFB] transition-colors"
                        >
                            Cambiar
                            <ChevronDown size={13} />
                        </button>
                        {showStatusMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-[#E8E8EC] shadow-lg z-20 py-1 min-w-[180px]">
                                    {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                                        <button
                                            key={s}
                                            disabled={s === status}
                                            onClick={() => updateStatus(s)}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-[#F9FAFB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <span
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: STATUS_DOT[s] }}
                                            />
                                            {STATUS_LABELS[s]}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left: Items + Totals */}
                <div className="lg:col-span-2 space-y-5">
                    {/* Items */}
                    <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#E8E8EC] flex items-center gap-2">
                            <Package size={16} className="text-[#818CF8]" />
                            <h2 className="text-[14px] font-semibold text-[#1A1A2E]">
                                Artículos ({order.items.length})
                            </h2>
                        </div>
                        <div className="divide-y divide-[#F3F4F6]">
                            {order.items.map((item, idx) => (
                                <div key={item.id} className="flex items-center gap-4 px-5 py-3.5">
                                    <span className="w-7 h-7 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[11px] font-semibold text-[#9CA3AF] flex-shrink-0">
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-[#1A1A2E] truncate">{item.product_name}</p>
                                        {item.notes && (
                                            <p className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">{item.notes}</p>
                                        )}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-[12px] text-[#9CA3AF]">
                                            {item.quantity} x {formatMXN(item.unit_price)}
                                        </p>
                                        <p className="text-[13px] font-semibold text-[#1A1A2E]">
                                            {formatMXN(item.subtotal)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Totals */}
                        <div className="bg-[#F9FAFB] px-5 py-4 space-y-2 border-t border-[#E8E8EC]">
                            <div className="flex justify-between text-[13px]">
                                <span className="text-[#6B7280]">Subtotal</span>
                                <span className="font-medium text-[#374151]">{formatMXN(order.subtotal)}</span>
                            </div>
                            {order.discount > 0 && (
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-[#6B7280]">Descuento</span>
                                    <span className="font-medium text-red-500">- {formatMXN(order.discount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between pt-2 border-t border-[#E8E8EC]">
                                <span className="text-[15px] font-semibold text-[#1A1A2E]">Total</span>
                                <span className="text-[18px] font-bold text-[#1A1A2E]">{formatMXN(order.total)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#E8E8EC] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <StickyNote size={16} className="text-[#818CF8]" />
                                <h2 className="text-[14px] font-semibold text-[#1A1A2E]">Notas</h2>
                            </div>
                            {!editingNotes && (
                                <button
                                    onClick={() => { setEditingNotes(true); setNotesValue(order.notes ?? ''); }}
                                    className="text-[12px] text-[#818CF8] hover:text-[#6366F1] font-medium transition-colors"
                                >
                                    Editar
                                </button>
                            )}
                        </div>
                        <div className="px-5 py-4">
                            {editingNotes ? (
                                <div className="space-y-3">
                                    <textarea
                                        value={notesValue}
                                        onChange={(e) => setNotesValue(e.target.value)}
                                        placeholder="Agrega notas internas sobre este pedido..."
                                        rows={3}
                                        className="w-full px-3 py-2.5 text-[13px] border border-[#E8E8EC] rounded-xl outline-none focus:border-[#818CF8] focus:ring-2 focus:ring-[#818CF8]/15 resize-none"
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => setEditingNotes(false)}
                                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={saveNotes}
                                            disabled={savingNotes}
                                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#818CF8] hover:bg-[#6366F1] text-white transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                                        >
                                            {savingNotes && <Loader2 size={12} className="animate-spin" />}
                                            Guardar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className={`text-[13px] ${order.notes ? 'text-[#374151]' : 'text-[#9CA3AF] italic'}`}>
                                    {order.notes ?? 'Sin notas'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right sidebar */}
                <div className="space-y-5">
                    {/* Customer */}
                    <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#E8E8EC] flex items-center gap-2">
                            <User size={16} className="text-[#818CF8]" />
                            <h2 className="text-[14px] font-semibold text-[#1A1A2E]">Cliente</h2>
                        </div>
                        <div className="px-5 py-4">
                            {order.contact ? (
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
                                        style={{ backgroundColor: avatarColor(order.contact.nombre) }}
                                    >
                                        {initials(order.contact.nombre)}
                                    </div>
                                    <div className="min-w-0">
                                        <Link
                                            href={`/contacts/${order.contact.id}`}
                                            className="text-[14px] font-semibold text-[#1A1A2E] hover:text-[#4F46E5] transition-colors truncate block"
                                        >
                                            {order.contact.nombre}
                                        </Link>
                                        {order.contact.email && (
                                            <p className="text-[12px] text-[#9CA3AF] truncate">{order.contact.email}</p>
                                        )}
                                        {order.contact.wa_id && (
                                            <p className="text-[12px] text-[#9CA3AF] truncate">{order.contact.wa_id}</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[13px] text-[#9CA3AF] italic">Sin cliente asignado</p>
                            )}
                        </div>
                    </div>

                    {/* Order info */}
                    <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#E8E8EC] flex items-center gap-2">
                            <Receipt size={16} className="text-[#818CF8]" />
                            <h2 className="text-[14px] font-semibold text-[#1A1A2E]">Detalles</h2>
                        </div>
                        <div className="px-5 py-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[12px] text-[#9CA3AF] flex items-center gap-1.5">
                                    <Hash size={12} />
                                    ID
                                </span>
                                <span className="text-[12px] font-mono text-[#6B7280]">{shortId(order.id)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[12px] text-[#9CA3AF] flex items-center gap-1.5">
                                    <Clock size={12} />
                                    Creado
                                </span>
                                <span className="text-[12px] text-[#6B7280]">{formatDateTime(order.created_at)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[12px] text-[#9CA3AF] flex items-center gap-1.5">
                                    <Clock size={12} />
                                    Actualizado
                                </span>
                                <span className="text-[12px] text-[#6B7280]">{formatDateTime(order.updated_at)}</span>
                            </div>
                            {order.source && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] text-[#9CA3AF]">Fuente</span>
                                    <span className="text-[12px] text-[#6B7280] capitalize">{order.source}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Status timeline */}
                    <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#E8E8EC]">
                            <h2 className="text-[14px] font-semibold text-[#1A1A2E]">Progreso</h2>
                        </div>
                        <div className="px-5 py-4">
                            <div className="space-y-0">
                                {STATUS_FLOW.map((s, idx) => {
                                    const currentIdx = STATUS_FLOW.indexOf(status);
                                    const isReached = idx <= currentIdx;
                                    const isCurrent = s === status;
                                    const isLast = idx === STATUS_FLOW.length - 1;
                                    return (
                                        <div key={s} className="flex items-start gap-3">
                                            <div className="flex flex-col items-center">
                                                <div
                                                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                                                        isCurrent
                                                            ? 'bg-[#818CF8] ring-4 ring-[#818CF8]/20'
                                                            : isReached
                                                            ? 'bg-[#818CF8]'
                                                            : 'bg-[#E8E8EC]'
                                                    }`}
                                                />
                                                {!isLast && (
                                                    <div
                                                        className={`w-0.5 h-6 ${
                                                            isReached && idx < currentIdx ? 'bg-[#818CF8]' : 'bg-[#E8E8EC]'
                                                        }`}
                                                    />
                                                )}
                                            </div>
                                            <span
                                                className={`text-[12px] font-medium -mt-0.5 ${
                                                    isCurrent
                                                        ? 'text-[#4F46E5]'
                                                        : isReached
                                                        ? 'text-[#374151]'
                                                        : 'text-[#9CA3AF]'
                                                }`}
                                            >
                                                {STATUS_LABELS[s]}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            {(status === 'cancelled' || status === 'refunded') && (
                                <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 text-[12px] font-medium text-red-600">
                                    {STATUS_LABELS[status]}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
