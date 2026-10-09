'use client';

import { useEffect, useState } from 'react';
import { Plus, RefreshCw, X, Loader2, FileText, Upload, Image as ImageIcon, Video, ExternalLink, Phone, Reply, Trash2, Zap, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import { useSupabaseClient } from '@/lib/supabase/client';
import { useTenantId } from '@/components/providers/tenant-provider';
import type { MessageTemplate, ButtonAction } from '@/lib/types/database';

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

type HeaderInfo = { format: string; text?: string; url?: string } | null;

function getTemplateHeader(template: MessageTemplate): HeaderInfo {
    const components = template.components as Array<{ type: string; format?: string; text?: string; example?: { header_url?: string[]; header_handle?: string[] } }> | null;
    const h = components?.find((c) => c.type === 'HEADER');
    if (!h) return null;
    return { format: h.format ?? 'TEXT', text: h.text, url: h.example?.header_url?.[0] ?? h.example?.header_handle?.[0] };
}

function getTemplateFooter(template: MessageTemplate): string | null {
    const components = template.components as Array<{ type: string; text?: string }> | null;
    return components?.find((c) => c.type === 'FOOTER')?.text ?? null;
}

type TemplateButton = { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone_number?: string; example?: string };

function getTemplateButtons(template: MessageTemplate): TemplateButton[] {
    const components = template.components as Array<{ type: string; buttons?: TemplateButton[] }> | null;
    return components?.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
}

const BUTTON_LABEL: Record<string, string> = { QUICK_REPLY: 'Respuesta rápida', URL: 'Enlace', PHONE_NUMBER: 'Llamar' };

/** Buttons as WhatsApp shows them under the message. */
function ButtonsPreview({ buttons }: { buttons: TemplateButton[] }) {
    if (!buttons.length) return null;
    return (
        <div className="mt-2 pt-2 border-t border-[#E8E8EC] space-y-1">
            {buttons.map((b, i) => (
                <div key={i} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white border border-[#E8E8EC] text-[12px] font-medium text-[#0EA5E9]">
                    {b.type === 'URL' ? <ExternalLink size={12} /> : b.type === 'PHONE_NUMBER' ? <Phone size={12} /> : <Reply size={12} />}
                    {b.text || '(sin texto)'}
                </div>
            ))}
        </div>
    );
}

const HEADER_OPTIONS = [
    { value: '', label: 'Ninguno' },
    { value: 'TEXT', label: 'Texto' },
    { value: 'IMAGE', label: 'Imagen' },
    { value: 'VIDEO', label: 'Video' },
    { value: 'DOCUMENT', label: 'Documento PDF' },
];
const HEADER_ACCEPT: Record<string, string> = { IMAGE: 'image/jpeg,image/png', VIDEO: 'video/mp4,video/3gpp', DOCUMENT: 'application/pdf' };
const HEADER_HINT: Record<string, string> = { IMAGE: 'JPG o PNG, máx. 5 MB', VIDEO: 'MP4, máx. 16 MB', DOCUMENT: 'PDF, máx. 16 MB' };

/** Header preview (image / video / PDF / text) used in the dialog and the detail panel. */
function HeaderPreview({ header }: { header: HeaderInfo }) {
    if (!header) return null;
    if (header.format === 'TEXT') return <p className="text-[13px] font-semibold text-[#1A1A2E] mb-1">{header.text}</p>;
    if (!header.url) return <div className="text-[12px] text-[#9CA3AF] italic mb-2">[{header.format}]</div>;
    if (header.format === 'IMAGE') {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={header.url} alt="Encabezado" className="w-full max-h-48 object-cover rounded-lg mb-2" />;
    }
    if (header.format === 'VIDEO') return <video src={header.url} controls className="w-full max-h-48 rounded-lg mb-2" preload="metadata" />;
    return (
        <a href={header.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-white border border-[#E8E8EC] text-[12px] text-[#4F46E5] hover:underline">
            <FileText size={14} /> Documento PDF
        </a>
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
    const [category, setCategory] = useState('MARKETING');
    const [language, setLanguage] = useState('es');
    const [examples, setExamples] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [headerFormat, setHeaderFormat] = useState('');
    const [headerText, setHeaderText] = useState('');
    const [headerUrl, setHeaderUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [footer, setFooter] = useState('');
    const [buttons, setButtons] = useState<TemplateButton[]>([]);
    const quickCount = buttons.filter((b) => b.type === 'QUICK_REPLY').length;
    const urlCount = buttons.filter((b) => b.type === 'URL').length;
    const phoneCount = buttons.filter((b) => b.type === 'PHONE_NUMBER').length;
    function addButton(type: TemplateButton['type']) {
        setButtons((prev) => [...prev, { type, text: '', ...(type === 'URL' ? { url: 'https://' } : {}), ...(type === 'PHONE_NUMBER' ? { phone_number: '+57' } : {}) }]);
    }
    function updateButton(i: number, patch: Partial<TemplateButton>) {
        setButtons((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
    }
    const supabase = useSupabaseClient();

    async function uploadHeader(file: File) {
        setUploading(true);
        setError(null);
        try {
            // 1) The CRM validates and signs, 2) the browser uploads straight to storage
            const res = await fetch('/api/templates/media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ format: headerFormat, filename: file.name, type: file.type, size: file.size }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || 'No se pudo subir el archivo');
            const { error: upErr } = await supabase.storage.from('chat-media')
                .uploadToSignedUrl(d.path, d.token, file, { contentType: file.type });
            if (upErr) throw new Error('No se pudo subir el archivo');
            setHeaderUrl(d.url);
            toast.success('Archivo subido');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'No se pudo subir el archivo';
            setError(msg);
            toast.error(msg);
        } finally {
            setUploading(false);
        }
    }

    // Extract variables from {{N}} patterns
    const variables = Array.from(new Set(content.match(/\{\{(\d+)\}\}/g)?.map((v) => v.replace(/\{\{|\}\}/g, '')) ?? []))
        .sort((a, b) => Number(a) - Number(b));
    // Same rule the server applies: what Meta will receive as the name
    const metaName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        .replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_');

    async function handleCreate() {
        if (!name.trim() || !content.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, content, category, language,
                    examples: variables.map((v) => examples[v] ?? ''),
                    header: headerFormat ? { format: headerFormat, text: headerText, url: headerUrl } : null,
                    footer,
                    buttons,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = data.error || 'Error al crear la plantilla';
                setError(msg);
                toast.error(msg);
                return;
            }
            if (data.template) {
                onCreated(data.template);
                setName(''); setContent(''); setCategory('MARKETING'); setLanguage('es'); setExamples({});
                setHeaderFormat(''); setHeaderText(''); setHeaderUrl(''); setFooter(''); setButtons([]);
                toast.success('Plantilla enviada a Meta para aprobación. El estado se actualizará solo.');
            }
        } catch {
            setError('Error de conexión al crear la plantilla');
            toast.error('Error de conexión al crear la plantilla');
        } finally {
            setLoading(false);
        }
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-[#E8E8EC] max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]">
                    <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Nueva Plantilla</h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
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
                        {name && metaName !== name && (
                            <p className="text-[11px] text-[#9CA3AF] mt-1">Se guardará como <b className="text-[#4F46E5]">{metaName || '—'}</b> (Meta solo acepta minúsculas, números y _)</p>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Categoría <span className="text-red-500">*</span></label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                            >
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
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Encabezado</label>
                        <div className="flex flex-wrap gap-1.5">
                            {HEADER_OPTIONS.map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => { setHeaderFormat(o.value); setHeaderUrl(''); }}
                                    className={`px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${headerFormat === o.value ? 'bg-[#EEF0FF] border-[#818CF8] text-[#4F46E5]' : 'border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]'}`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                        {headerFormat === 'TEXT' && (
                            <input
                                value={headerText}
                                onChange={(e) => setHeaderText(e.target.value)}
                                maxLength={60}
                                placeholder="Título corto (máx. 60 caracteres, sin variables)"
                                className="mt-2 w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                            />
                        )}
                        {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat) && (
                            <div className="mt-2">
                                {headerUrl ? (
                                    <div className="relative bg-[#FAFAFE] border border-[#E8E8EC] rounded-xl p-2">
                                        <HeaderPreview header={{ format: headerFormat, url: headerUrl }} />
                                        <button type="button" onClick={() => setHeaderUrl('')} className="text-[12px] text-[#DC2626] hover:underline">
                                            Quitar y elegir otro archivo
                                        </button>
                                    </div>
                                ) : (
                                    <label className={`flex flex-col items-center justify-center gap-1 px-4 py-5 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${uploading ? 'border-[#818CF8] bg-[#F5F5FF]' : 'border-[#E8E8EC] hover:border-[#818CF8] hover:bg-[#FAFAFE]'}`}>
                                        {uploading ? <Loader2 size={18} className="animate-spin text-[#818CF8]" /> : <Upload size={18} className="text-[#9CA3AF]" />}
                                        <span className="text-[12px] font-medium text-[#6B7280]">{uploading ? 'Subiendo…' : 'Haz clic para subir el archivo de ejemplo'}</span>
                                        <span className="text-[11px] text-[#9CA3AF]">{HEADER_HINT[headerFormat]} · Meta lo usa para revisar la plantilla</span>
                                        <input
                                            type="file"
                                            accept={HEADER_ACCEPT[headerFormat]}
                                            className="hidden"
                                            disabled={uploading}
                                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadHeader(f); e.target.value = ''; }}
                                        />
                                    </label>
                                )}
                            </div>
                        )}
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
                            <div className="mt-3 space-y-2">
                                <p className="text-[12px] font-medium text-[#6B7280]">
                                    Ejemplos para Meta <span className="text-red-500">*</span>
                                    <span className="ml-1 text-[11px] text-[#9CA3AF] font-normal">(un valor de muestra por variable)</span>
                                </p>
                                {variables.map((v) => (
                                    <div key={v} className="flex items-center gap-2">
                                        <span className="text-[11px] px-2 py-0.5 bg-[#EEF0FF] text-[#4F46E5] rounded-full font-medium w-12 text-center">{`{{${v}}}`}</span>
                                        <input
                                            value={examples[v] ?? ''}
                                            onChange={(e) => setExamples((p) => ({ ...p, [v]: e.target.value }))}
                                            placeholder={v === '1' ? 'Ej: María' : 'Ej: valor de muestra'}
                                            className="flex-1 px-3 py-1.5 text-[13px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Pie de página <span className="text-[11px] text-[#9CA3AF] font-normal">(opcional, máx. 60)</span></label>
                        <input
                            value={footer}
                            onChange={(e) => setFooter(e.target.value)}
                            maxLength={60}
                            placeholder="Ej: Responde STOP para no recibir más mensajes"
                            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                        />
                    </div>
                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                            Botones <span className="text-[11px] text-[#9CA3AF] font-normal">(opcional, máx. 10 · 2 enlaces · 1 llamada)</span>
                        </label>
                        <div className="space-y-2">
                            {buttons.map((b, i) => (
                                <div key={i} className="p-2.5 rounded-xl border border-[#E8E8EC] bg-[#FAFAFE] space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-semibold text-[#4F46E5] w-28 flex-shrink-0">{BUTTON_LABEL[b.type]}</span>
                                        <input
                                            value={b.text}
                                            maxLength={25}
                                            onChange={(e) => updateButton(i, { text: e.target.value })}
                                            placeholder={b.type === 'QUICK_REPLY' ? 'Ej: Sí, me interesa' : b.type === 'URL' ? 'Ej: Ver catálogo' : 'Ej: Llamar ahora'}
                                            className="flex-1 px-2.5 py-1.5 text-[13px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:border-[#818CF8]"
                                        />
                                        <span className="text-[10px] text-[#C4C4CE] w-8 text-right">{b.text.length}/25</span>
                                        <button type="button" onClick={() => setButtons((prev) => prev.filter((_, j) => j !== i))} className="p-1 text-[#9CA3AF] hover:text-red-600" title="Quitar botón">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {b.type === 'URL' && (
                                        <div className="space-y-1.5 pl-[7.5rem]">
                                            <input
                                                value={b.url ?? ''}
                                                onChange={(e) => updateButton(i, { url: e.target.value })}
                                                placeholder="https://tusitio.com/catalogo  (o .../pedido/{{1}} para enlace dinámico)"
                                                className="w-full px-2.5 py-1.5 text-[12px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:border-[#818CF8]"
                                            />
                                            {/\{\{1\}\}$/.test(b.url ?? '') && (
                                                <input
                                                    value={b.example ?? ''}
                                                    onChange={(e) => updateButton(i, { example: e.target.value })}
                                                    placeholder="Ejemplo del final del enlace, ej: 12345"
                                                    className="w-full px-2.5 py-1.5 text-[12px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:border-[#818CF8]"
                                                />
                                            )}
                                        </div>
                                    )}
                                    {b.type === 'PHONE_NUMBER' && (
                                        <div className="pl-[7.5rem]">
                                            <input
                                                value={b.phone_number ?? ''}
                                                onChange={(e) => updateButton(i, { phone_number: e.target.value })}
                                                placeholder="+573001234567"
                                                className="w-full px-2.5 py-1.5 text-[12px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:border-[#818CF8]"
                                            />
                                        </div>
                                    )}
                                    {b.type === 'QUICK_REPLY' && (
                                        <p className="pl-[7.5rem] text-[11px] text-[#9CA3AF]">Después de crearla podrás configurar qué pasa cuando el cliente lo pulse.</p>
                                    )}
                                </div>
                            ))}
                        </div>
                        {buttons.length < 10 && category !== 'AUTHENTICATION' && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                <button type="button" onClick={() => addButton('QUICK_REPLY')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-[#C7D2FE] text-[12px] font-medium text-[#4F46E5] hover:bg-[#F5F5FF]">
                                    <Reply size={12} /> Respuesta rápida
                                </button>
                                <button type="button" disabled={urlCount >= 2} onClick={() => addButton('URL')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-[#C7D2FE] text-[12px] font-medium text-[#4F46E5] hover:bg-[#F5F5FF] disabled:opacity-40">
                                    <ExternalLink size={12} /> Enlace
                                </button>
                                <button type="button" disabled={phoneCount >= 1} onClick={() => addButton('PHONE_NUMBER')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-[#C7D2FE] text-[12px] font-medium text-[#4F46E5] hover:bg-[#F5F5FF] disabled:opacity-40">
                                    <Phone size={12} /> Llamar
                                </button>
                            </div>
                        )}
                        {quickCount > 0 && buttons.length > quickCount && (
                            <p className="text-[11px] text-[#9CA3AF] mt-1">Las respuestas rápidas se mostrarán primero (Meta exige agruparlas).</p>
                        )}
                    </div>
                    {error && (
                        <div role="alert" className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">{error}</div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E8E8EC]">
                    <Button variant="outline" onClick={onClose} className="rounded-xl border-[#E8E8EC]">Cancelar</Button>
                    <Button
                        onClick={handleCreate}
                        disabled={loading || uploading || !name.trim() || !content.trim() || (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat) && !headerUrl)}
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

    // Live status: n8n reports creation results and Meta approvals
    const supabase = useSupabaseClient();
    const tenantId = useTenantId();
    useEffect(() => {
        const channel = supabase
            .channel('message-templates')
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'message_templates', filter: `tenant_id=eq.${tenantId}`,
            }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    const id = (payload.old as { id?: string })?.id;
                    setTemplates((prev) => prev.filter((t) => t.id !== id));
                    return;
                }
                const row = payload.new as MessageTemplate;
                setTemplates((prev) => {
                    const before = prev.find((t) => t.id === row.id);
                    if (before && before.status !== row.status) {
                        if (row.status === 'APPROVED') toast.success(`Plantilla "${row.name}" aprobada`);
                        if (row.status === 'REJECTED') toast.error(`Plantilla "${row.name}" rechazada${row.rejection_reason ? `: ${row.rejection_reason}` : ''}`);
                    }
                    return before ? prev.map((t) => (t.id === row.id ? row : t)) : [row, ...prev];
                });
                setSelected((s) => (s?.id === row.id ? row : s));
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [supabase, tenantId]);

    useEffect(() => {
        fetch('/api/templates')
            .then((r) => {
                if (!r.ok) throw new Error('Error al cargar plantillas');
                return r.json();
            })
            .then((d) => setTemplates(d.templates ?? []))
            .catch(() => toast.error('Error al cargar las plantillas'))
            .finally(() => setLoading(false));
    }, []);

    async function handleSync() {
        setSyncing(true);
        setSyncMsg('');
        try {
            const res = await fetch('/api/templates/sync', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.requested) {
                // n8n syncs in the background and pushes the list to the CRM
                setSyncMsg('Sincronización solicitada a n8n. La lista se actualizará en unos segundos.');
                toast.success('Sincronización solicitada');
                setTimeout(async () => {
                    const refresh = await fetch('/api/templates').then((r) => r.json()).catch(() => null);
                    if (refresh?.templates) setTemplates(refresh.templates);
                }, 8000);
            } else if (res.ok) {
                setSyncMsg(`${data.synced} plantillas sincronizadas desde Meta.`);
                toast.success(`${data.synced} plantillas sincronizadas`);
                // Refresh list
                const refresh = await fetch('/api/templates').then((r) => r.json());
                setTemplates(refresh.templates ?? []);
            } else {
                const msg = data.error ?? 'Error al sincronizar.';
                setSyncMsg(msg);
                toast.error(msg);
            }
        } catch {
            toast.error('Error de conexión al sincronizar plantillas');
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
                                                <td className="px-5 py-3.5 text-[14px] font-medium text-[#1A1A2E]">
                                                    <span className="flex items-center gap-1.5">
                                                        {getTemplateHeader(t)?.format === 'IMAGE' && <ImageIcon size={13} className="text-[#818CF8]" />}
                                                        {getTemplateHeader(t)?.format === 'VIDEO' && <Video size={13} className="text-[#818CF8]" />}
                                                        {getTemplateHeader(t)?.format === 'DOCUMENT' && <FileText size={13} className="text-[#818CF8]" />}
                                                        {t.name}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-[13px] text-[#6B7280] uppercase">{t.language}</td>
                                                <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{t.category ?? '—'}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full ${badge.className}`}>
                                                        {badge.label}
                                                    </span>
                                                    {status === 'REJECTED' && t.rejection_reason && (
                                                        <p className="text-[11px] text-[#DC2626] mt-1 max-w-[220px] truncate" title={t.rejection_reason}>{t.rejection_reason}</p>
                                                    )}
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
                                {selected.status === 'REJECTED' && selected.rejection_reason && (
                                    <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                                        <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wider mb-0.5">Motivo del rechazo</p>
                                        <p className="text-[12px] text-red-700 break-words">{selected.rejection_reason}</p>
                                    </div>
                                )}
                                {selected.status === 'PENDING' && (
                                    <p className="text-[12px] text-[#D97706] bg-[#FFFBEB] rounded-lg px-3 py-2">
                                        En revisión por Meta. Puede tardar de minutos a horas; el estado se actualiza solo.
                                    </p>
                                )}
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
                                        <HeaderPreview header={getTemplateHeader(selected)} />
                                        <p className="text-[13px] text-[#1A1A2E] whitespace-pre-wrap leading-relaxed">{getTemplateContent(selected)}</p>
                                        {getTemplateFooter(selected) && (
                                            <p className="text-[11px] text-[#9CA3AF] mt-2">{getTemplateFooter(selected)}</p>
                                        )}
                                        <ButtonsPreview buttons={getTemplateButtons(selected)} />
                                    </div>
                                </div>
                                {getTemplateButtons(selected).some((b) => b.type === 'QUICK_REPLY') && (
                                    <ButtonActionsEditor
                                        key={selected.id}
                                        template={selected}
                                        onSaved={(t) => {
                                            setTemplates((prev) => prev.map((x) => (x.id === t.id ? t : x)));
                                            setSelected(t);
                                        }}
                                    />
                                )}
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
                    setTemplates((prev) => [t, ...prev.filter((x) => x.id !== t.id)]);
                    setShowNew(false);
                    setSelected(t);
                }}
            />
        </>
    );
}

type Opt = { id: string; name: string; color?: string | null };

/** What happens when a contact taps each quick-reply button of the template. */
function ButtonActionsEditor({ template, onSaved }: { template: MessageTemplate; onSaved: (t: MessageTemplate) => void }) {
    const quick = getTemplateButtons(template).filter((b) => b.type === 'QUICK_REPLY');
    const [actions, setActions] = useState<Record<string, ButtonAction>>(() => ({ ...(template.button_actions ?? {}) }));
    const [tags, setTags] = useState<Opt[]>([]);
    const [stages, setStages] = useState<Opt[]>([]);
    const [team, setTeam] = useState<Opt[]>([]);
    const [saving, setSaving] = useState(false);
    const [open, setOpen] = useState<string | null>(quick[0]?.text ?? null);

    useEffect(() => {
        const get = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        Promise.all([get('/api/settings/tags'), get('/api/funnel-stages'), get('/api/settings/team')]).then(([t, s, u]) => {
            setTags(t?.tags ?? []);
            setStages(Array.isArray(s) ? s : s?.stages ?? []);
            setTeam((u?.users ?? []).map((x: { id: string; full_name: string }) => ({ id: x.id, name: x.full_name })));
        });
    }, []);

    function set(label: string, patch: Partial<ButtonAction>) {
        setActions((prev) => ({ ...prev, [label]: { ...(prev[label] ?? {}), ...patch } }));
    }

    async function save() {
        setSaving(true);
        try {
            const res = await fetch(`/api/templates/${template.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ button_actions: actions }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || 'No se pudieron guardar las respuestas'); return; }
            toast.success('Respuestas de los botones guardadas');
            onSaved(d.template);
        } catch {
            toast.error('Error de conexión al guardar');
        } finally {
            setSaving(false);
        }
    }

    const sel = 'w-full px-2.5 py-1.5 text-[12px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:border-[#818CF8]';

    return (
        <div className="border-t border-[#F3F4F6] pt-4">
            <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1 flex items-center gap-1">
                <Zap size={11} className="text-amber-500" /> Respuestas a los botones
            </p>
            <p className="text-[11px] text-[#9CA3AF] mb-3">Cuando el cliente pulse un botón, el CRM hará esto automáticamente. Si envías una respuesta, la IA no contesta ese mensaje.</p>
            <div className="space-y-2">
                {quick.map((b) => {
                    const a = actions[b.text] ?? {};
                    const configured = !!(a.reply || a.tag_ids?.length || a.stage_id || a.ai || a.assign_to);
                    const isOpen = open === b.text;
                    return (
                        <div key={b.text} className="rounded-xl border border-[#E8E8EC] overflow-hidden">
                            <button onClick={() => setOpen(isOpen ? null : b.text)} className="w-full flex items-center gap-2 px-3 py-2 bg-[#FAFAFE] text-left">
                                <Reply size={12} className="text-[#0EA5E9]" />
                                <span className="text-[13px] font-medium text-[#1A1A2E] flex-1 truncate">{b.text}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${configured ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#F3F4F6] text-[#9CA3AF]'}`}>
                                    {configured ? 'Configurado' : 'Sin acción'}
                                </span>
                            </button>
                            {isOpen && (
                                <div className="p-3 space-y-2.5">
                                    <div>
                                        <label className="block text-[11px] font-medium text-[#6B7280] mb-1">Responder automáticamente</label>
                                        <textarea
                                            rows={3}
                                            value={a.reply ?? ''}
                                            onChange={(e) => set(b.text, { reply: e.target.value })}
                                            placeholder="Ej: ¡Genial! Un asesor te escribirá en unos minutos."
                                            className={`${sel} resize-none`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-[#6B7280] mb-1">Agregar etiquetas</label>
                                        <div className="flex flex-wrap gap-1">
                                            {tags.length === 0 && <span className="text-[11px] text-[#C4C4CE]">No hay etiquetas creadas.</span>}
                                            {tags.map((t) => {
                                                const on = a.tag_ids?.includes(t.id);
                                                return (
                                                    <button
                                                        key={t.id}
                                                        type="button"
                                                        onClick={() => set(b.text, { tag_ids: on ? (a.tag_ids ?? []).filter((x) => x !== t.id) : [...(a.tag_ids ?? []), t.id] })}
                                                        className={`text-[11px] px-2 py-0.5 rounded-full border ${on ? 'border-transparent text-white' : 'border-[#E8E8EC] text-[#6B7280]'}`}
                                                        style={on ? { backgroundColor: t.color ?? '#818CF8' } : undefined}
                                                    >
                                                        {t.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <div>
                                            <label className="block text-[11px] font-medium text-[#6B7280] mb-1">Mover a etapa</label>
                                            <select value={a.stage_id ?? ''} onChange={(e) => set(b.text, { stage_id: e.target.value || null })} className={sel}>
                                                <option value="">No cambiar</option>
                                                {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-medium text-[#6B7280] mb-1">IA en la conversación</label>
                                            <select value={a.ai ?? ''} onChange={(e) => set(b.text, { ai: (e.target.value || null) as ButtonAction['ai'] })} className={sel}>
                                                <option value="">No cambiar</option>
                                                <option value="on">Activar IA</option>
                                                <option value="off">Desactivar IA (pasa a un humano)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-medium text-[#6B7280] mb-1">Asignar a</label>
                                            <select value={a.assign_to ?? ''} onChange={(e) => set(b.text, { assign_to: e.target.value || null })} className={sel}>
                                                <option value="">No cambiar</option>
                                                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <button
                onClick={save}
                disabled={saving}
                className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#4F46E5] text-white text-[13px] font-semibold hover:bg-[#4338CA] disabled:opacity-50"
            >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar respuestas
            </button>
        </div>
    );
}
