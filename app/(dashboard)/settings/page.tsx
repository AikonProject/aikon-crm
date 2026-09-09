'use client';

import { useEffect, useState, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
    Save, Globe, Users as UsersIcon, Tag as TagIcon, Sliders, MessageSquare,
    Plus, Loader2, X, Pencil, Check, ExternalLink, Kanban
} from 'lucide-react';
import type { Tenant, User, Tag, CustomField, CannedResponse } from '@/lib/types/database';
import Link from 'next/link';

// We call APIs directly (client-side fetch to our own API routes)
const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'team', label: 'Equipo', icon: UsersIcon },
    { id: 'tags', label: 'Etiquetas', icon: TagIcon },
    { id: 'custom_fields', label: 'Campos personalizados', icon: Sliders },
    { id: 'canned', label: 'Respuestas rápidas', icon: MessageSquare },
    { id: 'funnel', label: 'Etapas del Funnel', icon: Kanban },
];

const ROLE_BADGE: Record<string, string> = {
    owner: 'bg-[#FEF9C3] text-[#854D0E]',
    admin: 'bg-[#EEF0FF] text-[#818CF8]',
    manager: 'bg-[#F5F3FF] text-[#A78BFA]',
    agent: 'bg-[#F3F4F6] text-[#6B7280]',
};

const FIELD_TYPE_LABELS: Record<string, string> = {
    text: 'Texto',
    number: 'Número',
    date: 'Fecha',
    boolean: 'Sí/No',
    select: 'Selección',
    multiselect: 'Multiselección',
};

const TAG_COLORS = ['#818CF8', '#34D399', '#F9A8D4', '#FBBF24', '#F87171', '#60A5FA', '#A78BFA', '#6EE7B7'];

// ─── General Tab ────────────────────────────────────────────────────────────
function GeneralTab() {
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetch('/api/settings/general')
            .then((r) => r.json())
            .then((d) => {
                setTenant(d.tenant);
                setName(d.tenant?.name ?? '');
                setSlug(d.tenant?.slug ?? '');
                // logo_url may not exist on type yet
                setLogoUrl((d.tenant as Record<string, string>)?.logo_url ?? '');
            });
    }, []);

    async function handleSave() {
        setSaving(true);
        const res = await fetch('/api/settings/general', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, slug, logo_url: logoUrl }),
        });
        const data = await res.json();
        if (data.tenant) { setTenant(data.tenant); setSaved(true); setTimeout(() => setSaved(false), 2500); }
        setSaving(false);
    }

    if (!tenant) return <div className="p-8 text-center text-[#9CA3AF] text-[14px]">Cargando…</div>;

    return (
        <div className="crm-card p-6 max-w-2xl space-y-5">
            <h3 className="text-[15px] font-semibold text-[#1A1A2E]">Información del restaurante</h3>
            {[
                { label: 'Nombre del restaurante', value: name, setter: setName, placeholder: 'Ej. Restaurante El Cielo' },
                { label: 'Slug (URL amigable)', value: slug, setter: setSlug, placeholder: 'restaurante-el-cielo' },
                { label: 'URL del logo', value: logoUrl, setter: setLogoUrl, placeholder: 'https://...' },
            ].map(({ label, value, setter, placeholder }) => (
                <div key={label}>
                    <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">{label}</label>
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        placeholder={placeholder}
                        className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                    />
                </div>
            ))}
            <div className="flex items-center gap-3">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
                >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
                    {saved ? 'Guardado' : 'Guardar cambios'}
                </Button>
            </div>
            <div className="pt-3 border-t border-[#F3F4F6]">
                <p className="text-[12px] text-[#9CA3AF]">
                    Plan actual: <span className="font-semibold text-[#1A1A2E]">{tenant.plan}</span>
                    {' · '}Estado: <span className={`font-semibold ${tenant.is_active ? 'text-[#059669]' : 'text-[#DC2626]'}`}>{tenant.is_active ? 'Activo' : 'Inactivo'}</span>
                </p>
            </div>
        </div>
    );
}

