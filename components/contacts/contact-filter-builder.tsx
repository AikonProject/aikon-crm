'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Users, MessageCircle, Filter, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cleanFilter, type ContactFilter, type FilterCondition } from '@/lib/contact-filter';

type Option = { value: string; label: string; color?: string | null };
type InputKind = 'multi' | 'text' | 'number' | 'days' | 'date' | 'daterange' | 'numrange' | 'bool' | 'list' | 'single' | 'none';
type OpDef = { op: string; label: string; input: InputKind };
type FieldDef = { field: string; label: string; group: string; ops: OpDef[]; options?: 'tags' | 'stages' | 'sources' | 'users' | 'campaigns' | 'bool' | 'window' };

const DATE_OPS: OpDef[] = [
    { op: 'last_days', label: 'en los últimos (días)', input: 'days' },
    { op: 'more_than_days', label: 'hace más de (días)', input: 'days' },
    { op: 'on', label: 'el día', input: 'date' },
    { op: 'after', label: 'después del', input: 'date' },
    { op: 'before', label: 'antes del', input: 'date' },
    { op: 'between', label: 'entre', input: 'daterange' },
];
const TEXT_OPS: OpDef[] = [
    { op: 'contains', label: 'contiene', input: 'text' },
    { op: 'not_contains', label: 'no contiene', input: 'text' },
    { op: 'is', label: 'es exactamente', input: 'text' },
    { op: 'starts_with', label: 'empieza por', input: 'text' },
    { op: 'not_empty', label: 'tiene valor', input: 'none' },
    { op: 'empty', label: 'está vacío', input: 'none' },
];

const FIELDS: FieldDef[] = [
    { field: 'tag', label: 'Etiqueta', group: 'Segmentación', options: 'tags', ops: [
        { op: 'has', label: 'tiene alguna de', input: 'multi' },
        { op: 'not_has', label: 'no tiene ninguna de', input: 'multi' },
    ] },
    { field: 'stage', label: 'Etapa del funnel', group: 'Segmentación', options: 'stages', ops: [
        { op: 'is', label: 'es', input: 'multi' },
        { op: 'is_not', label: 'no es', input: 'multi' },
        { op: 'empty', label: 'sin etapa', input: 'none' },
    ] },
    { field: 'custom', label: 'Campo personalizado', group: 'Segmentación', ops: [] /* depends on the field type */ },
    { field: 'source', label: 'Origen', group: 'Segmentación', options: 'sources', ops: [
        { op: 'is', label: 'es', input: 'multi' },
        { op: 'is_not', label: 'no es', input: 'multi' },
    ] },
    { field: 'assigned', label: 'Asignado a', group: 'Segmentación', options: 'users', ops: [
        { op: 'is', label: 'es', input: 'multi' },
        { op: 'is_not', label: 'no es', input: 'multi' },
        { op: 'empty', label: 'sin asignar', input: 'none' },
    ] },
    { field: 'lead_score', label: 'Puntaje (lead score)', group: 'Segmentación', ops: [
        { op: 'gt', label: 'mayor que', input: 'number' },
        { op: 'lt', label: 'menor que', input: 'number' },
        { op: 'eq', label: 'igual a', input: 'number' },
        { op: 'between', label: 'entre', input: 'numrange' },
    ] },
    { field: 'last_incoming_at', label: 'Último mensaje del cliente', group: 'Actividad', ops: [
        ...DATE_OPS, { op: 'never', label: 'nunca ha escrito', input: 'none' },
    ] },
    { field: 'last_contacted_at', label: 'Último mensaje enviado', group: 'Actividad', ops: [
        ...DATE_OPS, { op: 'never', label: 'nunca se le ha escrito', input: 'none' },
    ] },
    { field: 'window_open', label: 'Ventana de 24 h', group: 'Actividad', options: 'window', ops: [
        { op: 'is', label: 'está', input: 'single' },
    ] },
    { field: 'conversation', label: 'Conversación', group: 'Actividad', ops: [
        { op: 'unread', label: 'tiene mensajes sin leer', input: 'none' },
        { op: 'open', label: 'está abierta', input: 'none' },
        { op: 'resolved', label: 'está resuelta', input: 'none' },
        { op: 'none', label: 'no tiene conversación', input: 'none' },
    ] },
    { field: 'campaign', label: 'Campaña', group: 'Actividad', options: 'campaigns', ops: [
        { op: 'received', label: 'recibió', input: 'single' },
        { op: 'not_received', label: 'no recibió', input: 'single' },
        { op: 'read', label: 'leyó', input: 'single' },
        { op: 'replied', label: 'respondió', input: 'single' },
    ] },
    { field: 'ai_active', label: 'IA activa', group: 'Actividad', options: 'bool', ops: [
        { op: 'is', label: 'es', input: 'single' },
    ] },
    { field: 'created_at', label: 'Fecha de creación', group: 'Datos del contacto', ops: DATE_OPS },
    { field: 'name', label: 'Nombre', group: 'Datos del contacto', ops: TEXT_OPS },
    { field: 'phone', label: 'WhatsApp', group: 'Datos del contacto', ops: TEXT_OPS },
    { field: 'email', label: 'Correo', group: 'Datos del contacto', ops: TEXT_OPS },
    { field: 'id', label: 'ID o WhatsApp (lista)', group: 'Datos del contacto', ops: [
        { op: 'in', label: 'es uno de', input: 'list' },
    ] },
];

