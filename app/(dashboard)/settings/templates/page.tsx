'use client';

import { useEffect, useState } from 'react';
import { Plus, RefreshCw, X, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import type { MessageTemplate } from '@/lib/types/database';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    APPROVED: { label: 'Aprobada', className: 'bg-[#ECFDF5] text-[#059669]' },
    PENDING: { label: 'Pendiente', className: 'bg-[#FFFBEB] text-[#D97706]' },
    REJECTED: { label: 'Rechazada', className: 'bg-[#FEF2F2] text-[#DC2626]' },
};

function getTemplateStatus(template: MessageTemplate): string {
    return template.status ?? 'PENDING';
}

function getTemplateVariables(template: MessageTemplate): string[] {
    const components = template.components as Array<{ type: string; text?: string }> | null;
    return (
        components
            ?.find((c) => c.type === 'BODY')
            ?.text?.match(/\{\{(\d+)\}\}/g)
            ?.map((v) => v.replace(/\{\{|\}\}/g, '')) ?? []
    );
}

function getTemplateContent(template: MessageTemplate): string {
    const components = template.components as Array<{ type: string; text?: string }> | null;
    return components?.find((c) => c.type === 'BODY')?.text ?? '';
}

function NewTemplateDialog({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    onCreated: (t: MessageTemplate) => void;
}) {
    const [name, setName] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('');
    const [language, setLanguage] = useState('es');
    const [loading, setLoading] = useState(false);

    // Extract variables from {{N}} patterns
    const variables = Array.from(new Set(content.match(/\{\{(\d+)\}\}/g)?.map((v) => v.replace(/\{\{|\}\}/g, '')) ?? []));

    async function handleCreate() {
        if (!name.trim() || !content.trim()) return;
        setLoading(true);
        try {
            const res = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, content, category: category || null, language, variables: variables.length > 0 ? variables : null }),
            });
            const data = await res.json();
            if (data.template) {
                onCreated(data.template);
                setName(''); setContent(''); setCategory(''); setLanguage('es');
            }
        } finally {
            setLoading(false);
        }
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-[#E8E8EC]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]">
                    <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Nueva Plantilla</h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                            Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="promo_dia_madre"
                            className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Categoría</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                            >
                                <option value="">Sin categoría</option>
                                <option value="MARKETING">Marketing</option>
                                <option value="UTILITY">Utilidad</option>
                                <option value="AUTHENTICATION">Autenticación</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Idioma</label>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                            >
                                <option value="es">Español</option>
                                <option value="en">Inglés</option>
                                <option value="pt">Portugués</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                            Contenido <span className="text-red-500">*</span>
                            <span className="ml-2 text-[11px] text-[#9CA3AF] font-normal">Usa {'{{1}}'} {'{{2}}'} para variables</span>
                        </label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={5}
                            placeholder={`Hola {{1}}, te invitamos a nuestra promoción especial…`}
                            className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] resize-none"
                        />
                        {variables.length > 0 && (
                            <p className="text-[11px] text-[#9CA3AF] mt-1">
                                Variables detectadas: {variables.map((v) => `{{${v}}}`).join(', ')}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E8E8EC]">
                    <Button variant="outline" onClick={onClose} className="rounded-xl border-[#E8E8EC]">Cancelar</Button>
                    <Button
                        onClick={handleCreate}
                        disabled={loading || !name.trim() || !content.trim()}
                        className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Crear plantilla
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function TemplatesPage() {
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [selected, setSelected] = useState<MessageTemplate | null>(null);

    useEffect(() => {
        fetch('/api/templates')
            .then((r) => r.json())
            .then((d) => setTemplates(d.templates ?? []))
            .finally(() => setLoading(false));
    }, []);

    async function handleSync() {
        setSyncing(true);
        setSyncMsg('');
        try {
            const res = await fetch('/api/templates/sync', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setSyncMsg(`${data.synced} plantillas sincronizadas desde Meta.`);
                // Refresh list
                const refresh = await fetch('/api/templates').then((r) => r.json());
                setTemplates(refresh.templates ?? []);
            } else {
                setSyncMsg(data.error ?? 'Error al sincronizar.');
            }
        } finally {
            setSyncing(false);
        }
    }

    return (
        <>
            <Breadcrumb />
            <PageHeader title="Plantillas de Mensaje" description="Gestiona tus plantillas de WhatsApp">
                <Button
                    variant="outline"
                    onClick={handleSync}
                    disabled={syncing}
                    className="gap-2 rounded-xl border-[#E8E8EC] text-[#6B7280]"
                >
                    {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Sincronizar desde Meta
                </Button>
                <Button
                    onClick={() => setShowNew(true)}
                    className="bg-[#818CF8] hover:bg-[#6366F1] text-white rounded-xl gap-2"
                >
                    <Plus size={16} /> Nueva Plantilla
                </Button>
            </PageHeader>

            {syncMsg && (
                <div className="mb-4 px-4 py-3 bg-[#ECFDF5] border border-[#34D399]/30 rounded-xl text-[13px] text-[#059669]">
                    {syncMsg}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Table */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-[#9CA3AF] text-[14px]">Cargando plantillas…</div>
                    ) : templates.length === 0 ? (
                        <div className="p-12 text-center">
                            <FileText size={40} className="text-[#E8E8EC] mx-auto mb-3" />
                            <p className="text-[#9CA3AF] text-[14px]">No hay plantillas. Crea una o sincroniza desde Meta.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-[#E8E8EC]">
                                        {['Nombre', 'Idioma', 'Categoría', 'Estado', 'Variables'].map((h) => (
                                            <th key={h} className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {templates.map((t) => {
                                        const status = getTemplateStatus(t);
                                        const badge = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
                                        return (
                                            <tr
                                                key={t.id}
                                                onClick={() => setSelected(t)}
                                                className={`border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE] transition-colors cursor-pointer ${selected?.id === t.id ? 'bg-[#F3F4FF]' : ''}`}
                                            >
                                                <td className="px-5 py-3.5 text-[14px] font-medium text-[#1A1A2E]">{t.name}</td>
                                                <td className="px-5 py-3.5 text-[13px] text-[#6B7280] uppercase">{t.language}</td>
                                                <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{t.category ?? '—'}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full ${badge.className}`}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-[13px] text-[#9CA3AF]">
                                                    {getTemplateVariables(t).length > 0
                                                        ? getTemplateVariables(t).map((v) => `{{${v}}}`).join(', ')
                                                        : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Preview panel */}
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5">
                    {selected ? (
                        <>
                            <div className="flex items-start justify-between mb-4">
                                <h3 className="text-[15px] font-semibold text-[#1A1A2E]">{selected.name}</h3>
                                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF]">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Categoría</p>
                                    <p className="text-[13px] text-[#1A1A2E]">{selected.category ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Idioma</p>
                                    <p className="text-[13px] text-[#1A1A2E] uppercase">{selected.language}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Variables</p>
                                    <div className="flex flex-wrap gap-1">
                                        {getTemplateVariables(selected).length > 0
                                            ? getTemplateVariables(selected).map((v) => (
                                                <span key={v} className="text-[11px] px-2 py-0.5 bg-[#EEF0FF] text-[#4F46E5] rounded-full font-medium">
                                                    {`{{${v}}}`}
                                                </span>
                                            ))
                                            : <span className="text-[13px] text-[#9CA3AF]">Sin variables</span>}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Contenido</p>
                                    <div className="bg-[#FAFAFE] border border-[#E8E8EC] rounded-xl p-3">
                                        <p className="text-[13px] text-[#1A1A2E] whitespace-pre-wrap leading-relaxed">{getTemplateContent(selected)}</p>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center py-12 text-center">
                            <FileText size={36} className="text-[#E8E8EC] mb-3" />
                            <p className="text-[13px] text-[#9CA3AF]">Selecciona una plantilla para ver su vista previa</p>
                        </div>
                    )}
                </div>
            </div>

            <NewTemplateDialog
                open={showNew}
                onClose={() => setShowNew(false)}
                onCreated={(t) => {
                    setTemplates((prev) => [t, ...prev]);
                    setShowNew(false);
                    setSelected(t);
                }}
            />
        </>
    );
}
