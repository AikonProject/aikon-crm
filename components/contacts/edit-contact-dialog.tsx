'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const SOURCE_OPTIONS = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'web', label: 'Web' },
    { value: 'manual', label: 'Manual' },
    { value: 'csv', label: 'CSV' },
    { value: 'n8n', label: 'n8n' },
];

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contact: {
        id: string;
        nombre: string;
        email: string | null;
        wa_id: string | null;
        job_title?: string | null;
        source: string;
        funnel_stage_id: string | null;
        lead_score: number;
    };
    stages: { id: string; name: string; color: string | null }[];
    onSuccess: () => void;
};

export function EditContactDialog({ open, onOpenChange, contact, stages, onSuccess }: Props) {
    const [form, setForm] = useState({
        nombre: contact.nombre,
        email: contact.email ?? '',
        wa_id: contact.wa_id ?? '',
        job_title: contact.job_title ?? '',
        source: contact.source,
        funnel_stage_id: contact.funnel_stage_id ?? '',
        lead_score: String(contact.lead_score),
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleChange(field: keyof typeof form, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!form.nombre.trim()) {
            setError('El nombre es obligatorio.');
            return;
        }

        const scoreNum = parseInt(form.lead_score, 10);
        if (form.lead_score !== '' && (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100)) {
            setError('El score debe ser un número entre 0 y 100.');
            return;
        }

        // Build patch body with only changed fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: Record<string, any> = {};

        if (form.nombre.trim() !== contact.nombre) body.nombre = form.nombre.trim();
        const emailVal = form.email.trim() || null;
        if (emailVal !== contact.email) body.email = emailVal;
        const waIdVal = form.wa_id.trim() || null;
        if (waIdVal !== contact.wa_id) body.wa_id = waIdVal;
        const jobTitleVal = form.job_title.trim() || null;
        if (jobTitleVal !== (contact.job_title ?? null)) body.job_title = jobTitleVal;
        if (form.source !== contact.source) body.source = form.source;
        const stageVal = form.funnel_stage_id || null;
        if (stageVal !== contact.funnel_stage_id) body.funnel_stage_id = stageVal;
        const scoreVal = form.lead_score !== '' ? scoreNum : 0;
        if (scoreVal !== contact.lead_score) body.lead_score = scoreVal;

        setLoading(true);
        try {
            const res = await fetch(`/api/contacts/${contact.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error ?? 'Error al actualizar el contacto.');
            }

            onSuccess();
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado.');
        } finally {
            setLoading(false);
        }
    }

    const inputClass =
        'w-full px-3 py-2 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all disabled:opacity-60';
    const labelClass = 'block text-[13px] font-medium text-[#6B7280] mb-1';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg rounded-xl border-[#E8E8EC]">
                <DialogHeader>
                    <DialogTitle className="text-[18px] font-bold text-[#1A1A2E]">
                        Editar contacto
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-1">
                    {/* Nombre */}
                    <div>
                        <label className={labelClass}>
                            Nombre <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.nombre}
                            onChange={(e) => handleChange('nombre', e.target.value)}
                            placeholder="Nombre completo"
                            required
                            disabled={loading}
                            className={inputClass}
                        />
                    </div>

                    {/* Email + WhatsApp (2 cols) */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Email</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => handleChange('email', e.target.value)}
                                placeholder="correo@ejemplo.com"
                                disabled={loading}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>WhatsApp / Teléfono</label>
                            <input
                                type="text"
                                value={form.wa_id}
                                onChange={(e) => handleChange('wa_id', e.target.value)}
                                placeholder="+52 55 0000 0000"
                                disabled={loading}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    {/* Job title */}
                    <div>
                        <label className={labelClass}>Cargo / Empresa</label>
                        <input
                            type="text"
                            value={form.job_title}
                            onChange={(e) => handleChange('job_title', e.target.value)}
                            placeholder="Ej. Gerente de marketing"
                            disabled={loading}
                            className={inputClass}
                        />
                    </div>

                    {/* Source + Stage (2 cols) */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Fuente</label>
                            <select
                                value={form.source}
                                onChange={(e) => handleChange('source', e.target.value)}
                                disabled={loading}
                                className={inputClass + ' cursor-pointer'}
                            >
                                {SOURCE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Etapa del funnel</label>
                            <select
                                value={form.funnel_stage_id}
                                onChange={(e) => handleChange('funnel_stage_id', e.target.value)}
                                disabled={loading}
                                className={inputClass + ' cursor-pointer'}
                            >
                                <option value="">Sin etapa</option>
                                {stages.map((stage) => (
                                    <option key={stage.id} value={stage.id}>
                                        {stage.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Lead score */}
                    <div>
                        <label className={labelClass}>
                            Lead score <span className="text-[#9CA3AF] font-normal">(0–100)</span>
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={form.lead_score}
                            onChange={(e) => handleChange('lead_score', e.target.value)}
                            placeholder="0"
                            disabled={loading}
                            className={inputClass}
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-[13px] text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}

                    <DialogFooter className="pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                            className="rounded-[10px] border-[#E8E8EC] text-[#6B7280]"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
                        >
                            {loading ? 'Guardando...' : 'Guardar cambios'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
