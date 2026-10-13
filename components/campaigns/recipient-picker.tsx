'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Loader2, Filter, Hand } from 'lucide-react';
import { ContactFilterBuilder } from '@/components/contacts/contact-filter-builder';
import { cleanFilter, type ContactFilter } from '@/lib/contact-filter';

export type PickedContact = { id: string; nombre: string; wa_id: string | null; email: string | null; in_filter: boolean };

export type RecipientSelection = {
    useFilter: boolean;
    filter: ContactFilter;
    include: Map<string, PickedContact>;
    exclude: Map<string, PickedContact>;
};

const PAGE_SIZE = 25;

/** Approximate number of WhatsApp recipients (filter matches + picked − removed). */
export function estimateRecipients(sel: RecipientSelection, filterWithPhone: number | null): number {
    const base = sel.useFilter ? (filterWithPhone ?? 0) : 0;
    const added = [...sel.include.values()].filter((c) => c.wa_id && !(sel.useFilter && c.in_filter)).length;
    const removed = sel.useFilter ? [...sel.exclude.values()].filter((c) => c.wa_id && c.in_filter).length : 0;
    return Math.max(0, base + added - removed);
}

/**
 * Who receives the campaign: contacts matching a filter and/or picked one by one.
 * With the filter on, every match is checked and can be unchecked; any other
 * contact can be added from the search.
 */
