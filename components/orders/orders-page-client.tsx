'use client';

import { useState, useCallback, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Plus,
    Search,
    ShoppingCart,
    TrendingUp,
    Receipt,
    Clock,
    ChevronLeft,
    ChevronRight,
    X,
    Loader2,
    PackageSearch,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { OrderWithRelations, OrderStats } from '@/app/(dashboard)/orders/page';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMXN(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
    }).format(amount);
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
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

// ─── Status config ───────────────────────────────────────────────────────────

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

const ALL_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'completed', 'cancelled', 'refunded'];

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const s = status as OrderStatus;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${STATUS_STYLES[s] ?? 'bg-gray-100 text-gray-500'}`}>
            <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_DOT[s] ?? '#9CA3AF' }}
            />
            {STATUS_LABELS[s] ?? status}
        </span>
    );
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    icon: Icon,
    iconColor,
    iconBg,
}: {
    label: string;
    value: string | number;
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
}) {
    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5 flex items-center gap-4">
            <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: iconBg }}
            >
                <Icon size={22} style={{ color: iconColor }} />
            </div>
            <div>
                <p className="text-[22px] font-bold text-[#1A1A2E] leading-tight">{value}</p>
                <p className="text-[12px] text-[#9CA3AF] mt-0.5">{label}</p>
            </div>
        </div>
    );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Contact = { id: string; nombre: string; wa_id: string | null; email: string | null };
type Product = { id: string; name: string; price: number; sku: string | null };

type OrderItem = {
    _key: string;
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
};

// ─── CreateOrderModal ────────────────────────────────────────────────────────

function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [contactSearch, setContactSearch] = useState('');
    const [contactResults, setContactResults] = useState<Contact[]>([]);
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [contactLoading, setContactLoading] = useState(false);

    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState<Product[]>([]);
    const [productLoading, setProductLoading] = useState(false);
    const [showProductDropdown, setShowProductDropdown] = useState(false);

    const [items, setItems] = useState<OrderItem[]>([
        { _key: crypto.randomUUID(), product_id: null, product_name: '', quantity: 1, unit_price: 0 },
    ]);
    const [discount, setDiscount] = useState<number>(0);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const contactDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const productDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Contact search
    useEffect(() => {
        if (contactDebounce.current) clearTimeout(contactDebounce.current);
        if (!contactSearch.trim() || selectedContact) {
            setContactResults([]);
            return;
        }
        contactDebounce.current = setTimeout(async () => {
            setContactLoading(true);
            try {
                const res = await fetch(`/api/contacts?search=${encodeURIComponent(contactSearch)}&page=1`);
                const data = await res.json();
                setContactResults((data.contacts ?? []).slice(0, 6));
            } catch {
                // ignore
            } finally {
                setContactLoading(false);
            }
        }, 300);
    }, [contactSearch, selectedContact]);

    // Product search
    useEffect(() => {
        if (productDebounce.current) clearTimeout(productDebounce.current);
        if (!productSearch.trim()) {
            setProductResults([]);
            setShowProductDropdown(false);
            return;
        }
        productDebounce.current = setTimeout(async () => {
            setProductLoading(true);
            try {
                const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&active=true`);
                const data = await res.json();
                setProductResults((data.products ?? []).slice(0, 6));
                setShowProductDropdown(true);
            } catch {
                // ignore
            } finally {
                setProductLoading(false);
            }
        }, 300);
    }, [productSearch]);

    function addItem() {
        setItems((prev) => [
            ...prev,
            { _key: crypto.randomUUID(), product_id: null, product_name: '', quantity: 1, unit_price: 0 },
        ]);
    }

    function removeItem(key: string) {
        setItems((prev) => prev.filter((it) => it._key !== key));
    }

    function updateItem(key: string, field: keyof Omit<OrderItem, '_key'>, value: string | number | null) {
        setItems((prev) =>
            prev.map((it) => (it._key === key ? { ...it, [field]: value } : it))
        );
    }

    function selectProduct(product: Product) {
        setItems((prev) => [
            ...prev,
            {
                _key: crypto.randomUUID(),
                product_id: product.id,
                product_name: product.name,
                quantity: 1,
                unit_price: product.price,
            },
        ]);
        setProductSearch('');
        setProductResults([]);
        setShowProductDropdown(false);
    }

    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
    const total = Math.max(0, subtotal - (discount || 0));

    async function handleSave() {
        const validItems = items.filter((it) => it.product_name.trim());
        if (validItems.length === 0) {
            toast.error('Agrega al menos un artículo al pedido.');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contact_id: selectedContact?.id ?? null,
                    items: validItems.map(({ product_id, product_name, quantity, unit_price }) => ({
                        product_id,
                        product_name,
                        quantity,
                        unit_price,
                    })),
                    discount: discount || 0,
                    notes: notes.trim() || null,
                    source: 'manual',
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? 'Error al crear el pedido.');
                return;
            }
            toast.success('Pedido creado exitosamente.');
            onCreated();
        } catch {
            toast.error('Error de conexión. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[#E8E8EC]">
                    <div>
                        <h2 className="text-[18px] font-bold text-[#1A1A2E]">Nuevo Pedido</h2>
                        <p className="text-[13px] text-[#9CA3AF] mt-0.5">Registra un pedido manualmente</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA3AF] hover:bg-[#F3F4F6] transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-6 space-y-5">
                    {/* Contact selector */}
                    <div>
                        <label className="block text-[13px] font-medium text-[#374151] mb-1.5">
                            Cliente <span className="text-[#9CA3AF] font-normal">(opcional)</span>
                        </label>
                        {selectedContact ? (
                            <div className="flex items-center gap-3 p-3 rounded-xl border border-[#E8E8EC] bg-[#F9FAFB]">
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                                    style={{ backgroundColor: avatarColor(selectedContact.nombre) }}
                                >
                                    {initials(selectedContact.nombre)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-[#1A1A2E] truncate">{selectedContact.nombre}</p>
                                    {(selectedContact.email || selectedContact.wa_id) && (
                                        <p className="text-[11px] text-[#9CA3AF] truncate">
                                            {selectedContact.email ?? selectedContact.wa_id}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => { setSelectedContact(null); setContactSearch(''); }}
                                    className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                                <input
                                    type="text"
                                    placeholder="Buscar cliente por nombre..."
                                    value={contactSearch}
                                    onChange={(e) => setContactSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E8EC] text-[13px] text-[#1A1A2E] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 focus:border-[#818CF8]"
                                />
                                {contactLoading && (
                                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] animate-spin" />
                                )}
                                {contactResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-[#E8E8EC] shadow-lg z-10 py-1 max-h-[200px] overflow-y-auto">
                                        {contactResults.map((c) => (
                                            <button
                                                key={c.id}
                                                onClick={() => { setSelectedContact(c); setContactSearch(''); setContactResults([]); }}
                                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#F9FAFB] transition-colors"
                                            >
                                                <div
                                                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                                                    style={{ backgroundColor: avatarColor(c.nombre) }}
                                                >
                                                    {initials(c.nombre)}
                                                </div>
                                                <div className="text-left min-w-0">
                                                    <p className="text-[13px] font-medium text-[#1A1A2E] truncate">{c.nombre}</p>
                                                    {(c.email || c.wa_id) && (
                                                        <p className="text-[11px] text-[#9CA3AF] truncate">{c.email ?? c.wa_id}</p>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Product search to add items */}
                    <div>
                        <label className="block text-[13px] font-medium text-[#374151] mb-1.5">
                            Buscar producto del catálogo
                        </label>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o SKU..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                onFocus={() => productResults.length > 0 && setShowProductDropdown(true)}
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E8EC] text-[13px] text-[#1A1A2E] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 focus:border-[#818CF8]"
                            />
                            {productLoading && (
                                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] animate-spin" />
                            )}
                            {showProductDropdown && productResults.length > 0 && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowProductDropdown(false)} />
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-[#E8E8EC] shadow-lg z-20 py-1 max-h-[200px] overflow-y-auto">
                                        {productResults.map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => selectProduct(p)}
                                                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#F9FAFB] transition-colors"
                                            >
                                                <div className="text-left min-w-0">
                                                    <p className="text-[13px] font-medium text-[#1A1A2E] truncate">{p.name}</p>
                                                    {p.sku && <p className="text-[11px] text-[#9CA3AF]">SKU: {p.sku}</p>}
                                                </div>
                                                <span className="text-[13px] font-semibold text-[#1A1A2E] ml-3 flex-shrink-0">
                                                    {formatMXN(p.price)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Items table */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[13px] font-medium text-[#374151]">
                                Artículos del pedido
                            </label>
                            <button
                                onClick={addItem}
                                className="text-[12px] text-[#818CF8] hover:text-[#6366F1] font-medium flex items-center gap-1 transition-colors"
                            >
                                <Plus size={13} />
                                Agregar fila
                            </button>
                        </div>
                        <div className="rounded-xl border border-[#E8E8EC] overflow-hidden">
                            {/* Column headers */}
                            <div className="grid grid-cols-[1fr_70px_100px_80px_36px] gap-2 px-3 py-2 bg-[#F9FAFB] border-b border-[#E8E8EC]">
                                <span className="text-[11px] font-medium text-[#9CA3AF] uppercase tracking-wide">Producto</span>
                                <span className="text-[11px] font-medium text-[#9CA3AF] uppercase tracking-wide text-center">Cant.</span>
                                <span className="text-[11px] font-medium text-[#9CA3AF] uppercase tracking-wide text-right">Precio unit.</span>
                                <span className="text-[11px] font-medium text-[#9CA3AF] uppercase tracking-wide text-right">Subtotal</span>
                                <span />
                            </div>
                            <div className="divide-y divide-[#F3F4F6]">
                                {items.map((item) => (
                                    <div key={item._key} className="grid grid-cols-[1fr_70px_100px_80px_36px] gap-2 px-3 py-2 items-center">
                                        <input
                                            type="text"
                                            placeholder="Nombre del artículo"
                                            value={item.product_name}
                                            onChange={(e) => updateItem(item._key, 'product_name', e.target.value)}
                                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#E8E8EC] text-[13px] text-[#1A1A2E] placeholder-[#9CA3AF] focus:outline-none focus:ring-1 focus:ring-[#818CF8]/40 focus:border-[#818CF8]"
                                        />
                                        <input
                                            type="number"
                                            min={1}
                                            value={item.quantity}
                                            onChange={(e) => updateItem(item._key, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                            className="w-full px-2 py-1.5 rounded-lg border border-[#E8E8EC] text-[13px] text-[#1A1A2E] text-center focus:outline-none focus:ring-1 focus:ring-[#818CF8]/40 focus:border-[#818CF8]"
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={item.unit_price}
                                            onChange={(e) => updateItem(item._key, 'unit_price', parseFloat(e.target.value) || 0)}
                                            className="w-full px-2 py-1.5 rounded-lg border border-[#E8E8EC] text-[13px] text-[#1A1A2E] text-right focus:outline-none focus:ring-1 focus:ring-[#818CF8]/40 focus:border-[#818CF8]"
                                        />
                                        <p className="text-[13px] font-medium text-[#374151] text-right pr-1">
                                            {formatMXN(item.quantity * item.unit_price)}
                                        </p>
                                        <button
                                            onClick={() => removeItem(item._key)}
                                            disabled={items.length === 1}
                                            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Discount + Notes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-medium text-[#374151] mb-1.5">
                                Descuento (MXN)
                            </label>
                            <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={discount}
                                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                className="w-full px-3 py-2.5 rounded-xl border border-[#E8E8EC] text-[13px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 focus:border-[#818CF8]"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-[#374151] mb-1.5">
                                Notas internas
                            </label>
                            <input
                                type="text"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Instrucciones especiales..."
                                className="w-full px-3 py-2.5 rounded-xl border border-[#E8E8EC] text-[13px] text-[#1A1A2E] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 focus:border-[#818CF8]"
                            />
                        </div>
                    </div>

                    {/* Totals summary */}
                    <div className="rounded-xl border border-[#E8E8EC] bg-[#F9FAFB] p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[13px] text-[#6B7280]">Subtotal</span>
                            <span className="text-[13px] font-medium text-[#374151]">{formatMXN(subtotal)}</span>
                        </div>
                        {discount > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] text-[#6B7280]">Descuento</span>
                                <span className="text-[13px] font-medium text-red-500">- {formatMXN(discount)}</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-[#E8E8EC]">
                            <span className="text-[14px] font-semibold text-[#1A1A2E]">Total</span>
                            <span className="text-[16px] font-bold text-[#1A1A2E]">{formatMXN(total)}</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-[#E8E8EC]">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl border border-[#E8E8EC] text-[13px] font-medium text-[#6B7280] hover:bg-[#F9FAFB] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2.5 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px] font-medium transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            <>
                                <Receipt size={14} />
                                Crear Pedido
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OrdersPageClientProps {
    initialOrders: OrderWithRelations[];
    initialTotal: number;
    initialTotalPages: number;
    stats: OrderStats;
    /** Open the "new order" modal on load (/orders?new=1). */
    openCreate?: boolean;
}

export function OrdersPageClient({
    initialOrders,
    initialTotal,
    initialTotalPages,
    stats,
    openCreate = false,
}: OrdersPageClientProps) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [orders, setOrders] = useState<OrderWithRelations[]>(initialOrders);
    const [total, setTotal] = useState(initialTotal);
    const [totalPages, setTotalPages] = useState(initialTotalPages);
    const [page, setPage] = useState(1);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const [showCreateModal, setShowCreateModal] = useState(openCreate);

    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Fetch orders from the API
    const fetchOrders = useCallback(async (params: { search?: string; status?: string; page?: number }) => {
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            if (params.search) qs.set('search', params.search);
            if (params.status) qs.set('status', params.status);
            if (params.page) qs.set('page', String(params.page));

            const res = await fetch(`/api/orders?${qs.toString()}`);
            const data = await res.json();
            if (res.ok) {
                setOrders(data.orders ?? []);
                setTotal(data.total ?? 0);
                setTotalPages(data.totalPages ?? 1);
            }
        } catch {
            toast.error('Error al cargar los pedidos.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounced search
    useEffect(() => {
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        searchDebounce.current = setTimeout(() => {
            setPage(1);
            fetchOrders({ search, status: statusFilter, page: 1 });
        }, 400);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    function handleStatusChange(status: string) {
        setStatusFilter(status);
        setPage(1);
        fetchOrders({ search, status, page: 1 });
    }

    function handlePageChange(newPage: number) {
        setPage(newPage);
        fetchOrders({ search, status: statusFilter, page: newPage });
    }

    function handleOrderCreated() {
        setShowCreateModal(false);
        setPage(1);
        fetchOrders({ search, status: statusFilter, page: 1 });
        startTransition(() => router.refresh());
    }

    const statusTabs: { label: string; value: string }[] = [
        { label: 'Todos', value: '' },
        { label: 'Pendiente', value: 'pending' },
        { label: 'Confirmado', value: 'confirmed' },
        { label: 'En preparación', value: 'preparing' },
        { label: 'Listo', value: 'ready' },
        { label: 'Entregado', value: 'delivered' },
        { label: 'Completado', value: 'completed' },
        { label: 'Cancelado', value: 'cancelled' },
    ];

    return (
        <>
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="crm-page-title">Ventas</h1>
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-[#EEF0FF] text-[#4F46E5] text-[12px] font-semibold">
                            {total}
                        </span>
                    </div>
                    <p className="crm-page-description mt-1">Gestiona los pedidos y ventas del restaurante</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px] font-medium transition-colors shadow-sm flex-shrink-0"
                >
                    <Plus size={15} />
                    Nuevo Pedido
                </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard
                    label="Total Pedidos"
                    value={stats.total_orders}
                    icon={ShoppingCart}
                    iconColor="#818CF8"
                    iconBg="#EEF0FF"
                />
                <StatCard
                    label="Ingresos Total"
                    value={formatMXN(stats.total_revenue)}
                    icon={TrendingUp}
                    iconColor="#10B981"
                    iconBg="#ECFDF5"
                />
                <StatCard
                    label="Ticket Promedio"
                    value={formatMXN(stats.average_ticket)}
                    icon={Receipt}
                    iconColor="#F59E0B"
                    iconBg="#FFFBEB"
                />
                <StatCard
                    label="Pedidos Hoy"
                    value={stats.orders_today}
                    icon={Clock}
                    iconColor="#3B82F6"
                    iconBg="#EFF6FF"
                />
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5 mb-4">
                {/* Search */}
                <div className="relative mb-4">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre de cliente..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E8EC] text-[13px] text-[#1A1A2E] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 focus:border-[#818CF8] sm:max-w-xs"
                    />
                </div>

                {/* Status tabs */}
                <div className="flex flex-wrap gap-2">
                    {statusTabs.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => handleStatusChange(tab.value)}
                            className={`px-3.5 py-1.5 rounded-xl text-[12px] font-medium transition-colors ${
                                statusFilter === tab.value
                                    ? 'bg-[#818CF8] text-white shadow-sm'
                                    : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E9EAEC]'
                            }`}
                        >
                            {tab.label}
                            {tab.value && stats.orders_by_status[tab.value] > 0 && (
                                <span className={`ml-1.5 text-[11px] ${statusFilter === tab.value ? 'text-indigo-200' : 'text-[#9CA3AF]'}`}>
                                    {stats.orders_by_status[tab.value]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-[#9CA3AF]">
                        <Loader2 size={24} className="animate-spin mr-3" />
                        <span className="text-[14px]">Cargando pedidos...</span>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-[#EEF0FF] flex items-center justify-center mb-4">
                            <PackageSearch size={28} className="text-[#818CF8]" />
                        </div>
                        <p className="text-[15px] font-semibold text-[#1A1A2E]">Sin pedidos</p>
                        <p className="text-[13px] text-[#9CA3AF] mt-1 max-w-xs">
                            {search || statusFilter
                                ? 'No se encontraron pedidos con los filtros actuales.'
                                : 'Aún no hay pedidos registrados. Crea el primero.'}
                        </p>
                        {!search && !statusFilter && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px] font-medium transition-colors"
                            >
                                <Plus size={14} />
                                Nuevo Pedido
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-[#E8E8EC] bg-[#F9FAFB]">
                                        <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide w-28">#</th>
                                        <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Cliente</th>
                                        <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide w-24">Items</th>
                                        <th className="text-right px-5 py-3 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide w-32">Total</th>
                                        <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide w-36">Estado</th>
                                        <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide w-32">Fecha</th>
                                        <th className="px-5 py-3 w-16" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F3F4F6]">
                                    {orders.map((order) => (
                                        <tr
                                            key={order.id}
                                            onClick={() => router.push(`/orders/${order.id}`)}
                                            className="hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                                        >
                                            <td className="px-5 py-4">
                                                <span className="text-[12px] font-mono font-medium text-[#9CA3AF]">
                                                    #{shortId(order.id)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                {order.contact ? (
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                                                            style={{ backgroundColor: avatarColor(order.contact.nombre) }}
                                                        >
                                                            {initials(order.contact.nombre)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-medium text-[#1A1A2E] truncate">
                                                                {order.contact.nombre}
                                                            </p>
                                                            {(order.contact.email || order.contact.wa_id) && (
                                                                <p className="text-[11px] text-[#9CA3AF] truncate">
                                                                    {order.contact.email ?? order.contact.wa_id}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-[13px] text-[#9CA3AF] italic">Sin cliente</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#F3F4F6] text-[12px] font-semibold text-[#6B7280]">
                                                    {order.item_count}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <span className="text-[14px] font-bold text-[#1A1A2E]">
                                                    {formatMXN(order.total)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <StatusBadge status={order.status} />
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="text-[12px] text-[#6B7280]">
                                                    {formatDate(order.created_at)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <span className="text-[#C4C4CC] group-hover:text-[#9CA3AF]">
                                                    <ChevronRight size={16} />
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden divide-y divide-[#F3F4F6]">
                            {orders.map((order) => (
                                <div
                                    key={order.id}
                                    onClick={() => router.push(`/orders/${order.id}`)}
                                    className="p-4 hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2.5">
                                            {order.contact ? (
                                                <div
                                                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                                                    style={{ backgroundColor: avatarColor(order.contact.nombre) }}
                                                >
                                                    {initials(order.contact.nombre)}
                                                </div>
                                            ) : (
                                                <div className="w-9 h-9 rounded-full bg-[#F3F4F6] flex items-center justify-center">
                                                    <ShoppingCart size={15} className="text-[#9CA3AF]" />
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-[13px] font-semibold text-[#1A1A2E]">
                                                    {order.contact?.nombre ?? 'Sin cliente'}
                                                </p>
                                                <p className="text-[11px] text-[#9CA3AF] font-mono">
                                                    #{shortId(order.id)}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-[15px] font-bold text-[#1A1A2E]">
                                            {formatMXN(order.total)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <StatusBadge status={order.status} />
                                        <span className="text-[11px] text-[#9CA3AF]">{formatDate(order.created_at)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-[#E8E8EC] bg-[#F9FAFB]">
                        <p className="text-[12px] text-[#9CA3AF]">
                            Página {page} de {totalPages} &middot; {total} pedidos
                        </p>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => handlePageChange(page - 1)}
                                disabled={page <= 1}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E8E8EC] bg-white text-[#6B7280] hover:bg-[#F3F4F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => handlePageChange(pageNum)}
                                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-[12px] font-medium transition-colors ${
                                            pageNum === page
                                                ? 'bg-[#818CF8] text-white border border-[#818CF8]'
                                                : 'border border-[#E8E8EC] bg-white text-[#6B7280] hover:bg-[#F3F4F6]'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => handlePageChange(page + 1)}
                                disabled={page >= totalPages}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E8E8EC] bg-white text-[#6B7280] hover:bg-[#F3F4F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Order Modal */}
            {showCreateModal && (
                <CreateOrderModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleOrderCreated}
                />
            )}
        </>
    );
}
