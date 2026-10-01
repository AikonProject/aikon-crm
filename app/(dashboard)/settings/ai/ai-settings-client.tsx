'use client';

import { useEffect, useState } from 'react';
import { Save, Loader2, Check, Plus, Trash2, Bot, Brain, Wrench, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';

type AiConfig = {
    system_prompt?: string;
    temperature?: number;
    response_length?: 'short' | 'medium' | 'long';
    tools?: {
        search_contacts?: boolean;
        create_reservations?: boolean;
        answer_faqs?: boolean;
        send_templates?: boolean;
    };
    knowledge_base?: Array<{ title: string; content: string }>;
};

function SectionCard({ title, subtitle, icon: Icon, children }: {
    title: string; subtitle: string; icon: React.ElementType; children: React.ReactNode;
}) {
    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E8EC] flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F3F4FF] flex items-center justify-center">
                    <Icon size={16} className="text-[#818CF8]" />
                </div>
                <div>
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E]">{title}</h3>
                    <p className="text-[12px] text-[#9CA3AF] mt-0.5">{subtitle}</p>
                </div>
            </div>
            <div className="p-6 space-y-4">{children}</div>
        </div>
    );
}

export default function AiSettingsClient() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Config state
    const [systemPrompt, setSystemPrompt] = useState('');
    const [temperature, setTemperature] = useState(0.7);
    const [responseLength, setResponseLength] = useState<'short' | 'medium' | 'long'>('medium');
    const [tools, setTools] = useState({
        search_contacts: true,
        create_reservations: true,
        answer_faqs: true,
        send_templates: true,
    });
    const [knowledgeBase, setKnowledgeBase] = useState<Array<{ title: string; content: string }>>([]);
    const [newKbTitle, setNewKbTitle] = useState('');
    const [newKbContent, setNewKbContent] = useState('');

    useEffect(() => {
        fetch('/api/settings/ai')
            .then((r) => r.json())
            .then((d) => {
                const c: AiConfig = d.config ?? {};
                setSystemPrompt(c.system_prompt ?? '');
                setTemperature(c.temperature ?? 0.7);
                setResponseLength(c.response_length ?? 'medium');
                setTools({
                    search_contacts: c.tools?.search_contacts ?? true,
                    create_reservations: c.tools?.create_reservations ?? true,
                    answer_faqs: c.tools?.answer_faqs ?? true,
                    send_templates: c.tools?.send_templates ?? true,
                });
                setKnowledgeBase(c.knowledge_base ?? []);
            })
            .finally(() => setLoading(false));
    }, []);

    async function handleSave() {
        setSaving(true);
        try {
            const res = await fetch('/api/settings/ai', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: {
                        system_prompt: systemPrompt,
                        temperature,
                        response_length: responseLength,
                        tools,
                        knowledge_base: knowledgeBase,
                    },
                }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Error al guardar configuración de IA'); setSaving(false); return; }
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch { toast.error('Error de conexión al guardar configuración de IA'); }
        setSaving(false);
    }

    function addKbEntry() {
        if (!newKbTitle.trim()) return;
        setKnowledgeBase((prev) => [...prev, { title: newKbTitle.trim(), content: newKbContent.trim() }]);
        setNewKbTitle('');
        setNewKbContent('');
    }

    function removeKbEntry(index: number) {
        setKnowledgeBase((prev) => prev.filter((_, i) => i !== index));
    }

    if (loading) {
        return (
            <>
                <Breadcrumb />
                <PageHeader title="IA / Bot" description="Configura el comportamiento de tu asistente de IA" />
                <div className="p-8 text-center text-[#9CA3AF] text-[14px]">Cargando configuración…</div>
            </>
        );
    }

    return (
        <>
            <Breadcrumb />
            <PageHeader title="IA / Bot" description="Configura el comportamiento de tu asistente de IA" />

            <div className="max-w-2xl space-y-6">
                {/* System Prompt */}
                <SectionCard title="Prompt del sistema" subtitle="Define cómo se comporta tu asistente de IA" icon={Brain}>
                    <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={8}
                        placeholder="Eres un asistente amable que ayuda a los clientes con sus consultas..."
                        className="w-full px-3 py-2.5 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] resize-none"
                    />
                    <p className="text-[11px] text-[#9CA3AF]">
                        Este prompt define la personalidad y comportamiento base de tu bot de IA.
                    </p>
                </SectionCard>

                {/* Tools / Capabilities */}
                <SectionCard title="Herramientas" subtitle="Elige qué puede hacer tu bot de IA" icon={Wrench}>
                    {[
                        { key: 'search_contacts' as const, label: 'Buscar contactos', desc: 'Buscar información de contactos existentes' },
                        { key: 'create_reservations' as const, label: 'Crear reservas', desc: 'Crear y gestionar reservas de clientes' },
                        { key: 'answer_faqs' as const, label: 'Responder preguntas frecuentes', desc: 'Usar la base de conocimiento para responder' },
                        { key: 'send_templates' as const, label: 'Enviar plantillas', desc: 'Enviar mensajes predefinidos de WhatsApp' },
                    ].map((tool) => (
                        <div key={tool.key} className="flex items-center justify-between py-2">
                            <div>
                                <p className="text-[13px] font-medium text-[#1A1A2E]">{tool.label}</p>
                                <p className="text-[11px] text-[#9CA3AF]">{tool.desc}</p>
                            </div>
                            <button
                                onClick={() => setTools((t) => ({ ...t, [tool.key]: !t[tool.key] }))}
                                className={`relative w-10 h-5 rounded-full transition-colors ${
                                    tools[tool.key] ? 'bg-[#818CF8]' : 'bg-[#D1D5DB]'
                                }`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                    tools[tool.key] ? 'translate-x-5' : 'translate-x-0.5'
                                }`} />
                            </button>
                        </div>
                    ))}
                </SectionCard>

                {/* Model Settings */}
                <SectionCard title="Modelo" subtitle="Ajusta los parámetros de generación" icon={Bot}>
                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                            Temperatura: {temperature.toFixed(1)}
                        </label>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.1}
                            value={temperature}
                            onChange={(e) => setTemperature(parseFloat(e.target.value))}
                            className="w-full accent-[#818CF8]"
                        />
                        <div className="flex justify-between text-[10px] text-[#9CA3AF] mt-1">
                            <span>Preciso (0)</span>
                            <span>Creativo (1)</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Longitud de respuesta</label>
                        <div className="flex gap-2">
                            {([
                                { value: 'short' as const, label: 'Corta' },
                                { value: 'medium' as const, label: 'Media' },
                                { value: 'long' as const, label: 'Larga' },
                            ]).map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setResponseLength(opt.value)}
                                    className={`flex-1 px-3 py-2 rounded-xl text-[13px] font-medium border transition-all ${
                                        responseLength === opt.value
                                            ? 'bg-[#818CF8] text-white border-[#818CF8]'
                                            : 'bg-white text-[#6B7280] border-[#E8E8EC] hover:bg-[#F9FAFB]'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </SectionCard>

                {/* Knowledge Base */}
                <SectionCard title="Base de conocimiento" subtitle="Agrega información que tu bot puede usar para responder" icon={BookOpen}>
                    {knowledgeBase.length > 0 && (
                        <div className="space-y-2">
                            {knowledgeBase.map((entry, i) => (
                                <div key={i} className="flex items-start gap-2 px-3 py-2.5 bg-[#F9FAFB] rounded-xl border border-[#E8E8EC]">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-[#1A1A2E]">{entry.title}</p>
                                        <p className="text-[11px] text-[#6B7280] mt-0.5 line-clamp-2">{entry.content}</p>
                                    </div>
                                    <button
                                        onClick={() => removeKbEntry(i)}
                                        className="text-[#9CA3AF] hover:text-red-500 flex-shrink-0 mt-0.5"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2 pt-2 border-t border-[#F3F4F6]">
                        <input
                            value={newKbTitle}
                            onChange={(e) => setNewKbTitle(e.target.value)}
                            placeholder="Título (ej: Horarios de atención)"
                            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20"
                        />
                        <textarea
                            value={newKbContent}
                            onChange={(e) => setNewKbContent(e.target.value)}
                            placeholder="Contenido (ej: Lunes a viernes de 9am a 6pm...)"
                            rows={3}
                            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 resize-none"
                        />
                        <Button
                            variant="outline"
                            onClick={addKbEntry}
                            disabled={!newKbTitle.trim()}
                            className="gap-2 rounded-xl border-[#E8E8EC] text-[#6B7280]"
                        >
                            <Plus size={14} />
                            Agregar entrada
                        </Button>
                    </div>
                </SectionCard>

                {/* Save */}
                <div className="flex justify-end pb-8">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white px-6"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
                        {saved ? 'Guardado' : 'Guardar configuración'}
                    </Button>
                </div>
            </div>
        </>
    );
}
