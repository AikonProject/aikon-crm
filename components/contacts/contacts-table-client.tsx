'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ChevronLeft, ChevronRight, Users, Filter, X, UserCheck, Pencil, Trash2, Tag as Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { EditContactDialog } from '@/components/contacts/edit-contact-dialog';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ContactFilterBuilder } from '@/components/contacts/contact-filter-builder';
import { EMPTY_FILTER, cleanFilter, type ContactFilter } from '@/lib/contact-filter';
import { FunnelStageBadge } from '@/components/contacts/funnel-stage-badge';
import { getInitials, formatSmartDate } from '@/lib/utils/format';
import type { ContactWithRelations } from '@/app/(dashboard)/contacts/page';
import type { FunnelStage } from '@/lib/types/database';

const ITEMS_PER_PAGE = 12;

type SortOption = 'created_desc' | 'last_contacted_desc' | 'score_desc' | 'nombre_asc';


const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'created_desc', label: 'Más reciente' },
    { value: 'last_contacted_desc', label: 'Actividad reciente' },
    { value: 'score_desc', label: 'Score (mayor)' },
    { value: 'nombre_asc', label: 'Nombre A-Z' },
];

interface ContactsTableClientProps {
    contacts: ContactWithRelations[];
    stages: FunnelStage[];
    total: number;
    initialStageId?: string | null;
}