const SOURCES: Option[] = [
    { value: 'whatsapp', label: 'WhatsApp' }, { value: 'web', label: 'Web' }, { value: 'manual', label: 'Manual' },
    { value: 'csv', label: 'Importación CSV' }, { value: 'n8n', label: 'Automatización (n8n)' },
];

function customOps(type: string): OpDef[] {
    if (type === 'number') return [
        { op: 'is', label: 'es igual a', input: 'number' },
        { op: 'gt', label: 'mayor que', input: 'number' },
        { op: 'lt', label: 'menor que', input: 'number' },
        { op: 'not_empty', label: 'tiene valor', input: 'none' },
        { op: 'empty', label: 'está vacío', input: 'none' },
    ];
    if (type === 'date') return [
        { op: 'after', label: 'después del', input: 'date' },
        { op: 'before', label: 'antes del', input: 'date' },
        { op: 'birthday_today', label: 'cumple hoy (día y mes)', input: 'none' },
        { op: 'not_empty', label: 'tiene valor', input: 'none' },
        { op: 'empty', label: 'está vacío', input: 'none' },
    ];
    return [
        { op: 'is', label: 'es', input: 'text' },
        { op: 'is_not', label: 'no es', input: 'text' },
        { op: 'contains', label: 'contiene', input: 'text' },
        { op: 'not_contains', label: 'no contiene', input: 'text' },
        { op: 'not_empty', label: 'tiene valor', input: 'none' },
        { op: 'empty', label: 'está vacío', input: 'none' },
    ];
}

type Preview = { count: number; with_phone: number; sample: Array<{ id: string; nombre: string; wa_id: string | null; email: string | null }> };

const inputCls = 'px-2.5 py-1.5 text-[13px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]';