// ─── Team Tab ────────────────────────────────────────────────────────────────
function TeamTab() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Users are loaded via API (admin client in route)
        fetch(`/api/settings/team`)
            .then((r) => r.json())
            .then((d) => setUsers(d.users ?? []))
            .catch(() => setUsers([]))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-8 text-center text-[#9CA3AF] text-[14px]">Cargando equipo…</div>;

    return (
        <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between">
                <p className="text-[14px] text-[#6B7280]">{users.length} miembro{users.length !== 1 ? 's' : ''} en tu equipo</p>
                <Button className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px] py-2">
                    <Plus size={14} /> Invitar usuario
                </Button>
            </div>
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                {users.length === 0 ? (
                    <div className="p-8 text-center text-[#9CA3AF] text-[14px]">No hay usuarios registrados.</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-[#E8E8EC]">
                                {['Nombre', 'Email', 'Rol', 'Estado'].map((h) => (
                                    <th key={h} className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id} className="border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE]">
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center flex-shrink-0">
                                                <span className="text-white text-[11px] font-semibold">
                                                    {u.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                                                </span>
                                            </div>
                                            <span className="text-[14px] font-medium text-[#1A1A2E]">{u.full_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{u.email}</td>
                                    <td className="px-5 py-3.5">
                                        <span className={`text-[12px] font-medium px-2 py-0.5 rounded-full ${ROLE_BADGE[u.role] ?? ROLE_BADGE.agent}`}>
                                            {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className={`w-2 h-2 rounded-full inline-block ${u.is_active ? 'bg-[#34D399]' : 'bg-[#D1D5DB]'}`} />
                                        <span className="ml-2 text-[13px] text-[#6B7280]">{u.is_active ? 'Activo' : 'Inactivo'}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <div className="crm-card p-4 flex items-center justify-between">
                <div>
                    <p className="text-[14px] font-medium text-[#1A1A2E]">Etapas del Funnel</p>
                    <p className="text-[12px] text-[#9CA3AF]">Configura las etapas de tu pipeline de ventas</p>
                </div>
                <Link href="/funnel/settings">
                    <Button variant="outline" className="gap-2 rounded-xl border-[#E8E8EC] text-[#6B7280] text-[13px]">
                        <ExternalLink size={14} /> Configurar
                    </Button>
                </Link>
            </div>
        </div>
    );
}

// ─── Tags Tab ────────────────────────────────────────────────────────────────
function TagsTab() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(TAG_COLORS[0]);
    const [adding, setAdding] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const loadTags = useCallback(async () => {
        const res = await fetch('/api/settings/tags');
        const d = await res.json();
        setTags(d.tags ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { loadTags(); }, [loadTags]);

    async function handleAdd() {
        if (!newName.trim()) return;
        setAdding(true);
        await fetch('/api/settings/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim(), color: newColor }),
        });
        setNewName('');
        await loadTags();
        setAdding(false);
    }

    async function handleDelete(id: string) {
        await fetch(`/api/settings/tags/${id}`, { method: 'DELETE' });
        setTags((prev) => prev.filter((t) => t.id !== id));
    }

    async function handleEdit(id: string) {
        if (!editName.trim()) return;
        await fetch(`/api/settings/tags/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: editName.trim() }),
        });
        setTags((prev) => prev.map((t) => t.id === id ? { ...t, name: editName.trim() } : t));
        setEditId(null);
    }

    if (loading) return <div className="p-8 text-center text-[#9CA3AF] text-[14px]">Cargando etiquetas…</div>;

    return (
        <div className="max-w-xl space-y-4">
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5 space-y-3">
                <h3 className="text-[14px] font-semibold text-[#1A1A2E]">Nueva etiqueta</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        placeholder="Nombre de etiqueta"
                        className="flex-1 px-3 py-2 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                    />
                    <Button onClick={handleAdd} disabled={adding || !newName.trim()} className="gap-1.5 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white px-3">
                        {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {TAG_COLORS.map((c) => (
                        <button
                            key={c}
                            onClick={() => setNewColor(c)}
                            className={`w-7 h-7 rounded-full border-2 transition-all ${newColor === c ? 'border-[#1A1A2E] scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </div>
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                {tags.length === 0 ? (
                    <div className="p-8 text-center text-[#9CA3AF] text-[14px]">No hay etiquetas todavía.</div>
                ) : (
                    <ul>
                        {tags.map((tag) => (
                            <li key={tag.id} className="flex items-center gap-3 px-5 py-3 border-b border-[#F3F4F6] last:border-0">
                                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color ?? '#818CF8' }} />
                                {editId === tag.id ? (
                                    <input
                                        autoFocus
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(tag.id); if (e.key === 'Escape') setEditId(null); }}
                                        className="flex-1 px-2 py-1 text-[14px] border border-[#818CF8] rounded-lg focus:outline-none"
                                    />
                                ) : (
                                    <span className="flex-1 text-[14px] text-[#1A1A2E]">{tag.name}</span>
                                )}
                                <div className="flex items-center gap-1">
                                    {editId === tag.id ? (
                                        <>
                                            <button onClick={() => handleEdit(tag.id)} className="p-1.5 rounded-lg hover:bg-[#ECFDF5] text-[#059669]"><Check size={14} /></button>
                                            <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF]"><X size={14} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => { setEditId(tag.id); setEditName(tag.name); }} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF]"><Pencil size={14} /></button>
                                            <button onClick={() => handleDelete(tag.id)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626]"><X size={14} /></button>
                                        </>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

// ─── Custom Fields Tab ───────────────────────────────────────────────────────
function CustomFieldsTab() {
    const [fields, setFields] = useState<CustomField[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [fieldKey, setFieldKey] = useState('');
    const [label, setLabel] = useState('');
    const [fieldType, setFieldType] = useState('text');
    const [options, setOptions] = useState('');
    const [adding, setAdding] = useState(false);

    const loadFields = useCallback(async () => {
        const res = await fetch('/api/settings/custom-fields');
        const d = await res.json();
        setFields(d.fields ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { loadFields(); }, [loadFields]);

    async function handleAdd() {
        if (!fieldKey.trim() || !label.trim()) return;
        setAdding(true);
        await fetch('/api/settings/custom-fields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                field_key: fieldKey.trim().toLowerCase().replace(/\s+/g, '_'),
                label: label.trim(),
                field_type: fieldType,
                options: ['select', 'multiselect'].includes(fieldType) ? options.split(',').map((o) => o.trim()).filter(Boolean) : null,
                position: fields.length,
            }),
        });
        setShowForm(false);
        setFieldKey(''); setLabel(''); setFieldType('text'); setOptions('');
        await loadFields();
        setAdding(false);
    }

    async function handleDelete(id: string) {
        await fetch(`/api/settings/custom-fields/${id}`, { method: 'DELETE' });
        setFields((prev) => prev.filter((f) => f.id !== id));
    }

    if (loading) return <div className="p-8 text-center text-[#9CA3AF] text-[14px]">Cargando…</div>;

    return (
        <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-[13px] text-[#6B7280]">Campos adicionales que aparecen en el perfil del contacto</p>
                <Button onClick={() => setShowForm((v) => !v)} className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px] py-2">
                    <Plus size={14} /> Nuevo campo
                </Button>
            </div>

            {showForm && (
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">Etiqueta</label>
                            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. Fecha de cumpleaños"
                                className="w-full px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-xl focus:outline-none focus:border-[#818CF8]" />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">Clave (field_key)</label>
                            <input type="text" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} placeholder="Ej. fecha_cumpleanos"
                                className="w-full px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-xl focus:outline-none focus:border-[#818CF8]" />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">Tipo</label>
                            <select value={fieldType} onChange={(e) => setFieldType(e.target.value)}
                                className="w-full px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-xl focus:outline-none focus:border-[#818CF8]">
                                {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        {['select', 'multiselect'].includes(fieldType) && (
                            <div>
                                <label className="block text-[12px] font-medium text-[#6B7280] mb-1">Opciones (separadas por coma)</label>
                                <input type="text" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Opción 1, Opción 2"
                                    className="w-full px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-xl focus:outline-none focus:border-[#818CF8]" />
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleAdd} disabled={adding || !fieldKey.trim() || !label.trim()}
                            className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px]">
                            {adding ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Guardar campo
                        </Button>
                        <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-xl border-[#E8E8EC] text-[#6B7280] text-[13px]">Cancelar</Button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                {fields.length === 0 ? (
                    <div className="p-8 text-center text-[#9CA3AF] text-[14px]">No hay campos personalizados.</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-[#E8E8EC]">
                                {['Etiqueta', 'Clave', 'Tipo', 'Opciones', ''].map((h) => (
                                    <th key={h} className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {fields.map((f) => (
                                <tr key={f.id} className="border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE]">
                                    <td className="px-5 py-3.5 text-[14px] font-medium text-[#1A1A2E]">{f.label}</td>
                                    <td className="px-5 py-3.5"><code className="text-[12px] bg-[#F3F4F6] px-2 py-0.5 rounded-lg text-[#6B7280]">{f.field_key}</code></td>
                                    <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}</td>
                                    <td className="px-5 py-3.5 text-[12px] text-[#9CA3AF]">{Array.isArray(f.options) ? (f.options as string[]).join(', ') || '—' : '—'}</td>
                                    <td className="px-5 py-3.5">
                                        <button onClick={() => handleDelete(f.id)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626]"><X size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ─── Canned Responses Tab ────────────────────────────────────────────────────
function CannedResponsesTab() {
    const [responses, setResponses] = useState<CannedResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [shortCode, setShortCode] = useState('');
    const [content, setContent] = useState('');
    const [adding, setAdding] = useState(false);

    const loadResponses = useCallback(async () => {
        const res = await fetch('/api/settings/canned-responses');
        const d = await res.json();
        setResponses(d.responses ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { loadResponses(); }, [loadResponses]);

    async function handleAdd() {
        if (!shortCode.trim() || !content.trim()) return;
        setAdding(true);
        await fetch('/api/settings/canned-responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shortcut: shortCode.trim(), content: content.trim() }),
        });
        setShowForm(false);
        setShortCode(''); setContent('');
        await loadResponses();
        setAdding(false);
    }

    async function handleDelete(id: string) {
        await fetch(`/api/settings/canned-responses/${id}`, { method: 'DELETE' });
        setResponses((prev) => prev.filter((r) => r.id !== id));
    }

    if (loading) return <div className="p-8 text-center text-[#9CA3AF] text-[14px]">Cargando…</div>;

    return (
        <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-[13px] text-[#6B7280]">Respuestas rápidas reutilizables en conversaciones</p>
                <Button onClick={() => setShowForm((v) => !v)} className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px] py-2">
                    <Plus size={14} /> Nueva respuesta
                </Button>
            </div>

            {showForm && (
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5 space-y-3">
                    <div>
                        <label className="block text-[12px] font-medium text-[#6B7280] mb-1">Atajo (shortcut)</label>
                        <input type="text" value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="Ej. /bienvenida"
                            className="w-full px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-xl focus:outline-none focus:border-[#818CF8]" />
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-[#6B7280] mb-1">Contenido del mensaje</label>
                        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Hola, ¡bienvenido a nuestro restaurante!…"
                            className="w-full px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-xl focus:outline-none focus:border-[#818CF8] resize-none" />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleAdd} disabled={adding || !shortCode.trim() || !content.trim()}
                            className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px]">
                            {adding ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Guardar
                        </Button>
                        <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-xl border-[#E8E8EC] text-[#6B7280] text-[13px]">Cancelar</Button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                {responses.length === 0 ? (
                    <div className="p-8 text-center text-[#9CA3AF] text-[14px]">No hay respuestas rápidas todavía.</div>
                ) : (
                    <ul>
                        {responses.map((r) => (
                            <li key={r.id} className="flex items-start gap-4 px-5 py-4 border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE]">
                                <code className="text-[12px] font-semibold bg-[#EEF0FF] text-[#4F46E5] px-2 py-1 rounded-lg flex-shrink-0">/{r.shortcut}</code>
                                <p className="flex-1 text-[13px] text-[#6B7280] line-clamp-2">{r.content}</p>
                                <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626] flex-shrink-0">
                                    <X size={14} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

// ─── Funnel Stages Tab ──────────────────────────────────────────────────────
const STAGE_COLORS = ['#818CF8', '#34D399', '#F97316', '#F59E0B', '#F87171', '#60A5FA', '#A78BFA', '#14B8A6', '#EC4899', '#6EE7B7'];

type FunnelStage = {
    id: string;
    name: string;
    color: string | null;
    position: number;
    is_default: boolean;
    is_won: boolean;
    is_lost: boolean;
};

function FunnelStagesTab() {
    const [stages, setStages] = useState<FunnelStage[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(STAGE_COLORS[0]);
    const [adding, setAdding] = useState(false);

    const loadStages = useCallback(async () => {
        const res = await fetch('/api/funnel-stages');
        const d = await res.json();
        setStages(Array.isArray(d) ? d : []);
        setLoading(false);
    }, []);

    useEffect(() => { loadStages(); }, [loadStages]);

    async function handleAdd() {
        if (!newName.trim()) return;
        setAdding(true);
        await fetch('/api/funnel-stages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim(), color: newColor }),
        });
        setNewName('');
        await loadStages();
        setAdding(false);
        setShowForm(false);
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Eliminar esta etapa?')) return;
        await fetch(`/api/funnel-stages/${id}`, { method: 'DELETE' });
        setStages((prev) => prev.filter((s) => s.id !== id));
    }

    if (loading) return <div className="p-8 text-center text-[#9CA3AF] text-[14px]">Cargando etapas…</div>;

    return (
        <div className="max-w-xl space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-[13px] text-[#6B7280]">Etapas del pipeline de ventas de tus contactos</p>
                <Button onClick={() => setShowForm((v) => !v)} className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white text-[13px] py-2">
                    <Plus size={14} /> Nueva etapa
                </Button>
            </div>

            {showForm && (
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5 space-y-3">
                    <h3 className="text-[14px] font-semibold text-[#1A1A2E]">Nueva etapa</h3>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            placeholder="Nombre de la etapa"
                            className="flex-1 px-3 py-2 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                        />
                        <Button onClick={handleAdd} disabled={adding || !newName.trim()} className="gap-1.5 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white px-3">
                            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {STAGE_COLORS.map((c) => (
                            <button
                                key={c}
                                onClick={() => setNewColor(c)}
                                className={`w-7 h-7 rounded-full border-2 transition-all ${newColor === c ? 'border-[#1A1A2E] scale-110' : 'border-transparent'}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                    <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-xl border-[#E8E8EC] text-[#6B7280] text-[13px]">Cancelar</Button>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                {stages.length === 0 ? (
                    <div className="p-8 text-center text-[#9CA3AF] text-[14px]">No hay etapas del funnel.</div>
                ) : (
                    <ul>
                        {stages.map((stage, idx) => (
                            <li key={stage.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#F3F4F6] last:border-0">
                                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color ?? '#818CF8' }} />
                                <span className="flex-1 text-[14px] text-[#1A1A2E]">{stage.name}</span>
                                <span className="text-[11px] text-[#9CA3AF]">Pos. {idx + 1}</span>
                                {stage.is_default && (
                                    <span className="text-[11px] bg-[#EEF0FF] text-[#818CF8] px-2 py-0.5 rounded-full font-medium">Default</span>
                                )}
                                {stage.is_won && (
                                    <span className="text-[11px] bg-[#ECFDF5] text-[#059669] px-2 py-0.5 rounded-full font-medium">Ganado</span>
                                )}
                                {stage.is_lost && (
                                    <span className="text-[11px] bg-[#FEF2F2] text-[#DC2626] px-2 py-0.5 rounded-full font-medium">Perdido</span>
                                )}
                                {!stage.is_default && (
                                    <button onClick={() => handleDelete(stage.id)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626]">
                                        <X size={14} />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

// ─── Main Settings Page ──────────────────────────────────────────────────────
export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('general');

    return (
        <>
            <Breadcrumb />
            <PageHeader title="Configuración" description="Gestiona las preferencias de tu restaurante" />

            <div className="flex items-center gap-1 border-b border-[#E8E8EC] mb-6 overflow-x-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-3 text-[14px] font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'text-[#4F46E5] border-[#818CF8]'
                                : 'text-[#6B7280] border-transparent hover:text-[#1A1A2E]'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'team' && <TeamTab />}
            {activeTab === 'tags' && <TagsTab />}
            {activeTab === 'custom_fields' && <CustomFieldsTab />}
            {activeTab === 'canned' && <CannedResponsesTab />}
            {activeTab === 'funnel' && <FunnelStagesTab />}
        </>
    );
}
