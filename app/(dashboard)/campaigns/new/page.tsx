'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import type { MessageTemplate, FunnelStage } from '@/lib/types/database';

const STEPS = [
    { id: 1, label: 'Información' },
    { id: 2, label: 'Variables' },
    { id: 3, label: 'Segmento' },
    { id: 4, label: 'Programar' },
    { id: 5, label: 'Confirmar' },
];

type SegmentFilters = {
    funnel_stage_id: string;
    source: string;
};

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

    // Step 2
    const [variableValues, setVariableValues] = useState<Record<string, string>>({});

    // Step 3
    const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
    const [segmentFilters, setSegmentFilters] = useState<SegmentFilters>({ funnel_stage_id: '', source: '' });
    const [previewCount, setPreviewCount] = useState<number | null>(null);
    const [countLoading, setCountLoading] = useState(false);

    // Step 4
    const [scheduleType, setScheduleType] = useState<'now' | 'later'>('now');
    const [scheduledAt, setScheduledAt] = useState('');

    useEffect(() => {
        fetch('/api/templates')
            .then((r) => r.json())
            // Meta only sends approved templates
            .then((d) => setTemplates((d.templates ?? []).filter((t: MessageTemplate) => t.status === 'APPROVED')))
            .finally(() => setLoadingTemplates(false));

        fetch('/api/funnel-stages')
            .then((r) => r.json())
            .then((d) => setFunnelStages(Array.isArray(d) ? d : (d.stages ?? [])))
            .catch(() => {/* funnel stages optional */});
    }, []);

    // Fetch preview count whenever segment filters change (step 3)
    useEffect(() => {
        if (step !== 3) return;
        const params = new URLSearchParams();
        if (segmentFilters.funnel_stage_id) params.set('funnel_stage_id', segmentFilters.funnel_stage_id);
        if (segmentFilters.source) params.set('source', segmentFilters.source);
        setCountLoading(true);
        fetch(`/api/contacts/count?${params.toString()}`)
            .then((r) => r.json())
            .then((d) => setPreviewCount(d.count ?? 0))
            .catch(() => setPreviewCount(null))
            .finally(() => setCountLoading(false));
    }, [step, segmentFilters]);

    // Extract body text from components JSONB
    const templateBody = selectedTemplate
        ? ((selectedTemplate.components as Array<{ type: string; text?: string }> | null)
            ?.find((c) => c.type === 'BODY')?.text ?? '')
        : '';
    // Extract variables like {{1}}, {{2}} from body text
    const templateVariables = templateBody.match(/\{\{(\d+)\}\}/g)?.map((v) => v.replace(/\{\{|\}\}/g, '')) ?? [];

    function canProceed(): boolean {
        if (step === 1) return !!name.trim() && !!selectedTemplate;
        if (step === 2) {
            return templateVariables.every((v) => (variableValues[v] ?? '').trim() !== '');
        }
        if (step === 4) return scheduleType === 'now' || !!scheduledAt;
        return true;
    }

    function renderPreview(): string {
        if (!selectedTemplate) return '';
        let content = templateBody;
        templateVariables.forEach((v) => {
            content = content.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), variableValues[v] ?? `{{${v}}}`);
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
                template_variables: variableValues,
                scheduled_at: scheduleType === 'later' ? new Date(scheduledAt).toISOString() : undefined,
                segment_filters: {
                    funnel_stage_id: segmentFilters.funnel_stage_id || undefined,
                    source: segmentFilters.source || undefined,
                },
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

            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-8 max-w-2xl">
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
                                {templateVariables.map((v) => (
                                    <div key={v}>
                                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                                            Variable {`{{${v}}}`} <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={variableValues[v] ?? ''}
                                            onChange={(e) => setVariableValues((prev) => ({ ...prev, [v]: e.target.value }))}
                                            placeholder={`Valor para {{${v}}}`}
                                            className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                                        />
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* STEP 3 */}
                {step === 3 && (
                    <div className="space-y-5">
                        <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Seleccionar segmento</h2>
                        <p className="text-[13px] text-[#6B7280]">Filtra los contactos que recibirán esta campaña.</p>

                        <div>
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                                Etapa del funnel (opcional)
                            </label>
                            <select
                                value={segmentFilters.funnel_stage_id}
                                onChange={(e) => setSegmentFilters((p) => ({ ...p, funnel_stage_id: e.target.value }))}
                                className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                            >
                                <option value="">Todas las etapas</option>
                                {funnelStages.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                                Fuente del contacto (opcional)
                            </label>
                            <select
                                value={segmentFilters.source}
                                onChange={(e) => setSegmentFilters((p) => ({ ...p, source: e.target.value }))}
                                className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                            >
                                <option value="">Todas las fuentes</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="web">Web</option>
                                <option value="manual">Manual</option>
                                <option value="csv">CSV</option>
                                <option value="api">API</option>
                                <option value="referral">Referido</option>
                            </select>
                        </div>

                        <div className="bg-[#F3F4FF] border border-[#818CF8]/20 rounded-xl p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#818CF8] flex items-center justify-center flex-shrink-0">
                                <span className="text-white font-bold text-[14px]">
                                    {countLoading ? '…' : (previewCount ?? '?')}
                                </span>
                            </div>
                            <div>
                                <p className="text-[14px] font-semibold text-[#1A1A2E]">
                                    {countLoading ? 'Calculando…' : `${previewCount ?? 0} contactos`}
                                </p>
                                <p className="text-[12px] text-[#6B7280]">recibirán esta campaña</p>
                            </div>
                        </div>
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
                                { label: 'Contactos estimados', value: `${previewCount ?? 0}` },
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
