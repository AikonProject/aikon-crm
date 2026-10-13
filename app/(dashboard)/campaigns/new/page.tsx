'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import type { MessageTemplate } from '@/lib/types/database';
import { EMPTY_FILTER, cleanFilter } from '@/lib/contact-filter';
import { RecipientPicker, estimateRecipients, type RecipientSelection } from '@/components/campaigns/recipient-picker';
import { CONTACT_FIELD_OPTIONS, type VariableMapping } from '@/lib/template-variables';

type Mapping = { type: 'text'; value: string } | { type: 'field'; field: string; fallback: string };

/** First guess from the variable name: {{nombre}} → first name, {{telefono}} → phone… */
function guessMapping(v: string): Mapping {
    const k = v.toLowerCase();
    if (/^(1|nombre|name|first_?name|primer_?nombre|cliente)$/.test(k)) return { type: 'field', field: 'first_name', fallback: 'cliente' };
    if (/nombre_?completo|full_?name/.test(k)) return { type: 'field', field: 'nombre', fallback: 'cliente' };
    if (/tel|phone|celular|whatsapp/.test(k)) return { type: 'field', field: 'wa_id', fallback: '' };
    if (/mail|correo/.test(k)) return { type: 'field', field: 'email', fallback: '' };
    return { type: 'text', value: '' };
}

const STEPS = [
    { id: 1, label: 'Información' },
    { id: 2, label: 'Variables' },
    { id: 3, label: 'Segmento' },
    { id: 4, label: 'Programar' },
    { id: 5, label: 'Confirmar' },
];