export function ContactsTableClient({ contacts, stages, initialStageId = null }: ContactsTableClientProps) {
    const [search, setSearch] = useState('');
    const [selectedStageId, setSelectedStageId] = useState<string | 'all'>(
        initialStageId && stages.some((s) => s.id === initialStageId) ? initialStageId : 'all'
    );
    const [page, setPage] = useState(1);

    // Advanced filter (evaluated on the server, same builder as campaigns)
    const [showFilters, setShowFilters] = useState(false);
    const [advFilter, setAdvFilter] = useState<ContactFilter>(EMPTY_FILTER);
    const [sortBy, setSortBy] = useState<SortOption>('created_desc');
    const cleanedKey = useMemo(() => JSON.stringify(cleanFilter(advFilter)), [advFilter]);
    const filterActive = cleanFilter(advFilter).conditions.length > 0;
    const [filterResult, setFilterResult] = useState<{ key: string; ids: Set<string>; count: number } | null>(null);
    const [filterTick, setFilterTick] = useState(0); // re-run the filter after a bulk action
    useEffect(() => {
        if (!filterActive) return;
        let cancelled = false;
        const t = setTimeout(() => {
            fetch('/api/contacts/filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: JSON.parse(cleanedKey), ids_only: true }),
            })
                .then((r) => r.json())
                .then((d) => {
                    if (!cancelled && Array.isArray(d.ids)) setFilterResult({ key: cleanedKey, ids: new Set(d.ids), count: d.count ?? d.ids.length });
                })
                .catch(() => {});
        }, 350);
        return () => { cancelled = true; clearTimeout(t); };
    }, [cleanedKey, filterActive, filterTick]);
    const filterIds = filterActive && filterResult?.key === cleanedKey ? filterResult.ids : null;
    const filterLoading = filterActive && filterResult?.key !== cleanedKey;

    // Selection and actions
    const router = useRouter();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [editing, setEditing] = useState<ContactWithRelations | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
    const [fieldDialog, setFieldDialog] = useState(false);
    const [busy, setBusy] = useState(false);
    const [allTags, setAllTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
    const [team, setTeam] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
    const [fields, setFields] = useState<{ field_key: string; label: string; field_type: string; options: unknown }[]>([]);
    useEffect(() => {
        fetch('/api/settings/tags').then((r) => r.json()).then((d) => setAllTags(d.tags ?? [])).catch(() => {});
        fetch('/api/settings/team').then((r) => r.json()).then((d) => setTeam(d.users ?? [])).catch(() => {});
        fetch('/api/settings/custom-fields').then((r) => r.json()).then((d) => setFields(d.fields ?? [])).catch(() => {});
    }, []);

    function toggleSelected(id: string) {
        setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    }

    type BulkAction = 'delete' | 'add_tag' | 'remove_tag' | 'set_stage' | 'assign' | 'set_ai' | 'set_field';
    async function bulk(action: BulkAction, ids: string[], extra: Record<string, unknown> = {}) {
        setBusy(true);
        try {
            const res = await fetch('/api/contacts/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ids, ...extra }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || 'No se pudo completar la operación'); return false; }
            const n = d.deleted ?? d.updated ?? 0;
            const s = n === 1 ? '' : 's';
            const msg: Record<BulkAction, string> = {
                delete: `${n} contacto${s} eliminado${s}`,
                add_tag: `Etiqueta agregada a ${n} contacto${s}`,
                remove_tag: `Etiqueta quitada de ${n} contacto${s}`,
                set_stage: `${n} contacto${s} movido${s} de etapa`,
                assign: `${n} contacto${s} asignado${s}`,
                set_ai: `IA ${extra.ai_active ? 'activada' : 'desactivada'} en ${n} contacto${s}`,
                set_field: `Campo actualizado en ${n} contacto${s}`,
            };
            toast.success(msg[action]);
            setSelected(new Set());
            router.refresh();
            // The filter may match different contacts now (keeps showing the old result until it arrives)
            setFilterTick((t) => t + 1);
            return true;
        } catch {
            toast.error('Error de conexión');
            return false;
        } finally {
            setBusy(false);
        }
    }

    const filtered = useMemo(() => {
        let result = contacts;

        if (filterIds) result = result.filter((c) => filterIds.has(c.id));
        else if (filterActive) result = [];

        if (selectedStageId !== 'all') {
            result = result.filter((c) => c.funnel_stage_id === selectedStageId);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(
                (c) =>
                    c.nombre.toLowerCase().includes(q) ||
                    (c.email?.toLowerCase().includes(q) ?? false) ||
                    (c.wa_id?.toLowerCase().includes(q) ?? false)
            );
        }

        result = [...result].sort((a, b) => {
            switch (sortBy) {
                case 'last_contacted_desc': {
                    const aTime = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0;
                    const bTime = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0;
                    return bTime - aTime;
                }
                case 'score_desc':
                    return b.lead_score - a.lead_score;
                case 'nombre_asc':
                    return a.nombre.localeCompare(b.nombre);
                case 'created_desc':
                default:
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
        });

        return result;
    }, [contacts, search, selectedStageId, sortBy, filterIds, filterActive]);

    // Everybody the current view refers to: all filter matches (even beyond the loaded 1000) or the visible list
    const allMatchingIds = useMemo(() => {
        if (filterIds && selectedStageId === 'all' && !search.trim()) return [...filterIds];
        return filtered.map((c) => c.id);
    }, [filterIds, filtered, selectedStageId, search]);
    const activeFilterCount = cleanFilter(advFilter).conditions.length;

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const safeCurrentPage = Math.min(page, totalPages);
    const paginated = filtered.slice(
        (safeCurrentPage - 1) * ITEMS_PER_PAGE,
        safeCurrentPage * ITEMS_PER_PAGE
    );

    const pageAllSelected = paginated.length > 0 && paginated.every((c) => selected.has(c.id));
    function togglePage() {
        setSelected((prev) => {
            const n = new Set(prev);
            if (pageAllSelected) paginated.forEach((c) => n.delete(c.id));
            else paginated.forEach((c) => n.add(c.id));
            return n;
        });
    }

    function setPageSafe(p: number) {
        setPage(Math.max(1, Math.min(p, totalPages)));
    }



    return (
        <>
            {/* Search + Filters */}
            <div className="mb-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className="relative flex-1">
                        <Search
                            size={18}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
                        />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, email o teléfono..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            className="w-full pl-10 pr-4 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all"
                        />
                    </div>

                    {/* Filtros button */}
                    <button
                        onClick={() => setShowFilters((v) => !v)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[14px] font-medium border transition-all whitespace-nowrap ${
                            showFilters || activeFilterCount > 0
                                ? 'bg-[#818CF8] text-white border-[#818CF8]'
                                : 'bg-white border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]'
                        }`}
                    >
                        <Filter size={15} />
                        Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>
                </div>

                {/* Advanced filter panel */}
                {showFilters && (
                    <div className="bg-white rounded-xl border border-[#E8E8EC] p-4 mb-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold text-[#1A1A2E]">Filtros avanzados</span>
                            <div className="flex items-center gap-3">
                                <label className="text-[12px] text-[#6B7280] flex items-center gap-1.5">
                                    Ordenar por
                                    <select
                                        value={sortBy}
                                        onChange={(e) => { setSortBy(e.target.value as SortOption); setPage(1); }}
                                        className="px-2 py-1 text-[12px] bg-white border border-[#E8E8EC] rounded-lg"
                                    >
                                        {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </label>
                                {activeFilterCount > 0 && (
                                    <button
                                        onClick={() => { setAdvFilter(EMPTY_FILTER); setPage(1); }}
                                        className="flex items-center gap-1 text-[12px] text-[#818CF8] hover:text-[#6366F1]"
                                    >
                                        <X size={12} /> Limpiar filtros
                                    </button>
                                )}
                            </div>
                        </div>
                        <ContactFilterBuilder value={advFilter} onChange={(f) => { setAdvFilter(f); setPage(1); setSelected(new Set()); }} phoneLabel="con WhatsApp" />
                        {filterActive && filterIds && filterIds.size > filtered.length && selectedStageId === 'all' && !search.trim() && (
                            <p className="text-[12px] text-[#6B7280]">
                                {filterIds.size} contactos cumplen el filtro; la tabla muestra los {filtered.length} más recientes.
                                Las acciones en lote con &quot;Seleccionar los {filterIds.size}&quot; se aplican a todos.
                            </p>
                        )}
                    </div>
                )}

                {/* Stage filter chips */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <button
                        onClick={() => {
                            setSelectedStageId('all');
                            setPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all ${
                            selectedStageId === 'all'
                                ? 'bg-[#1A1A2E] text-white'
                                : 'bg-white border border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]'
                        }`}
                    >
                        Todos ({contacts.length})
                    </button>

                    {stages.map((stage) => {
                        const count = contacts.filter(
                            (c) => c.funnel_stage_id === stage.id
                        ).length;
                        return (
                            <button
                                key={stage.id}
                                onClick={() => {
                                    setSelectedStageId(stage.id);
                                    setPage(1);
                                }}
                                className={`px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all ${
                                    selectedStageId === stage.id
                                        ? 'bg-[#1A1A2E] text-white'
                                        : 'bg-white border border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]'
                                }`}
                            >
                                {stage.name} ({count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bulk actions */}
            {selected.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#C7D2FE] bg-[#EEF0FF] px-4 py-2.5">
                    <span className="text-[13px] font-medium text-[#4F46E5]">
                        {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                    </span>
                    {selected.size < allMatchingIds.length && (
                        <button onClick={() => setSelected(new Set(allMatchingIds))} className="text-[12px] text-[#4F46E5] underline">
                            Seleccionar los {allMatchingIds.length}{filterActive ? ' que cumplen el filtro' : ' de la lista'}
                        </button>
                    )}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <BulkSelect label="+ Etiqueta" disabled={busy} options={allTags.map((t) => ({ value: t.id, label: t.name }))}
                            onPick={(v) => bulk('add_tag', [...selected], { tag_id: v })} />
                        <BulkSelect label="− Etiqueta" disabled={busy} options={allTags.map((t) => ({ value: t.id, label: t.name }))}
                            onPick={(v) => bulk('remove_tag', [...selected], { tag_id: v })} />
                        <BulkSelect label="Etapa" disabled={busy}
                            options={[...stages.map((st) => ({ value: st.id, label: st.name })), { value: '__none', label: 'Sin etapa' }]}
                            onPick={(v) => bulk('set_stage', [...selected], { stage_id: v === '__none' ? null : v })} />
                        <BulkSelect label="Asignar" disabled={busy}
                            options={[...team.map((u) => ({ value: u.id, label: u.full_name || u.email || 'Usuario' })), { value: '__none', label: 'Sin asignar' }]}
                            onPick={(v) => bulk('assign', [...selected], { user_id: v === '__none' ? null : v })} />
                        <BulkSelect label="IA" disabled={busy}
                            options={[{ value: 'on', label: 'Activar IA' }, { value: 'off', label: 'Desactivar IA' }]}
                            onPick={(v) => bulk('set_ai', [...selected], { ai_active: v === 'on' })} />
                        <button
                            onClick={() => setFieldDialog(true)}
                            disabled={busy || fields.length === 0}
                            title={fields.length === 0 ? 'Crea campos personalizados en Configuración' : undefined}
                            className="text-[12px] px-2.5 py-1.5 rounded-lg border border-[#E8E8EC] bg-white text-[#374151] hover:bg-[#F9FAFB] disabled:opacity-50"
                        >
                            Campo personalizado
                        </button>
                        <button
                            onClick={() => setConfirmDelete([...selected])}
                            disabled={busy}
                            className="flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50"
                        >
                            <Trash2 size={13} /> Eliminar
                        </button>
                        <button onClick={() => setSelected(new Set())} className="text-[12px] text-[#6B7280] hover:text-[#1A1A2E] px-2">
                            Cancelar
                        </button>
                        {busy && <Loader2 size={14} className="animate-spin text-[#4F46E5]" />}
                    </div>
                </div>
            )}

            {/* Table Card */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                {paginated.length === 0 ? (
                    filterLoading ? (
                        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[#9CA3AF]">
                            <Loader2 size={15} className="animate-spin" /> Filtrando contactos…
                        </div>
                    ) : (
                        <EmptyState hasSearch={!!search || activeFilterCount > 0} />
                    )
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[#E8E8EC]">
                                    <th className="pl-5 pr-1 py-3 w-8">
                                        <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Seleccionar página" className="accent-[#818CF8]" />
                                    </th>
                                    <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
                                        Nombre
                                    </th>
                                    <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider hidden md:table-cell">
                                        Teléfono
                                    </th>
                                    <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider hidden lg:table-cell">
                                        Email
                                    </th>
                                    <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
                                        Etapa
                                    </th>
                                    <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider hidden xl:table-cell">
                                        Tags
                                    </th>
                                    <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider hidden xl:table-cell">
                                        Última actividad
                                    </th>
                                    <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider hidden xl:table-cell">
                                        Asignado
                                    </th>
                                    <th className="px-3 py-3 w-20" />
                                </tr>
                            </thead>
                            <tbody>
                                {paginated.map((contact) => (
                                    <ContactRow
                                        key={contact.id}
                                        contact={contact}
                                        selected={selected.has(contact.id)}
                                        onToggle={() => toggleSelected(contact.id)}
                                        onEdit={() => setEditing(contact)}
                                        onDelete={() => setConfirmDelete([contact.id])}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-[#E8E8EC]">
                        <p className="text-[13px] text-[#9CA3AF]">
                            Mostrando{' '}
                            {(safeCurrentPage - 1) * ITEMS_PER_PAGE + 1}–
                            {Math.min(safeCurrentPage * ITEMS_PER_PAGE, filtered.length)} de{' '}
                            {filtered.length}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPageSafe(safeCurrentPage - 1)}
                                disabled={safeCurrentPage === 1}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA3AF] hover:bg-[#F3F4F6] disabled:opacity-40 transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>

                            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                const p = i + 1;
                                return (
                                    <button
                                        key={p}
                                        onClick={() => setPageSafe(p)}
                                        className={`w-8 h-8 rounded-lg text-[13px] font-medium transition-colors ${
                                            safeCurrentPage === p
                                                ? 'bg-[#818CF8] text-white'
                                                : 'text-[#6B7280] hover:bg-[#F3F4F6]'
                                        }`}
                                    >
                                        {p}
                                    </button>
                                );
                            })}

                            <button
                                onClick={() => setPageSafe(safeCurrentPage + 1)}
                                disabled={safeCurrentPage === totalPages}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA3AF] hover:bg-[#F3F4F6] disabled:opacity-40 transition-colors"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {editing && (
                <EditContactDialog
                    key={editing.id}
                    open={!!editing}
                    onOpenChange={(o) => { if (!o) setEditing(null); }}
                    contact={editing}
                    stages={stages}
                    onSuccess={() => { setEditing(null); router.refresh(); }}
                />
            )}

            <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o && !busy) setConfirmDelete(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {confirmDelete?.length === 1
                                ? `¿Eliminar a ${contacts.find((c) => c.id === confirmDelete[0])?.nombre ?? 'este contacto'}?`
                                : `¿Eliminar ${confirmDelete?.length ?? 0} contactos?`}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-[13px] text-[#6B7280]">
                        Se borran también sus conversaciones, mensajes, notas y etiquetas. Las citas, reservas y ventas se conservan sin contacto.
                        <span className="font-medium text-[#1A1A2E]"> No se puede deshacer.</span>
                    </p>
                    <DialogFooter>
                        <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(null)} className="rounded-xl">Cancelar</Button>
                        <Button
                            disabled={busy}
                            onClick={async () => { if (confirmDelete && await bulk('delete', confirmDelete)) setConfirmDelete(null); }}
                            className="rounded-xl bg-red-600 hover:bg-red-700 text-white gap-2"
                        >
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Eliminar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <BulkFieldDialog
                open={fieldDialog}
                fields={fields}
                count={selected.size}
                busy={busy}
                onClose={() => setFieldDialog(false)}
                onApply={async (field_key, value) => {
                    if (await bulk('set_field', [...selected], { field_key, value })) setFieldDialog(false);
                }}
            />
        </>
    );
}

/** Compact select that runs an action when an option is picked. */
function BulkSelect({ label, options, onPick, disabled }: {
    label: string;
    options: { value: string; label: string }[];
    onPick: (value: string) => void;
    disabled?: boolean;
}) {
    return (
        <select
            value=""
            disabled={disabled || options.length === 0}
            onChange={(e) => { if (e.target.value) onPick(e.target.value); }}
            className="text-[12px] px-2 py-1.5 rounded-lg border border-[#E8E8EC] bg-white text-[#374151] max-w-[150px] disabled:opacity-50"
        >
            <option value="">{label}…</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

/** Sets (or clears) one custom field on every selected contact. */
function BulkFieldDialog({ open, fields, count, busy, onClose, onApply }: {
    open: boolean;
    fields: { field_key: string; label: string; field_type: string; options: unknown }[];
    count: number;
    busy: boolean;
    onClose: () => void;
    onApply: (fieldKey: string, value: string) => void;
}) {
    const [key, setKey] = useState('');
    const [value, setValue] = useState('');
    const fieldKey = key || fields[0]?.field_key || '';
    const def = fields.find((f) => f.field_key === fieldKey);
    const opts = Array.isArray(def?.options) ? (def!.options as string[]) : [];
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Campo personalizado · {count} contacto{count === 1 ? '' : 's'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <select value={fieldKey} onChange={(e) => { setKey(e.target.value); setValue(''); }} className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-lg">
                        {fields.map((f) => <option key={f.field_key} value={f.field_key}>{f.label}</option>)}
                    </select>
                    {opts.length > 0 ? (
                        <select value={value} onChange={(e) => setValue(e.target.value)} className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-lg">
                            <option value="">(vaciar el campo)</option>
                            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    ) : (
                        <input
                            type={def?.field_type === 'date' ? 'date' : def?.field_type === 'number' ? 'number' : 'text'}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="Nuevo valor (vacío = borrar el valor)"
                            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-lg"
                        />
                    )}
                    <p className="text-[11px] text-[#9CA3AF]">Reemplaza el valor actual de cada contacto seleccionado.</p>
                </div>
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose} className="rounded-xl">Cancelar</Button>
                    <Button disabled={busy || !fieldKey} onClick={() => onApply(fieldKey, value)} className="rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white gap-2">
                        {busy && <Loader2 size={14} className="animate-spin" />} {value.trim() ? 'Guardar valor' : 'Vaciar campo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// Contact row
// ---------------------------------------------------------------------------
function ContactRow({
    contact, selected, onToggle, onEdit, onDelete,
}: {
    contact: ContactWithRelations;
    selected: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const fullName = contact.nombre;
    const initials = getInitials(fullName);
    const tags = contact.contact_tags
        .map((ct) => ct.tag)
        .filter(Boolean) as { id: string; name: string; color: string | null }[];

    return (
        <tr className={`group border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE] transition-colors cursor-pointer ${selected ? 'bg-[#F5F6FF]' : ''}`}>
            <td className="pl-5 pr-1 py-3.5 w-8">
                <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Seleccionar ${contact.nombre}`} className="accent-[#818CF8]" />
            </td>
            {/* Name + Avatar */}
            <td className="px-5 py-3.5">
                <Link href={`/contacts/${contact.id}`} className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center">
                            <span className="text-white text-[11px] font-semibold">{initials}</span>
                        </div>
                        {/* AI status dot */}
                        <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white flex items-center justify-center ${
                                contact.ai_active ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                            title={contact.ai_active ? 'IA activa' : 'Control manual'}
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <p className="text-[14px] font-medium text-[#1A1A2E]">{fullName}</p>
                            {!contact.ai_active && (
                                <UserCheck size={12} className="text-amber-500 flex-shrink-0" />
                            )}
                        </div>
                        <p className="text-[12px] text-[#9CA3AF] md:hidden">{contact.wa_id ?? contact.email ?? '—'}</p>
                    </div>
                </Link>
            </td>

            {/* Phone */}
            <td className="px-5 py-3.5 text-[13px] text-[#6B7280] hidden md:table-cell">
                {contact.wa_id ?? '—'}
            </td>

            {/* Email */}
            <td className="px-5 py-3.5 text-[13px] text-[#6B7280] hidden lg:table-cell">
                {contact.email ?? '—'}
            </td>

            {/* Stage */}
            <td className="px-5 py-3.5">
                {contact.funnel_stage ? (
                    <FunnelStageBadge
                        name={contact.funnel_stage.name}
                        color={contact.funnel_stage.color}
                        size="sm"
                    />
                ) : (
                    <span className="text-[12px] text-[#D1D5DB]">Sin etapa</span>
                )}
            </td>

            {/* Tags */}
            <td className="px-5 py-3.5 hidden xl:table-cell">
                <div className="flex flex-wrap gap-1">
                    {tags.slice(0, 3).map((tag) => (
                        <TagPill key={tag.id} name={tag.name} color={tag.color} />
                    ))}
                    {tags.length > 3 && (
                        <span className="text-[11px] text-[#9CA3AF]">+{tags.length - 3}</span>
                    )}
                    {tags.length === 0 && <span className="text-[12px] text-[#D1D5DB]">—</span>}
                </div>
            </td>

            {/* Last activity */}
            <td className="px-5 py-3.5 text-[13px] text-[#9CA3AF] hidden xl:table-cell">
                {contact.last_contacted_at ? formatSmartDate(contact.last_contacted_at) : '—'}
            </td>

            {/* Assigned */}
            <td className="px-5 py-3.5 hidden xl:table-cell">
                <span className="text-[12px] text-[#D1D5DB]">—</span>
            </td>

            {/* Actions */}
            <td className="px-3 py-3.5 text-right whitespace-nowrap">
                <button onClick={onEdit} title="Editar" className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#4F46E5] hover:bg-[#EEF0FF]">
                    <Pencil size={14} />
                </button>
                <button onClick={onDelete} title="Eliminar" className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={14} />
                </button>
            </td>
        </tr>
    );
}

// ---------------------------------------------------------------------------
// Tag pill
// ---------------------------------------------------------------------------
function TagPill({ name, color }: { name: string; color: string | null }) {
    const hex = color ?? '#9CA3AF';
    let r = 156, g = 163, b = 175;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    return (
        <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{ backgroundColor: `rgba(${r},${g},${b},0.12)`, color: hex }}
        >
            {name}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ hasSearch }: { hasSearch: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#EEF0FF] flex items-center justify-center mb-4">
                <Users size={24} className="text-[#818CF8]" />
            </div>
            <p className="text-[16px] font-semibold text-[#1A1A2E] mb-1">
                {hasSearch ? 'Sin resultados' : 'Sin contactos aún'}
            </p>
            <p className="text-[14px] text-[#9CA3AF] max-w-xs">
                {hasSearch
                    ? 'Prueba ajustando los filtros o el término de búsqueda.'
                    : 'Crea tu primer contacto con el botón "Nuevo contacto".'}
            </p>
        </div>
    );
}