/** Professional contact filter: any number of rules joined by "all" (AND) or "any" (OR), with a live preview. */
export function ContactFilterBuilder({
    value,
    onChange,
    onPreview,
}: {
    value: ContactFilter;
    onChange: (f: ContactFilter) => void;
    onPreview?: (p: Preview | null) => void;
}) {
    const [tags, setTags] = useState<Option[]>([]);
    const [stages, setStages] = useState<Option[]>([]);
    const [users, setUsers] = useState<Option[]>([]);
    const [campaigns, setCampaigns] = useState<Option[]>([]);
    const [customFields, setCustomFields] = useState<Array<{ field_key: string; label: string; field_type: string }>>([]);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reqId = useRef(0);

    useEffect(() => {
        const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        Promise.all([get('/api/settings/tags'), get('/api/funnel-stages'), get('/api/settings/team'), get('/api/campaigns'), get('/api/settings/custom-fields')])
            .then(([t, s, u, c, cf]) => {
                setTags((t?.tags ?? []).map((x: { id: string; name: string; color: string | null }) => ({ value: x.id, label: x.name, color: x.color })));
                setStages((Array.isArray(s) ? s : s?.stages ?? []).map((x: { id: string; name: string; color: string | null }) => ({ value: x.id, label: x.name, color: x.color })));
                setUsers((u?.users ?? []).map((x: { id: string; full_name: string }) => ({ value: x.id, label: x.full_name })));
                setCampaigns((c?.campaigns ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })));
                setCustomFields(cf?.fields ?? []);
            });
    }, []);

    // Live preview (debounced)
    const cleaned = useMemo(() => JSON.stringify(cleanFilter(value)), [value]);
    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            const id = ++reqId.current;
            setLoading(true);
            try {
                const res = await fetch('/api/contacts/filter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filter: JSON.parse(cleaned), sample: 8 }),
                });
                const d = await res.json().catch(() => ({}));
                if (id !== reqId.current) return;
                if (!res.ok) { setError(d.error || 'No se pudo calcular el filtro'); setPreview(null); onPreview?.(null); return; }
                setError(null);
                setPreview(d);
                onPreview?.(d);
            } catch {
                if (id === reqId.current) setError('Error de conexión al calcular el filtro');
            } finally {
                if (id === reqId.current) setLoading(false);
            }
        }, 400);
        return () => { if (timer.current) clearTimeout(timer.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleaned]);

    function optionsFor(def: FieldDef): Option[] {
        switch (def.options) {
            case 'tags': return tags;
            case 'stages': return stages;
            case 'users': return users;
            case 'campaigns': return campaigns;
            case 'sources': return SOURCES;
            case 'bool': return [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }];
            case 'window': return [{ value: 'true', label: 'abierta (escribió en las últimas 24 h)' }, { value: 'false', label: 'cerrada' }];
            default: return [];
        }
    }

    function opsFor(c: FilterCondition): OpDef[] {
        const def = FIELDS.find((f) => f.field === c.field);
        if (!def) return [];
        if (def.field === 'custom') {
            const cf = customFields.find((x) => x.field_key === c.key);
            return customOps(cf?.field_type ?? 'text');
        }
        return def.ops;
    }

    function update(i: number, patch: Partial<FilterCondition>) {
        onChange({ ...value, conditions: value.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
    }
    function changeField(i: number, field: string) {
        const def = FIELDS.find((f) => f.field === field)!;
        const key = field === 'custom' ? customFields[0]?.field_key : undefined;
        const ops = field === 'custom' ? customOps(customFields[0]?.field_type ?? 'text') : def.ops;
        update(i, { field, key, op: ops[0]?.op ?? '', value: defaultValue(ops[0]?.input) });
    }
    function changeOp(i: number, c: FilterCondition, op: string) {
        const input = opsFor(c).find((o) => o.op === op)?.input;
        update(i, { op, value: defaultValue(input) });
    }
    function add() {
        const def = FIELDS[0];
        onChange({ ...value, conditions: [...value.conditions, { id: crypto.randomUUID(), field: def.field, op: def.ops[0].op, value: [] }] });
    }
    function remove(i: number) {
        onChange({ ...value, conditions: value.conditions.filter((_, j) => j !== i) });
    }

    const groups = Array.from(new Set(FIELDS.map((f) => f.group)));

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-[13px] text-[#6B7280]">
                <Filter size={14} className="text-[#818CF8]" />
                <span>Incluir contactos que cumplan</span>
                <select
                    value={value.match}
                    onChange={(e) => onChange({ ...value, match: e.target.value as 'all' | 'any' })}
                    className={cn(inputCls, 'font-semibold text-[#4F46E5]')}
                >
                    <option value="all">todas las condiciones (Y)</option>
                    <option value="any">alguna de las condiciones (O)</option>
                </select>
            </div>

            {value.conditions.length === 0 && (
                <p className="text-[13px] text-[#9CA3AF] bg-[#FAFAFE] border border-dashed border-[#E8E8EC] rounded-xl px-4 py-3">
                    Sin condiciones: se incluyen <b>todos</b> los contactos. Agrega condiciones para segmentar.
                </p>
            )}

            <div className="space-y-2">
                {value.conditions.map((c, i) => {
                    const def = FIELDS.find((f) => f.field === c.field);
                    const ops = opsFor(c);
                    const opDef = ops.find((o) => o.op === c.op) ?? ops[0];
                    return (
                        <div key={c.id ?? i} className="flex flex-wrap items-start gap-2 p-2.5 rounded-xl border border-[#E8E8EC] bg-white">
                            {i > 0 && (
                                <span className="self-center text-[11px] font-bold uppercase text-[#818CF8] w-6 text-center">
                                    {value.match === 'all' ? 'Y' : 'O'}
                                </span>
                            )}
                            <select value={c.field} onChange={(e) => changeField(i, e.target.value)} className={cn(inputCls, 'font-medium')}>
                                {groups.map((g) => (
                                    <optgroup key={g} label={g}>
                                        {FIELDS.filter((f) => f.group === g && (f.field !== 'custom' || customFields.length > 0)).map((f) => (
                                            <option key={f.field} value={f.field}>{f.label}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            {def?.field === 'custom' && (
                                <select
                                    value={c.key ?? ''}
                                    onChange={(e) => {
                                        const cf = customFields.find((x) => x.field_key === e.target.value);
                                        const first = customOps(cf?.field_type ?? 'text')[0];
                                        update(i, { key: e.target.value, op: first.op, value: defaultValue(first.input) });
                                    }}
                                    className={inputCls}
                                >
                                    {customFields.map((cf) => <option key={cf.field_key} value={cf.field_key}>{cf.label}</option>)}
                                </select>
                            )}
                            <select value={c.op} onChange={(e) => changeOp(i, c, e.target.value)} className={inputCls}>
                                {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                            </select>
                            {def && opDef && (
                                <ValueInput kind={opDef.input} value={c.value} options={optionsFor(def)} onChange={(v) => update(i, { value: v })} />
                            )}
                            <button onClick={() => remove(i)} className="ml-auto p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-600 hover:bg-red-50" title="Quitar condición">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>

            <button onClick={add} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-[#C7D2FE] text-[13px] font-medium text-[#4F46E5] hover:bg-[#F5F5FF]">
                <Plus size={14} /> Agregar condición
            </button>

            {/* Live result */}
            <div className="rounded-xl border border-[#818CF8]/20 bg-[#F3F4FF] p-4">
                {error ? (
                    <p className="text-[13px] text-red-600">{error}</p>
                ) : (
                    <>
                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Users size={16} className="text-[#4F46E5]" />
                                <span className="text-[20px] font-bold text-[#1A1A2E]">{loading && !preview ? '…' : preview?.count ?? 0}</span>
                                <span className="text-[13px] text-[#6B7280]">contactos coinciden</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <MessageCircle size={16} className="text-emerald-600" />
                                <span className="text-[20px] font-bold text-[#1A1A2E]">{loading && !preview ? '…' : preview?.with_phone ?? 0}</span>
                                <span className="text-[13px] text-[#6B7280]">con WhatsApp (recibirán el mensaje)</span>
                            </div>
                            {loading && <Loader2 size={14} className="animate-spin text-[#818CF8]" />}
                        </div>
                        {preview && preview.sample.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {preview.sample.map((s) => (
                                    <span key={s.id} className="text-[11px] px-2 py-1 rounded-full bg-white border border-[#E8E8EC] text-[#374151]" title={s.wa_id ?? s.email ?? ''}>
                                        {s.nombre}{s.wa_id ? '' : ' · sin WhatsApp'}
                                    </span>
                                ))}
                                {preview.count > preview.sample.length && (
                                    <span className="text-[11px] px-2 py-1 text-[#9CA3AF]">y {preview.count - preview.sample.length} más</span>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function defaultValue(input?: InputKind): unknown {
    if (input === 'multi') return [];
    if (input === 'daterange' || input === 'numrange') return ['', ''];
    if (input === 'days') return 30;
    if (input === 'single') return '';
    return '';
}

function ValueInput({ kind, value, options, onChange }: { kind: InputKind; value: unknown; options: Option[]; onChange: (v: unknown) => void }) {
    if (kind === 'none') return null;
    if (kind === 'multi') return <MultiSelect options={options} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    if (kind === 'single') {
        return (
            <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls}>
                <option value="">Selecciona…</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        );
    }
    if (kind === 'days') {
        return (
            <span className="flex items-center gap-1.5">
                <input type="number" min={0} value={String(value ?? '')} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={cn(inputCls, 'w-20')} />
                <span className="text-[12px] text-[#9CA3AF]">días</span>
            </span>
        );
    }
    if (kind === 'number') return <input type="number" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'w-28')} />;
    if (kind === 'date') return <input type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    if (kind === 'daterange' || kind === 'numrange') {
        const [a, b] = Array.isArray(value) ? (value as string[]) : ['', ''];
        const type = kind === 'daterange' ? 'date' : 'number';
        return (
            <span className="flex items-center gap-1.5">
                <input type={type} value={a ?? ''} onChange={(e) => onChange([e.target.value, b])} className={cn(inputCls, type === 'number' && 'w-24')} />
                <span className="text-[12px] text-[#9CA3AF]">y</span>
                <input type={type} value={b ?? ''} onChange={(e) => onChange([a, e.target.value])} className={cn(inputCls, type === 'number' && 'w-24')} />
            </span>
        );
    }
    if (kind === 'list') {
        const text = Array.isArray(value) ? (value as string[]).join('\n') : String(value ?? '');
        return (
            <textarea
                rows={2}
                defaultValue={text}
                onBlur={(e) => onChange(e.target.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))}
                placeholder="Pega IDs o números de WhatsApp separados por coma o salto de línea"
                className={cn(inputCls, 'min-w-[260px] flex-1 resize-y')}
            />
        );
    }
    return <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder="Valor" className={cn(inputCls, 'min-w-[160px]')} />;
}

function MultiSelect({ options, value, onChange }: { options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);
    const selected = options.filter((o) => value.includes(o.value));
    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => setOpen((v) => !v)} className={cn(inputCls, 'flex items-center gap-1.5 min-w-[180px] max-w-[340px] flex-wrap text-left')}>
                {selected.length === 0 ? <span className="text-[#9CA3AF]">Selecciona…</span> : selected.map((o) => (
                    <span key={o.value} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: `${o.color ?? '#818CF8'}22`, color: o.color ?? '#4F46E5' }}>
                        {o.label}
                        <X size={10} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onChange(value.filter((v) => v !== o.value)); }} />
                    </span>
                ))}
                <ChevronDown size={13} className="ml-auto text-[#9CA3AF]" />
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-64 max-h-60 overflow-y-auto bg-white border border-[#E8E8EC] rounded-xl shadow-lg py-1">
                    {options.length === 0 ? (
                        <p className="px-3 py-2 text-[12px] text-[#9CA3AF]">No hay opciones.</p>
                    ) : options.map((o) => {
                        const on = value.includes(o.value);
                        return (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-[#F9FAFB]"
                            >
                                <span className={cn('w-4 h-4 rounded border flex items-center justify-center', on ? 'bg-[#4F46E5] border-[#4F46E5]' : 'border-[#D1D5DB]')}>
                                    {on && <Check size={11} className="text-white" />}
                                </span>
                                {o.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />}
                                <span className="truncate">{o.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
