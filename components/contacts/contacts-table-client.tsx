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
import { FunnelStageBadge } from '@/components/contacts/funnel-stage-badge';
import { getInitials, formatSmartDate } from '@/lib/utils/format';
import type { ContactWithRelations } from '@/app/(dashboard)/contacts/page';
import type { FunnelStage } from '@/lib/types/database';

const ITEMS_PER_PAGE = 12;

type SortOption = 'created_desc' | 'last_contacted_desc' | 'score_desc' | 'nombre_asc';
type SourceOption = 'all' | 'whatsapp' | 'web' | 'manual' | 'csv' | 'n8n';

const SOURCE_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp',
    web: 'Web',
    manual: 'Manual',
    csv: 'CSV',
    n8n: 'n8n',
};

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

    // Advanced filter state
    const [showFilters, setShowFilters] = useState(false);
    const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
    const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
    const [minScore, setMinScore] = useState<string>('');
    const [sortBy, setSortBy] = useState<SortOption>('created_desc');

    // Selection and actions
    const router = useRouter();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [editing, setEditing] = useState<ContactWithRelations | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [allTags, setAllTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
    useEffect(() => {
        fetch('/api/settings/tags').then((r) => r.json()).then((d) => setAllTags(d.tags ?? [])).catch(() => {});
    }, []);
    // Drop selected ids that no longer exist (after deleting or refreshing)
    useEffect(() => {
        setSelected((prev) => {
            const ids = new Set(contacts.map((c) => c.id));
            const next = new Set([...prev].filter((id) => ids.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [contacts]);

    function toggleSelected(id: string) {
        setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    }

    async function bulk(action: 'delete' | 'add_tag' | 'remove_tag', ids: string[], tagId?: string) {
        setBusy(true);
        try {
            const res = await fetch('/api/contacts/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ids, tag_id: tagId }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || 'No se pudo completar la operación'); return false; }
            if (action === 'delete') toast.success(`${d.deleted} contacto${d.deleted === 1 ? '' : 's'} eliminado${d.deleted === 1 ? '' : 's'}`);
            else toast.success(action === 'add_tag' ? `Etiqueta agregada a ${d.updated}` : `Etiqueta quitada de ${d.updated}`);
            setSelected(new Set());
            router.refresh();
            return true;
        } catch {
            toast.error('Error de conexión');
            return false;
        } finally {
            setBusy(false);
        }
    }

    // Derive unique tags from all contacts
    const availableTags = useMemo(() => {
        const tagMap = new Map<string, { id: string; name: string; color: string | null }>();
        for (const contact of contacts) {
            for (const ct of contact.contact_tags) {
                if (ct.tag) {
                    tagMap.set(ct.tag.id, ct.tag);
                }
            }
        }
        return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [contacts]);

    // Count active advanced filters
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedSources.size > 0) count++;
        if (selectedTagIds.size > 0) count++;
        if (minScore !== '') count++;
        if (sortBy !== 'created_desc') count++;
        return count;
    }, [selectedSources, selectedTagIds, minScore, sortBy]);

    const filtered = useMemo(() => {
        let result = contacts;

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

        // Source filter
        if (selectedSources.size > 0) {
            result = result.filter((c) => selectedSources.has(c.source));
        }

        // Tag filter (contact must have ALL selected tags)
        if (selectedTagIds.size > 0) {
            result = result.filter((c) => {
                const contactTagIds = new Set(
                    c.contact_tags.map((ct) => ct.tag?.id).filter(Boolean)
                );
                for (const tagId of selectedTagIds) {
                    if (!contactTagIds.has(tagId)) return false;
                }
                return true;
            });
        }

        // Min score filter
        const minScoreNum = minScore !== '' ? parseInt(minScore, 10) : null;
        if (minScoreNum !== null && !isNaN(minScoreNum)) {
            result = result.filter((c) => c.lead_score >= minScoreNum);
        }

        // Sort
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
    }, [contacts, search, selectedStageId, selectedSources, selectedTagIds, minScore, sortBy]);

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

    function toggleSource(source: string) {
        setSelectedSources((prev) => {
            const next = new Set(prev);
            if (next.has(source)) next.delete(source);
            else next.add(source);
            return next;
        });
        setPage(1);
    }

    function toggleTag(tagId: string) {
        setSelectedTagIds((prev) => {
            const next = new Set(prev);
            if (next.has(tagId)) next.delete(tagId);
            else next.add(tagId);
            return next;
        });
        setPage(1);
    }

    function clearAllAdvancedFilters() {
        setSelectedSources(new Set());
        setSelectedTagIds(new Set());
        setMinScore('');
        setSortBy('created_desc');
        setPage(1);
    }

    const allSources: SourceOption[] = ['whatsapp', 'web', 'manual', 'csv', 'n8n'];

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
                    <div className="bg-white rounded-xl border border-[#E8E8EC] p-4 mb-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-[#1A1A2E]">Filtros avanzados</span>
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={clearAllAdvancedFilters}
                                    className="flex items-center gap-1 text-[12px] text-[#818CF8] hover:text-[#6366F1] transition-colors"
                                >
                                    <X size={12} /> Limpiar filtros
                                </button>
                            )}
                        </div>

                        {/* Row 1: Fuente + Score mínimo + Ordenar por */}
                        <div className="flex flex-wrap gap-6">
                            {/* Fuente */}
                            <div className="min-w-0">
                                <p className="text-[12px] font-medium text-[#6B7280] mb-2">Fuente</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {allSources.map((source) => (
                                        <button
                                            key={source}
                                            onClick={() => toggleSource(source)}
                                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all ${
                                                selectedSources.has(source)
                                                    ? 'bg-[#818CF8] text-white border-[#818CF8]'
                                                    : 'bg-white border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]'
                                            }`}
                                        >
                                            {SOURCE_LABELS[source]}
                                            {selectedSources.has(source) && (
                                                <X size={10} className="ml-0.5" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Score mínimo */}
                            <div className="w-36">
                                <p className="text-[12px] font-medium text-[#6B7280] mb-2">Score mínimo</p>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        placeholder="0"
                                        value={minScore}
                                        onChange={(e) => {
                                            setMinScore(e.target.value);
                                            setPage(1);
                                        }}
                                        className="w-full px-3 py-1.5 text-[13px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all"
                                    />
                                    {minScore !== '' && (
                                        <button
                                            onClick={() => { setMinScore(''); setPage(1); }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Ordenar por */}
                            <div className="min-w-[160px]">
                                <p className="text-[12px] font-medium text-[#6B7280] mb-2">Ordenar por</p>
                                <select
                                    value={sortBy}
                                    onChange={(e) => { setSortBy(e.target.value as SortOption); setPage(1); }}
                                    className="w-full px-3 py-1.5 text-[13px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all appearance-none cursor-pointer"
                                >
                                    {SORT_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Tags */}
                        {availableTags.length > 0 && (
                            <div>
                                <p className="text-[12px] font-medium text-[#6B7280] mb-2">Tags</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {availableTags.map((tag) => {
                                        const hex = tag.color ?? '#9CA3AF';
                                        const isSelected = selectedTagIds.has(tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                onClick={() => toggleTag(tag.id)}
                                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all ${
                                                    isSelected
                                                        ? 'text-white border-transparent'
                                                        : 'bg-white border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]'
                                                }`}
                                                style={isSelected ? { backgroundColor: hex, borderColor: hex } : undefined}
                                            >
                                                {!isSelected && (
                                                    <span
                                                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: hex }}
                                                    />
                                                )}
                                                {tag.name}
                                                {isSelected && <X size={10} className="ml-0.5" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
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
                    {selected.size < filtered.length && (
                        <button onClick={() => setSelected(new Set(filtered.map((c) => c.id)))} className="text-[12px] text-[#4F46E5] underline">
                            Seleccionar los {filtered.length} de la lista
                        </button>
                    )}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <select
                            value=""
                            disabled={busy || allTags.length === 0}
                            onChange={(e) => { if (e.target.value) bulk('add_tag', [...selected], e.target.value); }}
                            className="text-[12px] px-2 py-1.5 rounded-lg border border-[#E8E8EC] bg-white text-[#374151]"
                        >
                            <option value="">+ Agregar etiqueta…</option>
                            {allTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <select
                            value=""
                            disabled={busy || allTags.length === 0}
                            onChange={(e) => { if (e.target.value) bulk('remove_tag', [...selected], e.target.value); }}
                            className="text-[12px] px-2 py-1.5 rounded-lg border border-[#E8E8EC] bg-white text-[#374151]"
                        >
                            <option value="">− Quitar etiqueta…</option>
                            {allTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
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
                    </div>
                </div>
            )}

            {/* Table Card */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                {paginated.length === 0 ? (
                    <EmptyState hasSearch={!!search || activeFilterCount > 0} />
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
        </>
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
