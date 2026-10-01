'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Package, Plus, Pencil, Trash2, Tag, Search,
    X, Check, Loader2, GripVertical, ChevronDown,
    ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = {
    id: string;
    name: string;
    parent_id: string | null;
    position: number;
    created_at: string;
};

type Product = {
    id: string;
    name: string;
    description: string | null;
    sku: string | null;
    price: number;
    image_url: string | null;
    is_active: boolean;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    category_id: string | null;
    category: { id: string; name: string } | null;
};

type Tab = 'productos' | 'categorias';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputClass =
    'w-full px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-[10px] outline-none focus:border-[#818CF8] focus:ring-2 focus:ring-[#818CF8]/15 transition-colors bg-white';
const labelClass = 'block text-[12px] font-semibold text-[#6B7280] mb-1';

// ── Price formatter ───────────────────────────────────────────────────────────

function formatMXN(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
    }).format(amount);
}

// ── Toggle button ─────────────────────────────────────────────────────────────

function Toggle({
    value,
    onChange,
    disabled,
}: {
    value: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(!value)}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                value ? 'bg-[#818CF8]' : 'bg-[#E8E8EC]'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                    value ? 'left-6' : 'left-1'
                }`}
            />
        </button>
    );
}

// ── Product Form Modal ────────────────────────────────────────────────────────

type ProductFormState = {
    name: string;
    description: string;
    price: string;
    sku: string;
    category_id: string;
    image_url: string;
    is_active: boolean;
};

const EMPTY_PRODUCT_FORM: ProductFormState = {
    name: '',
    description: '',
    price: '',
    sku: '',
    category_id: '',
    image_url: '',
    is_active: true,
};

function ProductModal({
    product,
    categories,
    onClose,
    onSaved,
    onDeleted,
}: {
    product: Product | null; // null = create mode
    categories: Category[];
    onClose: () => void;
    onSaved: (p: Product) => void;
    onDeleted?: (id: string) => void;
}) {
    const [form, setForm] = useState<ProductFormState>(
        product
            ? {
                  name: product.name,
                  description: product.description ?? '',
                  price: String(product.price),
                  sku: product.sku ?? '',
                  category_id: product.category_id ?? '',
                  image_url: product.image_url ?? '',
                  is_active: product.is_active,
              }
            : EMPTY_PRODUCT_FORM
    );
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    // Close on overlay click
    function handleOverlayClick(e: React.MouseEvent) {
        if (e.target === overlayRef.current) onClose();
    }

    // Keyboard close
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    function set(field: keyof ProductFormState, value: string | boolean) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    async function handleSave() {
        if (!form.name.trim()) {
            toast.error('El nombre es requerido');
            return;
        }
        if (!form.price || isNaN(Number(form.price))) {
            toast.error('El precio es requerido');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                price: Number(form.price),
                sku: form.sku.trim() || null,
                category_id: form.category_id || null,
                image_url: form.image_url.trim() || null,
                is_active: form.is_active,
            };

            let res: Response;
            if (product) {
                res = await fetch(`/api/products/${product.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Error al guardar');

            toast.success(product ? 'Producto actualizado' : 'Producto creado');
            onSaved(data.product);
            onClose();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Error al guardar el producto');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!product || !onDeleted) return;
        if (!confirm('¿Desactivar este producto?')) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            toast.success('Producto desactivado');
            onDeleted(product.id);
            onClose();
        } catch {
            toast.error('Error al desactivar el producto');
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
        >
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#F3F4F6]">
                    <div className="flex items-center gap-2">
                        <Package size={18} className="text-[#818CF8]" />
                        <h2 className="text-[15px] font-semibold text-[#1A1A2E]">
                            {product ? 'Editar producto' : 'Nuevo producto'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                    {/* Name */}
                    <div>
                        <label className={labelClass}>
                            Nombre <span className="text-[#DC2626]">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => set('name', e.target.value)}
                            placeholder="Ej. Tacos al pastor"
                            className={inputClass}
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className={labelClass}>Descripción</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => set('description', e.target.value)}
                            placeholder="Descripción del producto…"
                            rows={3}
                            className={`${inputClass} resize-none`}
                        />
                    </div>

                    {/* Price + SKU */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>
                                Precio (MXN) <span className="text-[#DC2626]">*</span>
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.price}
                                onChange={(e) => set('price', e.target.value)}
                                placeholder="0.00"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>SKU</label>
                            <input
                                type="text"
                                value={form.sku}
                                onChange={(e) => set('sku', e.target.value)}
                                placeholder="Ej. TACO-001"
                                className={inputClass}
                            />
                        </div>
                    </div>

                    {/* Category */}
                    <div>
                        <label className={labelClass}>Categoría</label>
                        <div className="relative">
                            <select
                                value={form.category_id}
                                onChange={(e) => set('category_id', e.target.value)}
                                className={`${inputClass} appearance-none pr-8`}
                            >
                                <option value="">Sin categoría</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown
                                size={14}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none"
                            />
                        </div>
                    </div>

                    {/* Image URL */}
                    <div>
                        <label className={labelClass}>URL de imagen</label>
                        <input
                            type="url"
                            value={form.image_url}
                            onChange={(e) => set('image_url', e.target.value)}
                            placeholder="https://ejemplo.com/imagen.jpg"
                            className={inputClass}
                        />
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center justify-between py-1">
                        <div>
                            <p className="text-[13px] font-semibold text-[#1A1A2E]">Activo</p>
                            <p className="text-[12px] text-[#9CA3AF]">
                                El producto aparece disponible en el sistema
                            </p>
                        </div>
                        <Toggle value={form.is_active} onChange={(v) => set('is_active', v)} />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-[#F3F4F6] gap-3">
                    <div>
                        {product && onDeleted && (
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[13px] font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                            >
                                {deleting ? (
                                    <Loader2 size={13} className="animate-spin" />
                                ) : (
                                    <Trash2 size={13} />
                                )}
                                Desactivar
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-[#6B7280] border border-[#E8E8EC] hover:bg-[#F3F4F6] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-medium bg-[#818CF8] hover:bg-[#6366F1] text-white transition-colors disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader2 size={13} className="animate-spin" />
                            ) : (
                                <Check size={13} />
                            )}
                            {product ? 'Actualizar' : 'Crear producto'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({
    product,
    onEdit,
    onToggleActive,
}: {
    product: Product;
    onEdit: (p: Product) => void;
    onToggleActive: (p: Product) => void;
}) {
    const [toggling, setToggling] = useState(false);

    async function handleToggle() {
        setToggling(true);
        await onToggleActive(product);
        setToggling(false);
    }

    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] p-4 flex flex-col gap-3 hover:shadow-md hover:border-[#C7D2FE] transition-all group">
            {/* Image */}
            <div
                className="w-full h-36 rounded-xl bg-[#F3F4F6] flex items-center justify-center overflow-hidden cursor-pointer"
                onClick={() => onEdit(product)}
            >
                {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                            e.currentTarget.parentElement?.classList.add('show-fallback');
                        }}
                    />
                ) : (
                    <ImageIcon size={32} className="text-[#D1D5DB]" />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0" onClick={() => onEdit(product)}>
                <div className="flex items-start justify-between gap-2 cursor-pointer">
                    <p className="text-[14px] font-semibold text-[#1A1A2E] truncate">{product.name}</p>
                    <Pencil
                        size={13}
                        className="text-[#9CA3AF] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                    />
                </div>

                <p className="text-[16px] font-bold text-[#818CF8] mt-1">{formatMXN(product.price)}</p>

                <div className="flex items-center flex-wrap gap-1.5 mt-2">
                    {product.sku && (
                        <span className="text-[11px] bg-[#F3F4F6] text-[#6B7280] px-2 py-0.5 rounded-full font-mono">
                            {product.sku}
                        </span>
                    )}
                    {product.category && (
                        <span className="inline-flex items-center gap-1 text-[11px] bg-[#EEF0FF] text-[#4F46E5] px-2 py-0.5 rounded-full font-medium">
                            <Tag size={10} />
                            {product.category.name}
                        </span>
                    )}
                </div>
            </div>

            {/* Footer toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-[#F3F4F6]">
                <span
                    className={`text-[12px] font-medium ${
                        product.is_active ? 'text-[#059669]' : 'text-[#9CA3AF]'
                    }`}
                >
                    {product.is_active ? 'Activo' : 'Inactivo'}
                </span>
                <Toggle
                    value={product.is_active}
                    onChange={handleToggle}
                    disabled={toggling}
                />
            </div>
        </div>
    );
}

// ── Categories Tab ────────────────────────────────────────────────────────────

function CategoriasTab({
    initialCategories,
    products,
}: {
    initialCategories: Category[];
    products: Product[];
}) {
    const [categories, setCategories] = useState<Category[]>(initialCategories);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [adding, setAdding] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // Count products per category (from current products in parent state)
    function getProductCount(categoryId: string): number {
        return products.filter((p) => p.category_id === categoryId).length;
    }

    async function handleAdd() {
        const name = newName.trim();
        if (!name) return;
        setAdding(true);
        try {
            const res = await fetch('/api/products/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, position: categories.length }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Error al crear');
            setCategories((prev) => [...prev, data.category]);
            setNewName('');
            setShowAddForm(false);
            toast.success('Categoría creada');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Error al crear categoría');
        } finally {
            setAdding(false);
        }
    }

    async function handleEdit(id: string) {
        const name = editName.trim();
        if (!name) return;
        try {
            const res = await fetch(`/api/products/categories/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Error al actualizar');
            setCategories((prev) =>
                prev.map((c) => (c.id === id ? { ...c, name: data.category.name } : c))
            );
            setEditId(null);
            toast.success('Categoría actualizada');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Error al actualizar');
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Eliminar esta categoría? Los productos quedarán sin categoría.')) return;
        try {
            const res = await fetch(`/api/products/categories/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            setCategories((prev) => prev.filter((c) => c.id !== id));
            toast.success('Categoría eliminada');
        } catch {
            toast.error('Error al eliminar la categoría');
        }
    }

    return (
        <div className="space-y-5 max-w-2xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] text-[#6B7280]">
                    {categories.length} categoría{categories.length !== 1 ? 's' : ''}
                </p>
                <button
                    onClick={() => {
                        setShowAddForm(true);
                        setNewName('');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium bg-[#818CF8] hover:bg-[#6366F1] text-white transition-colors"
                >
                    <Plus size={14} />
                    Agregar categoría
                </button>
            </div>

            {/* Add form */}
            {showAddForm && (
                <div className="bg-white rounded-2xl border border-[#E8E8EC] p-4 flex items-center gap-2">
                    <Tag size={15} className="text-[#818CF8] flex-shrink-0" />
                    <input
                        autoFocus
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAdd();
                            if (e.key === 'Escape') setShowAddForm(false);
                        }}
                        placeholder="Nombre de la categoría"
                        className="flex-1 px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-[10px] outline-none focus:border-[#818CF8] focus:ring-2 focus:ring-[#818CF8]/15 bg-white"
                    />
                    <button
                        onClick={handleAdd}
                        disabled={adding || !newName.trim()}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-[10px] text-[13px] font-medium bg-[#818CF8] hover:bg-[#6366F1] text-white transition-colors disabled:opacity-50"
                    >
                        {adding ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Guardar
                    </button>
                    <button
                        onClick={() => setShowAddForm(false)}
                        className="p-2 rounded-[10px] hover:bg-[#F3F4F6] text-[#9CA3AF] transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* List */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] overflow-hidden">
                {categories.length === 0 ? (
                    <div className="p-16 flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-[#EEF0FF] flex items-center justify-center">
                            <Tag size={22} className="text-[#818CF8]" />
                        </div>
                        <p className="text-[14px] font-medium text-[#1A1A2E]">No hay categorías</p>
                        <p className="text-[13px] text-[#9CA3AF]">
                            Crea categorías para organizar tus productos
                        </p>
                    </div>
                ) : (
                    <ul>
                        {categories.map((cat) => {
                            const count = getProductCount(cat.id);
                            return (
                                <li
                                    key={cat.id}
                                    className="flex items-center gap-3 px-5 py-3.5 border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE] group"
                                >
                                    {/* Drag handle (visual only) */}
                                    <GripVertical
                                        size={15}
                                        className="text-[#D1D5DB] flex-shrink-0 cursor-grab"
                                    />

                                    {/* Icon */}
                                    <div className="w-7 h-7 rounded-lg bg-[#EEF0FF] flex items-center justify-center flex-shrink-0">
                                        <Tag size={13} className="text-[#818CF8]" />
                                    </div>

                                    {/* Name */}
                                    {editId === cat.id ? (
                                        <input
                                            autoFocus
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleEdit(cat.id);
                                                if (e.key === 'Escape') setEditId(null);
                                            }}
                                            className="flex-1 px-2.5 py-1.5 text-[14px] border border-[#818CF8] rounded-lg outline-none bg-white"
                                        />
                                    ) : (
                                        <span
                                            className="flex-1 text-[14px] font-medium text-[#1A1A2E] cursor-pointer hover:text-[#4F46E5] transition-colors"
                                            onClick={() => {
                                                setEditId(cat.id);
                                                setEditName(cat.name);
                                            }}
                                            title="Click para editar"
                                        >
                                            {cat.name}
                                        </span>
                                    )}

                                    {/* Product count badge */}
                                    <span className="text-[12px] text-[#9CA3AF] bg-[#F3F4F6] px-2 py-0.5 rounded-full flex-shrink-0">
                                        {count} producto{count !== 1 ? 's' : ''}
                                    </span>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {editId === cat.id ? (
                                            <>
                                                <button
                                                    onClick={() => handleEdit(cat.id)}
                                                    className="p-1.5 rounded-lg hover:bg-[#ECFDF5] text-[#059669] transition-colors"
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setEditId(null)}
                                                    className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] transition-colors"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        setEditId(cat.id);
                                                        setEditName(cat.name);
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(cat.id)}
                                                    className="p-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626] opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ProductsSettingsClient({
    initialProducts,
    initialCategories,
}: {
    initialProducts: Product[];
    initialCategories: Category[];
}) {
    const [tab, setTab] = useState<Tab>('productos');
    const [products, setProducts] = useState<Product[]>(initialProducts);

    const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
        { key: 'productos', label: 'Productos', icon: Package },
        { key: 'categorias', label: 'Categorías', icon: Tag },
    ];

    // Sync products across tabs when ProductosTab updates them
    // We lift products state here so CategoriasTab can count per-category
    function handleProductsUpdate(updated: Product[]) {
        setProducts(updated);
    }

    return (
        <>
            <PageHeader
                title="Gestión de Productos"
                description="Administra tu catálogo de productos y categorías"
            />

            {/* Tab bar */}
            <div className="flex gap-1 bg-[#F3F4F6] rounded-[12px] p-1 mb-6 w-fit">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] font-medium transition-all ${
                            tab === t.key
                                ? 'bg-white text-[#1A1A2E] shadow-sm'
                                : 'text-[#6B7280] hover:text-[#1A1A2E]'
                        }`}
                    >
                        <t.icon size={14} />
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'productos' && (
                <ProductosTabWrapper
                    initialProducts={products}
                    categories={initialCategories}
                    onProductsChange={handleProductsUpdate}
                />
            )}
            {tab === 'categorias' && (
                <CategoriasTab
                    initialCategories={initialCategories}
                    products={products}
                />
            )}
        </>
    );
}

// Thin wrapper to bridge products state lifting
function ProductosTabWrapper({
    initialProducts,
    categories,
    onProductsChange,
}: {
    initialProducts: Product[];
    categories: Category[];
    onProductsChange: (p: Product[]) => void;
}) {
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [modalProduct, setModalProduct] = useState<Product | null | undefined>(undefined);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchProducts = useCallback(async (q: string) => {
        setLoading(true);
        try {
            const url = new URL('/api/products', window.location.origin);
            if (q) url.searchParams.set('search', q);
            url.searchParams.set('page', '1');
            const res = await fetch(url.toString());
            const data = await res.json();
            const loaded: Product[] = data.products ?? [];
            setProducts(loaded);
            onProductsChange(loaded);
        } catch {
            toast.error('Error al cargar productos');
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleSearchChange(value: string) {
        setSearch(value);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => fetchProducts(value), 350);
    }

    function handleSaved(saved: Product) {
        setProducts((prev) => {
            const idx = prev.findIndex((p) => p.id === saved.id);
            let updated: Product[];
            if (idx >= 0) {
                updated = [...prev];
                updated[idx] = saved;
            } else {
                updated = [saved, ...prev];
            }
            onProductsChange(updated);
            return updated;
        });
    }

    function handleDeleted(id: string) {
        setProducts((prev) => {
            const updated = prev.map((p) => (p.id === id ? { ...p, is_active: false } : p));
            onProductsChange(updated);
            return updated;
        });
    }

    async function handleToggleActive(product: Product) {
        try {
            const res = await fetch(`/api/products/${product.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !product.is_active }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setProducts((prev) => {
                const updated = prev.map((p) => (p.id === product.id ? data.product : p));
                onProductsChange(updated);
                return updated;
            });
            toast.success(data.product.is_active ? 'Producto activado' : 'Producto desactivado');
        } catch {
            toast.error('Error al cambiar el estado');
        }
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[14px] text-[#6B7280]">
                    {products.length} producto{products.length !== 1 ? 's' : ''}
                </p>
                <button
                    onClick={() => setModalProduct(null)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium bg-[#818CF8] hover:bg-[#6366F1] text-white transition-colors"
                >
                    <Plus size={14} />
                    Agregar producto
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
                />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Buscar por nombre o SKU…"
                    className="w-full pl-9 pr-4 py-2.5 text-[13px] border border-[#E8E8EC] rounded-xl outline-none focus:border-[#818CF8] focus:ring-2 focus:ring-[#818CF8]/15 transition-colors bg-white"
                />
                {loading && (
                    <Loader2
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#818CF8] animate-spin"
                    />
                )}
            </div>

            {/* Grid */}
            {products.length === 0 ? (
                <div className="bg-white rounded-2xl border border-[#E8E8EC] p-16 flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#EEF0FF] flex items-center justify-center">
                        <Package size={22} className="text-[#818CF8]" />
                    </div>
                    <p className="text-[14px] font-medium text-[#1A1A2E]">
                        {search ? 'Sin resultados' : 'No hay productos aún'}
                    </p>
                    <p className="text-[13px] text-[#9CA3AF] text-center max-w-xs">
                        {search
                            ? 'Intenta con otro término de búsqueda'
                            : 'Agrega tu primer producto para comenzar'}
                    </p>
                    {!search && (
                        <button
                            onClick={() => setModalProduct(null)}
                            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium bg-[#818CF8] hover:bg-[#6366F1] text-white transition-colors"
                        >
                            <Plus size={14} />
                            Agregar producto
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.map((product) => (
                        <ProductCard
                            key={product.id}
                            product={product}
                            onEdit={(p) => setModalProduct(p)}
                            onToggleActive={handleToggleActive}
                        />
                    ))}
                </div>
            )}

            {/* Modal */}
            {modalProduct !== undefined && (
                <ProductModal
                    product={modalProduct}
                    categories={categories}
                    onClose={() => setModalProduct(undefined)}
                    onSaved={handleSaved}
                    onDeleted={handleDeleted}
                />
            )}
        </div>
    );
}