export function RecipientPicker({
    value,
    onChange,
    onFilterPreview,
}: {
    value: RecipientSelection;
    onChange: (v: RecipientSelection) => void;
    onFilterPreview: (withPhone: number | null) => void;
}) {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [pageState, setPageState] = useState({ key: '', page: 0 });
    const [rows, setRows] = useState<PickedContact[]>([]);
    const [total, setTotal] = useState(0);
    const [loadedKey, setLoadedKey] = useState('');

    const filterKey = useMemo(() => JSON.stringify(value.useFilter ? cleanFilter(value.filter) : null), [value.useFilter, value.filter]);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);
    // A new search or filter starts again at page 1
    const queryKey = `${filterKey}|${debounced}`;
    const page = pageState.key === queryKey ? pageState.page : 0;
    const setPage = (fn: (p: number) => number) => setPageState({ key: queryKey, page: fn(page) });
    const requestKey = `${queryKey}|${page}`;
    const loading = loadedKey !== requestKey;

    useEffect(() => {
        let cancelled = false;
        fetch('/api/contacts/filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter: JSON.parse(filterKey), list: { search: debounced, page, page_size: PAGE_SIZE } }),
        })
            .then((r) => r.json())
            .then((d) => { if (!cancelled) { setRows(Array.isArray(d.rows) ? d.rows : []); setTotal(d.total ?? 0); } })
            .catch(() => { if (!cancelled) setRows([]); })
            .finally(() => { if (!cancelled) setLoadedKey(requestKey); });
        return () => { cancelled = true; };
    }, [filterKey, debounced, page, requestKey]);

    const isChecked = (c: PickedContact) => (value.useFilter && c.in_filter ? !value.exclude.has(c.id) : value.include.has(c.id));

    function setChecked(c: PickedContact, on: boolean) {
        const include = new Map(value.include);
        const exclude = new Map(value.exclude);
        if (value.useFilter && c.in_filter) {
            if (on) exclude.delete(c.id); else exclude.set(c.id, c);
        } else if (on) include.set(c.id, c);
        else include.delete(c.id);
        onChange({ ...value, include, exclude });
    }

    const pageChecked = rows.length > 0 && rows.every(isChecked);
    function togglePage() {
        const include = new Map(value.include);
        const exclude = new Map(value.exclude);
        for (const c of rows) {
            if (value.useFilter && c.in_filter) {
                if (pageChecked) exclude.set(c.id, c); else exclude.delete(c.id);
            } else if (pageChecked) include.delete(c.id);
            else include.set(c.id, c);
        }
        onChange({ ...value, include, exclude });
    }

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="space-y-4">
            {/* Mode */}
            <div className="flex gap-2">
                {[
                    { on: true, icon: Filter, label: 'Filtro + ajustes manuales', hint: 'Todos los que cumplen el filtro; puedes quitar o agregar personas.' },
                    { on: false, icon: Hand, label: 'Solo elegir a mano', hint: 'Busca y marca los contactos uno por uno.' },
                ].map((m) => (
                    <button
                        key={String(m.on)}
                        type="button"
                        onClick={() => onChange({ ...value, useFilter: m.on })}
                        className={`flex-1 text-left p-3 rounded-xl border transition-all ${value.useFilter === m.on ? 'border-[#818CF8] bg-[#F3F4FF]' : 'border-[#E8E8EC] hover:border-[#818CF8]/40'}`}
                    >
                        <p className="text-[13px] font-medium text-[#1A1A2E] flex items-center gap-1.5"><m.icon size={14} /> {m.label}</p>
                        <p className="text-[11px] text-[#9CA3AF] mt-0.5">{m.hint}</p>
                    </button>
                ))}
            </div>

            {value.useFilter && (
                <ContactFilterBuilder
                    value={value.filter}
                    onChange={(filter) => onChange({ ...value, filter, exclude: new Map() })}
                    onPreview={(p) => onFilterPreview(p?.with_phone ?? null)}
                />
            )}

            {/* Contact list */}
            <div className="rounded-xl border border-[#E8E8EC]">
                <div className="flex items-center gap-2 p-3 border-b border-[#F3F4F6]">
                    <div className="relative flex-1">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={value.useFilter ? 'Buscar cualquier contacto para agregarlo o quitarlo…' : 'Buscar por nombre, teléfono o email…'}
                            className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E8E8EC] rounded-lg focus:outline-none focus:border-[#818CF8]"
                        />
                    </div>
                    {loading && <Loader2 size={15} className="animate-spin text-[#9CA3AF]" />}
                </div>
                <p className="px-3 pt-2 text-[11px] text-[#9CA3AF]">
                    {debounced
                        ? `${total} resultado${total === 1 ? '' : 's'} en todos los contactos`
                        : value.useFilter ? `${total} contacto${total === 1 ? '' : 's'} cumplen el filtro` : `${total} contactos`}
                </p>
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-[#9CA3AF]">
                            <th className="w-10 px-3 py-2 text-left">
                                <input type="checkbox" checked={pageChecked} onChange={togglePage} disabled={rows.length === 0} aria-label="Marcar página" className="accent-[#818CF8]" />
                            </th>
                            <th className="px-2 py-2 text-left font-semibold">Nombre</th>
                            <th className="px-2 py-2 text-left font-semibold hidden sm:table-cell">Teléfono</th>
                            <th className="px-2 py-2 text-left font-semibold hidden md:table-cell">Email</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((c) => {
                            const checked = isChecked(c);
                            return (
                                <tr key={c.id} onClick={() => setChecked(c, !checked)} className={`border-t border-[#F3F4F6] cursor-pointer ${checked ? 'bg-[#F5F6FF]' : 'hover:bg-[#FAFAFE]'}`}>
                                    <td className="px-3 py-2">
                                        <input type="checkbox" checked={checked} readOnly className="accent-[#818CF8] pointer-events-none" />
                                    </td>
                                    <td className="px-2 py-2 text-[#1A1A2E]">
                                        {c.nombre}
                                        {value.useFilter && !c.in_filter && checked && <span className="ml-2 text-[10px] text-[#4F46E5] bg-[#EEF0FF] px-1.5 py-0.5 rounded-full">agregado a mano</span>}
                                    </td>
                                    <td className="px-2 py-2 text-[#6B7280] hidden sm:table-cell">{c.wa_id ?? <span className="text-[#D97706]">sin WhatsApp</span>}</td>
                                    <td className="px-2 py-2 text-[#6B7280] hidden md:table-cell">{c.email ?? '—'}</td>
                                </tr>
                            );
                        })}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={4} className="px-3 py-6 text-center text-[#9CA3AF]">Sin contactos</td></tr>
                        )}
                    </tbody>
                </table>
                {pages > 1 && (
                    <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-[#F3F4F6] text-[12px] text-[#6B7280]">
                        <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-[#F3F4F6] disabled:opacity-40"><ChevronLeft size={14} /></button>
                        Página {page + 1} de {pages}
                        <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className="p-1 rounded hover:bg-[#F3F4F6] disabled:opacity-40"><ChevronRight size={14} /></button>
                    </div>
                )}
            </div>

            {(value.include.size > 0 || value.exclude.size > 0) && (
                <div className="flex flex-wrap gap-3 text-[12px]">
                    {value.include.size > 0 && (
                        <span className="text-[#4F46E5]">
                            +{value.include.size} agregado{value.include.size === 1 ? '' : 's'} a mano
                            <button type="button" onClick={() => onChange({ ...value, include: new Map() })} className="ml-1 underline">quitar</button>
                        </span>
                    )}
                    {value.useFilter && value.exclude.size > 0 && (
                        <span className="text-[#D97706]">
                            −{value.exclude.size} quitado{value.exclude.size === 1 ? '' : 's'} del filtro
                            <button type="button" onClick={() => onChange({ ...value, exclude: new Map() })} className="ml-1 underline">restaurar</button>
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
