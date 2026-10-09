'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Search, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PickedContact = { id: string; nombre: string; wa_id: string | null; email: string | null };

/**
 * Contact search box: clicking it opens a list of recent contacts right away,
 * typing filters by name, WhatsApp or email. Keyboard: ↑ ↓ Enter Esc.
 */
export function ContactPicker({
    onSelect,
    placeholder = 'Buscar contacto por nombre, WhatsApp o correo…',
    emptyHint,
    inputClassName,
    autoFocus = false,
}: {
    onSelect: (c: PickedContact) => void;
    placeholder?: string;
    /** Shown when nothing matches (e.g. "Escribe los datos abajo y se creará") */
    emptyHint?: string;
    inputClassName?: string;
    autoFocus?: boolean;
}) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState<PickedContact[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [highlight, setHighlight] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const requestId = useRef(0);
    const listId = useId();

    const search = useCallback(async (q: string) => {
        const id = ++requestId.current;
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: '30' });
            if (q.trim()) params.set('search', q.trim());
            const res = await fetch(`/api/contacts?${params}`);
            const d = await res.json().catch(() => ({}));
            if (id !== requestId.current) return; // a newer search already started
            if (!res.ok) { setError(d.error || 'No se pudieron cargar los contactos'); setResults([]); return; }
            setError(null);
            setResults(Array.isArray(d.contacts) ? d.contacts : []);
            setTotal(typeof d.total === 'number' ? d.total : 0);
            setHighlight(0);
        } catch {
            if (id === requestId.current) setError('Error de conexión al buscar contactos');
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, []);

    // Search while open: immediately on open, debounced while typing
    useEffect(() => {
        if (!open) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => search(query), query ? 200 : 0);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [open, query, search]);

    // Close when clicking outside
    useEffect(() => {
        if (!open) return;
        function onDown(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // Keep the highlighted row visible
    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [highlight]);

    function pick(c: PickedContact) {
        onSelect(c);
        setOpen(false);
        setQuery('');
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) { setOpen(true); return; }
            setHighlight((h) => Math.min(results.length - 1, h + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
        } else if (e.key === 'Enter') {
            if (open && results[highlight]) { e.preventDefault(); pick(results[highlight]); }
        } else if (e.key === 'Escape') {
            if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }
    }

    return (
        <div ref={wrapRef} className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
            <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoFocus={autoFocus}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                className={cn(
                    'w-full pl-9 pr-8 py-2 text-[13px] text-[#1A1A2E] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 focus:border-[#818CF8] placeholder:text-[#9CA3AF]',
                    inputClassName
                )}
            />
            {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#9CA3AF]" />}

            {open && (
                <div className="absolute z-40 mt-1 w-full bg-white border border-[#E8E8EC] rounded-xl shadow-lg overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-[#F3F4F6] flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                            {query.trim() ? 'Resultados' : 'Contactos recientes'}
                        </span>
                        {total > results.length && (
                            <span className="text-[10px] text-[#C4C4CE]">{results.length} de {total} · escribe para filtrar</span>
                        )}
                    </div>
                    <div ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
                        {error ? (
                            <p className="px-3 py-2 text-[12px] text-red-600">{error}</p>
                        ) : results.length === 0 && !loading ? (
                            <p className="px-3 py-3 text-[12px] text-[#9CA3AF]">
                                {query.trim() ? `Sin resultados para "${query.trim()}".` : 'Todavía no hay contactos.'}
                                {emptyHint ? ` ${emptyHint}` : ''}
                            </p>
                        ) : results.map((c, i) => (
                            <button
                                key={c.id}
                                type="button"
                                role="option"
                                aria-selected={i === highlight}
                                data-index={i}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => setHighlight(i)}
                                onClick={() => pick(c)}
                                className={cn(
                                    'w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors',
                                    i === highlight ? 'bg-[#EEF0FF]' : 'hover:bg-[#F9FAFB]'
                                )}
                            >
                                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center flex-shrink-0">
                                    <User size={13} className="text-white" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-medium text-[#1A1A2E] truncate">{c.nombre}</span>
                                    {(c.wa_id || c.email) && (
                                        <span className="block text-[11px] text-[#9CA3AF] truncate">
                                            {[c.wa_id, c.email].filter(Boolean).join(' · ')}
                                        </span>
                                    )}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