export default function NewCampaignPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);

    // Step 1
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(true);

    // Step 2: each {{variable}} → fixed text or a contact field (resolved per recipient)
    const [mappings, setMappings] = useState<Record<string, Mapping>>({});
    const [customFields, setCustomFields] = useState<{ field_key: string; label: string }[]>([]);

    // Step 3
    const [selection, setSelection] = useState<RecipientSelection>({
        useFilter: true, filter: EMPTY_FILTER, include: new Map(), exclude: new Map(),
    });
    const [filterWithPhone, setFilterWithPhone] = useState<number | null>(null);
    const recipientCount = estimateRecipients(selection, filterWithPhone);

    // Step 4
    const [scheduleType, setScheduleType] = useState<'now' | 'later'>('now');
    const [scheduledAt, setScheduledAt] = useState('');

    useEffect(() => {
        fetch('/api/templates')
            .then((r) => r.json())
            // Meta only sends approved templates
            .then((d) => setTemplates((d.templates ?? []).filter((t: MessageTemplate) => t.status === 'APPROVED')))
            .finally(() => setLoadingTemplates(false));
        fetch('/api/settings/custom-fields').then((r) => r.json()).then((d) => setCustomFields(d.fields ?? [])).catch(() => {});
    }, []);

    // Extract body text from components JSONB
    const templateBody = selectedTemplate
        ? ((selectedTemplate.components as Array<{ type: string; text?: string }> | null)
            ?.find((c) => c.type === 'BODY')?.text ?? '')
        : '';
    // Extract variables like {{1}}, {{2}} from body text
    const templateVariables = [...new Set(templateBody.match(/\{\{\s*\w+\s*\}\}/g)?.map((v) => v.replace(/[{}\s]/g, '')) ?? [])];
    const templateVarsKey = templateVariables.join('|');

    // New template → suggested mapping for its variables
    useEffect(() => {
        const vars = templateVarsKey ? templateVarsKey.split('|') : [];
        setMappings((prev) => Object.fromEntries(vars.map((v) => [v, prev[v] ?? guessMapping(v)])));
    }, [templateVarsKey]);

    const fieldOptions = [
        ...CONTACT_FIELD_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })),
        ...customFields.map((f) => ({ value: `custom:${f.field_key}`, label: f.label })),
    ];
    const fieldLabel = (field: string) => fieldOptions.find((o) => o.value === field)?.label ?? field;

    function setMapping(v: string, m: Mapping) {
        setMappings((prev) => ({ ...prev, [v]: m }));
    }

    function canProceed(): boolean {
        if (step === 1) return !!name.trim() && !!selectedTemplate;
        if (step === 2) {
            return templateVariables.every((v) => {
                const m = mappings[v];
                return m && (m.type === 'field' ? !!m.field : m.value.trim() !== '');
            });
        }
        if (step === 3) return recipientCount > 0;
        if (step === 4) return scheduleType === 'now' || !!scheduledAt;
        return true;
    }

    function renderPreview(): string {
        if (!selectedTemplate) return '';
        let content = templateBody;
        templateVariables.forEach((v) => {
            const m = mappings[v];
            const shown = !m ? `{{${v}}}` : m.type === 'text' ? (m.value || `{{${v}}}`) : `[${fieldLabel(m.field)}]`;
            content = content.replace(new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, 'g'), shown);
        });
        return content;
    }

    async function handleSubmit() {
        setSubmitting(true);
        try {
            const body = {
                name,
                description: description || undefined,
                template_id: selectedTemplate?.id,
                template_variables: Object.fromEntries(templateVariables.map((v) => [v, mappings[v] as VariableMapping])),
                scheduled_at: scheduleType === 'later' ? new Date(scheduledAt).toISOString() : undefined,
                filter: selection.useFilter ? cleanFilter(selection.filter) : null,
                manual_only: !selection.useFilter,
                include_ids: [...selection.include.keys()],
                exclude_ids: selection.useFilter ? [...selection.exclude.keys()] : [],
            };
            const res = await fetch('/api/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(d.error || 'Error al crear la campaña');
                return;
            }
            if (d.dispatch_error) {
                toast.warning(`Campaña guardada como borrador: ${d.dispatch_error}`);
            } else {
                toast.success(scheduleType === 'later' ? 'Campaña programada' : 'Campaña enviada a n8n');
            }
            router.push('/campaigns');
        } catch {
            toast.error('Error de conexión al crear la campaña');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <Breadcrumb />
            <div className="mb-6 flex items-center gap-3">
                <button onClick={() => router.push('/campaigns')} className="p-2 rounded-xl hover:bg-[#F3F4F6] text-[#6B7280] transition-colors">
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-[#1A1A2E]">Nueva Campaña</h1>
                    <p className="text-sm text-[#6B7280] mt-0.5">Configura y programa tu campaña de mensajes</p>
                </div>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
                {STEPS.map((s, i) => (
                    <div key={s.id} className="flex items-center">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0 transition-colors ${step > s.id
                                    ? 'bg-[#059669] text-white'
                                    : step === s.id
                                        ? 'bg-[#818CF8] text-white'
                                        : 'bg-[#F3F4F6] text-[#9CA3AF]'
                                }`}>
                                {step > s.id ? <Check size={14} /> : s.id}
                            </div>
                            <span className={`text-[13px] font-medium whitespace-nowrap ${step === s.id ? 'text-[#1A1A2E]' : 'text-[#9CA3AF]'}`}>
                                {s.label}
                            </span>
                        </div>
                        {i < STEPS.length - 1 && (
                            <div className={`h-px w-8 mx-2 flex-shrink-0 ${step > s.id ? 'bg-[#059669]' : 'bg-[#E8E8EC]'}`} />
                        )}
                    </div>
                ))}
            </div>

            <div className={`bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-8 ${step === 3 ? 'max-w-5xl' : 'max-w-2xl'}`}>
                {/* STEP 1 */}
                {step === 1 && (
                    <div className="space-y-5">
                        <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Información de la campaña</h2>
                        <div>
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                                Nombre de la campaña <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej. Promoción Día de la Madre"
                                className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                                Descripción (opcional)
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                placeholder="Describe el objetivo de esta campaña…"
                                className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] resize-none"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                                Plantilla de mensaje <span className="text-red-500">*</span>
                            </label>
                            {loadingTemplates ? (
                                <p className="text-[13px] text-[#9CA3AF]">Cargando plantillas…</p>
                            ) : templates.length === 0 ? (
                                <p className="text-[13px] text-[#9CA3AF]">No hay plantillas aprobadas por Meta. Revisa Plantillas y sincroniza.</p>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    {templates.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setSelectedTemplate(t)}
                                            className={`w-full text-left p-4 rounded-xl border transition-all ${selectedTemplate?.id === t.id
                                                    ? 'border-[#818CF8] bg-[#F3F4FF]'
                                                    : 'border-[#E8E8EC] hover:border-[#818CF8]/40 hover:bg-[#FAFAFE]'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-[14px] font-medium text-[#1A1A2E]">{t.name}</p>
                                                    <p className="text-[12px] text-[#9CA3AF] mt-0.5 line-clamp-2">
                                                        {(t.components as Array<{ type: string; text?: string }> | null)?.find(c => c.type === 'BODY')?.text ?? ''}
                                                    </p>
                                                </div>
                                                {t.category && (
                                                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280] flex-shrink-0">
                                                        {t.category}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* STEP 2 */}
                {step === 2 && (
                    <div className="space-y-5">
                        <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Configurar variables de plantilla</h2>
                        {templateVariables.length === 0 ? (
                            <div className="py-8 text-center text-[#9CA3AF] text-[14px]">
                                Esta plantilla no tiene variables. Puedes continuar.
                            </div>
                        ) : (
                            <>
                                <div className="bg-[#FAFAFE] border border-[#E8E8EC] rounded-xl p-4">
                                    <p className="text-[12px] font-medium text-[#6B7280] mb-1">Vista previa:</p>
                                    <p className="text-[14px] text-[#1A1A2E] whitespace-pre-wrap">{renderPreview()}</p>
                                </div>
                                <p className="text-[12px] text-[#6B7280]">
                                    Elige de dónde sale cada variable. Con un campo del contacto, cada persona recibe su propio dato
                                    (por ejemplo, su nombre). Si a alguien le falta ese dato, se usa el texto de respaldo.
                                </p>
                                {templateVariables.map((v) => {
                                    const m = mappings[v] ?? guessMapping(v);
                                    return (
                                        <div key={v} className="rounded-xl border border-[#E8E8EC] p-3 space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[13px] font-semibold text-[#1A1A2E]">{`{{${v}}}`}</span>
                                                <div className="flex rounded-lg bg-[#F3F4F6] p-0.5 text-[12px]">
                                                    {[
                                                        { t: 'field', label: 'Dato del contacto' },
                                                        { t: 'text', label: 'Texto fijo' },
                                                    ].map((o) => (
                                                        <button
                                                            key={o.t}
                                                            type="button"
                                                            onClick={() => setMapping(v, o.t === 'field' ? { type: 'field', field: 'first_name', fallback: '' } : { type: 'text', value: '' })}
                                                            className={`px-2.5 py-1 rounded-md ${m.type === o.t ? 'bg-white shadow-sm text-[#1A1A2E] font-medium' : 'text-[#6B7280]'}`}
                                                        >
                                                            {o.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            {m.type === 'field' ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    <select
                                                        value={m.field}
                                                        onChange={(e) => setMapping(v, { ...m, field: e.target.value })}
                                                        className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-lg"
                                                    >
                                                        <optgroup label="Contacto">
                                                            {CONTACT_FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </optgroup>
                                                        {customFields.length > 0 && (
                                                            <optgroup label="Campos personalizados">
                                                                {customFields.map((f) => <option key={f.field_key} value={`custom:${f.field_key}`}>{f.label}</option>)}
                                                            </optgroup>
                                                        )}
                                                    </select>
                                                    <input
                                                        value={m.fallback}
                                                        onChange={(e) => setMapping(v, { ...m, fallback: e.target.value })}
                                                        placeholder="Respaldo si falta, ej. cliente"
                                                        className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-lg"
                                                    />
                                                </div>
                                            ) : (
                                                <input
                                                    value={m.value}
                                                    onChange={(e) => setMapping(v, { type: 'text', value: e.target.value })}
                                                    placeholder={`Mismo texto para todos en {{${v}}}`}
                                                    className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-lg"
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                )}

                {/* STEP 3 */}
                {step === 3 && (
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Seleccionar contactos</h2>
                            <p className="text-[13px] text-[#6B7280] mt-0.5">
                                Usa un filtro (etiquetas, etapa, campos personalizados, actividad…) y ajusta a mano, o marca los contactos uno por uno.
                            </p>
                        </div>
                        <RecipientPicker value={selection} onChange={setSelection} onFilterPreview={setFilterWithPhone} />
                        <p className={`text-[13px] font-medium ${recipientCount > 0 ? 'text-[#059669]' : 'text-[#D97706]'}`}>
                            {recipientCount > 0
                                ? `≈ ${recipientCount} destinatario${recipientCount === 1 ? '' : 's'} con WhatsApp`
                                : 'Aún no hay destinatarios con WhatsApp. Ajusta el filtro o marca contactos.'}
                        </p>
                    </div>
                )}

                {/* STEP 4 */}
                {step === 4 && (
                    <div className="space-y-5">
                        <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Programar envío</h2>
                        <div className="flex gap-3">
                            {['now', 'later'].map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setScheduleType(t as 'now' | 'later')}
                                    className={`flex-1 py-3 rounded-xl border text-[14px] font-medium transition-all ${scheduleType === t
                                            ? 'border-[#818CF8] bg-[#F3F4FF] text-[#4F46E5]'
                                            : 'border-[#E8E8EC] text-[#6B7280] hover:border-[#818CF8]/40'
                                        }`}
                                >
                                    {t === 'now' ? 'Enviar ahora' : 'Programar fecha'}
                                </button>
                            ))}
                        </div>
                        {scheduleType === 'later' && (
                            <div>
                                <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                                    Fecha y hora de envío <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    value={scheduledAt}
                                    onChange={(e) => setScheduledAt(e.target.value)}
                                    className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 5 */}
                {step === 5 && (
                    <div className="space-y-5">
                        <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Resumen de la campaña</h2>
                        <div className="space-y-3">
                            {[
                                { label: 'Nombre', value: name },
                                { label: 'Descripción', value: description || '—' },
                                { label: 'Plantilla', value: selectedTemplate?.name ?? '—' },
                                { label: 'Destinatarios', value: `≈ ${recipientCount} con WhatsApp` },
                                {
                                    label: 'Selección',
                                    value: [
                                        selection.useFilter
                                            ? (cleanFilter(selection.filter).conditions.length === 0 ? 'Todos los contactos' : `Filtro: ${cleanFilter(selection.filter).conditions.length} condición(es)`)
                                            : 'Elegidos a mano',
                                        selection.include.size ? `+${selection.include.size} a mano` : '',
                                        selection.useFilter && selection.exclude.size ? `−${selection.exclude.size} quitados` : '',
                                    ].filter(Boolean).join(' · '),
                                },
                                {
                                    label: 'Variables',
                                    value: templateVariables.length === 0 ? '—' : templateVariables.map((v) => {
                                        const m = mappings[v];
                                        return `{{${v}}} = ${!m ? '—' : m.type === 'text' ? `"${m.value}"` : fieldLabel(m.field)}`;
                                    }).join(' · '),
                                },
                                { label: 'Envío', value: scheduleType === 'now' ? 'Inmediato' : scheduledAt ? new Date(scheduledAt).toLocaleString('es-CO') : '—' },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex items-start gap-4 py-3 border-b border-[#F3F4F6] last:border-0">
                                    <span className="text-[13px] text-[#9CA3AF] w-36 flex-shrink-0">{label}</span>
                                    <span className="text-[14px] font-medium text-[#1A1A2E]">{value}</span>
                                </div>
                            ))}
                        </div>
                        {selectedTemplate && (
                            <div className="bg-[#FAFAFE] border border-[#E8E8EC] rounded-xl p-4">
                                <p className="text-[12px] font-medium text-[#6B7280] mb-2">Mensaje que se enviará:</p>
                                <p className="text-[14px] text-[#1A1A2E] whitespace-pre-wrap">{renderPreview()}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#F3F4F6]">
                    <Button
                        variant="outline"
                        onClick={() => step > 1 ? setStep(step - 1) : router.push('/campaigns')}
                        className="gap-2 rounded-xl border-[#E8E8EC] text-[#6B7280]"
                    >
                        <ChevronLeft size={16} /> Atrás
                    </Button>
                    {step < 5 ? (
                        <Button
                            onClick={() => setStep(step + 1)}
                            disabled={!canProceed()}
                            className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white disabled:opacity-40"
                        >
                            Siguiente <ChevronRight size={16} />
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white"
                        >
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            Crear campaña
                        </Button>
                    )}
                </div>
            </div>
        </>
    );
}
