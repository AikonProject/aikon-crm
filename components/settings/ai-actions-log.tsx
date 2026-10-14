'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

type Action = {
    id: string;
    tool_name: string | null;
    status: string | null;
    summary: string | null;
    reasoning: string | null;
    created_at: string;
    contact: { id: string; nombre: string } | null;
};

const TOOL_LABELS: Record<string, string> = {
    update_contact: 'Contacto', tags: 'Etiquetas', stage: 'Etapa', fields: 'Campos', note: 'Nota',
    appointment: 'Cita', deal: 'Deal', order: 'Pedido', handoff: 'Transferencia',
};

/** Everything the AI agent changed in the CRM (and what it tried and failed). */
export function AiActionsLog() {
    const [actions, setActions] = useState<Action[] | null>(null);
    const [onlyFailed, setOnlyFailed] = useState(false);

    const [tick, setTick] = useState(0);
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/settings/ai/actions?limit=100${onlyFailed ? '&status=failed' : ''}`)
            .then((r) => r.json())
            .then((d) => { if (!cancelled) setActions(Array.isArray(d.actions) ? d.actions : []); })
            .catch(() => { if (!cancelled) setActions([]); });
        return () => { cancelled = true; };
    }, [onlyFailed, tick]);

    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E] flex items-center gap-2"><Bot size={16} className="text-[#7C3AED]" /> Acciones de la IA en el CRM</h3>
                    <p className="text-[12px] text-[#9CA3AF] mt-0.5">Etiquetas, etapas, campos, citas, deals, pedidos y transferencias que hizo el bot, con su motivo.</p>
                </div>
                <div className="flex items-center gap-3">
                    <label className="text-[12px] text-[#6B7280] flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} /> Solo errores
                    </label>
                    <button onClick={() => setTick((t) => t + 1)} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF]" title="Actualizar"><RefreshCw size={14} /></button>
                </div>
            </div>
            {actions === null ? (
                <p className="text-[13px] text-[#9CA3AF] py-6 text-center">Cargando…</p>
            ) : actions.length === 0 ? (
                <p className="text-[13px] text-[#9CA3AF] py-6 text-center">{onlyFailed ? 'Sin errores.' : 'La IA todavía no ha hecho cambios en el CRM.'}</p>
            ) : (
                <div className="divide-y divide-[#F3F4F6] max-h-[520px] overflow-y-auto">
                    {actions.map((a) => (
                        <div key={a.id} className="py-2.5 flex gap-3 text-[13px]">
                            {a.status === 'failed'
                                ? <XCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                                : <CheckCircle2 size={15} className="text-[#059669] flex-shrink-0 mt-0.5" />}
                            <div className="min-w-0 flex-1">
                                <p className="text-[#1A1A2E]">
                                    <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#F5F3FF] text-[#7C3AED] mr-1.5">
                                        {TOOL_LABELS[a.tool_name ?? ''] ?? a.tool_name}
                                    </span>
                                    {a.summary}
                                </p>
                                {a.reasoning && <p className="text-[12px] text-[#9CA3AF] mt-0.5">Motivo: {a.reasoning}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                                {a.contact && <Link href={`/contacts/${a.contact.id}`} className="text-[12px] text-[#4F46E5] hover:underline block">{a.contact.nombre}</Link>}
                                <span className="text-[11px] text-[#9CA3AF]">{new Date(a.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
