'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '@/lib/types/database';

export type EditableItem = {
    _key: string;
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
};

type Props = {
    orderId: string;
    initialItems: Omit<EditableItem, '_key'>[];
    initialDiscount: number;
    formatMoney: (amount: number) => string;
    onCancel: () => void;
    onSaved: () => void;
};

/** Inline editor for an order's items and discount (PATCH /api/orders/[id]). */
export function OrderItemsEditor({ orderId, initialItems, initialDiscount, formatMoney, onCancel, onSaved }: Props) {
    const [items, setItems] = useState<EditableItem[]>(
        initialItems.map((it) => ({ ...it, _key: crypto.randomUUID() }))
    );
    const [discount, setDiscount] = useState(initialDiscount);
    const [saving, setSaving] = useState(false);

    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState<Product[]>([]);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounce.current) clearTimeout(debounce.current);
        if (!productSearch.trim()) return;
        debounce.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&active=true`);
                const data = await res.json();
                setProductResults((data.products ?? []).slice(0, 6));
            } catch {
                setProductResults([]);
            }
        }, 300);
    }, [productSearch]);

    function updateItem(key: string, patch: Partial<EditableItem>) {
        setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
    }

    function addProduct(product: Product) {
        setItems((prev) => [
            ...prev,
            { _key: crypto.randomUUID(), product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.price },
        ]);
        setProductSearch('');
        setProductResults([]);
    }

    function addCustomItem() {
        setItems((prev) => [
            ...prev,
            { _key: crypto.randomUUID(), product_id: null, product_name: '', quantity: 1, unit_price: 0 },
        ]);
    }

    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
    const total = Math.max(0, subtotal - (discount || 0));

    async function save() {
        const validItems = items.filter((it) => it.product_name.trim());
        if (validItems.length === 0) {
            toast.error('El pedido debe tener al menos un artículo.');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    discount: discount || 0,
                    items: validItems.map(({ product_id, product_name, quantity, unit_price }) => ({
                        product_id, product_name, quantity, unit_price,
                    })),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? 'Error al guardar el pedido');
                return;
            }
            toast.success('Pedido actualizado');
            onSaved();
        } finally {
            setSaving(false);
        }
    }

    const inputClass = 'h-9 px-2.5 rounded-lg border border-[#E8E8EC] text-[13px] text-[#1A1A2E] focus:outline-none focus:border-[#818CF8]';

    return (
        <div>
            <div className="divide-y divide-[#F3F4F6]">
                {items.map((item) => (
                    <div key={item._key} className="flex flex-wrap items-center gap-2 px-5 py-3">
                        <input
                            value={item.product_name}
                            onChange={(e) => updateItem(item._key, { product_name: e.target.value })}
                            placeholder="Producto"
                            className={`${inputClass} flex-1 min-w-[140px]`}
                        />
                        <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(item._key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                            className={`${inputClass} w-16`}
                            aria-label="Cantidad"
                        />
                        <input
                            type="number"
                            min={0}
                            value={item.unit_price}
                            onChange={(e) => updateItem(item._key, { unit_price: Math.max(0, Number(e.target.value) || 0) })}
                            className={`${inputClass} w-28`}
                            aria-label="Precio unitario"
                        />
                        <span className="w-24 text-right text-[13px] font-semibold text-[#1A1A2E]">
                            {formatMoney(item.quantity * item.unit_price)}
                        </span>
                        <button
                            onClick={() => setItems((prev) => prev.filter((it) => it._key !== item._key))}
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Quitar"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Add products */}
            <div className="px-5 py-3 border-t border-[#F3F4F6] relative">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder="Buscar producto para agregar…"
                            className={`${inputClass} w-full pl-8`}
                        />
                    </div>
                    <button
                        onClick={addCustomItem}
                        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-[#E8E8EC] text-[12px] font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
                    >
                        <Plus size={13} /> Artículo libre
                    </button>
                </div>
                {productSearch.trim() && productResults.length > 0 && (
                    <div className="absolute left-5 right-5 mt-1 z-20 bg-white border border-[#E8E8EC] rounded-xl shadow-lg overflow-hidden">
                        {productResults.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => addProduct(p)}
                                className="w-full flex items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-[#F9FAFB]"
                            >
                                <span className="text-[#1A1A2E]">{p.name}</span>
                                <span className="text-[#6B7280]">{formatMoney(p.price)}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Totals + actions */}
            <div className="bg-[#F9FAFB] px-5 py-4 space-y-2 border-t border-[#E8E8EC]">
                <div className="flex justify-between text-[13px]">
                    <span className="text-[#6B7280]">Subtotal</span>
                    <span className="font-medium text-[#374151]">{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                    <span className="text-[#6B7280]">Descuento</span>
                    <input
                        type="number"
                        min={0}
                        value={discount}
                        onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                        className={`${inputClass} w-28 text-right`}
                        aria-label="Descuento"
                    />
                </div>
                <div className="flex justify-between pt-2 border-t border-[#E8E8EC]">
                    <span className="text-[15px] font-semibold text-[#1A1A2E]">Total</span>
                    <span className="text-[18px] font-bold text-[#1A1A2E]">{formatMoney(total)}</span>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <button
                        onClick={onCancel}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#6B7280] hover:bg-[#F3F4F6]"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={save}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#818CF8] hover:bg-[#6366F1] text-white disabled:opacity-60 inline-flex items-center gap-1.5"
                    >
                        {saving && <Loader2 size={12} className="animate-spin" />}
                        Guardar cambios
                    </button>
                </div>
            </div>
        </div>
    );
}
