'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Stage = { id: string; name: string; color: string | null };

/** Deletes a funnel stage, letting the user choose where its contacts go. */
export function DeleteStageDialog({
    stage,
    stages,
    onClose,
    onDeleted,
}: {
    stage: Stage | null;
    stages: Stage[];
    onClose: () => void;
    onDeleted: (id: string, moved: number) => void;
}) {
    const [count, setCount] = useState<{ id: string; n: number } | null>(null);
    const [moveTo, setMoveTo] = useState('');
    const [busy, setBusy] = useState(false);
    const others = stages.filter((s) => s.id !== stage?.id);

    useEffect(() => {
        if (!stage) return;
        let cancelled = false;
        fetch(`/api/funnel-stages/${stage.id}`)
            .then((r) => r.json())
            .then((d) => { if (!cancelled) setCount({ id: stage.id, n: d.contact_count ?? 0 }); })
            .catch(() => { if (!cancelled) setCount({ id: stage.id, n: 0 }); });
        return () => { cancelled = true; };
    }, [stage]);

    const n = count && count.id === stage?.id ? count.n : null;

    async function confirm() {
        if (!stage) return;
        setBusy(true);
        try {
            const qs = moveTo ? `?move_to=${encodeURIComponent(moveTo)}` : '';
            const res = await fetch(`/api/funnel-stages/${stage.id}${qs}`, { method: 'DELETE' });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || 'No se pudo eliminar la etapa'); return; }
            const target = others.find((s) => s.id === moveTo);
            toast.success(d.moved > 0
                ? `Etapa eliminada · ${d.moved} contacto${d.moved === 1 ? '' : 's'} ${target ? `movido${d.moved === 1 ? '' : 's'} a "${target.name}"` : 'quedaron sin etapa'}`
                : 'Etapa eliminada');
            setMoveTo('');
            onDeleted(stage.id, d.moved ?? 0);
        } catch {
            toast.error('Error de conexión');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={!!stage} onOpenChange={(o) => { if (!o && !busy) { setMoveTo(''); onClose(); } }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>¿Eliminar la etapa &quot;{stage?.name}&quot;?</DialogTitle>
                </DialogHeader>
                {n === null ? (
                    <p className="text-[13px] text-[#9CA3AF] flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Contando contactos…</p>
                ) : n === 0 ? (
                    <p className="text-[13px] text-[#6B7280]">No hay contactos en esta etapa.</p>
                ) : (
                    <div className="space-y-2">
                        <p className="text-[13px] text-[#374151]">
                            Tiene <span className="font-semibold">{n} contacto{n === 1 ? '' : 's'}</span>. ¿A dónde los pasamos?
                        </p>
                        <select
                            value={moveTo}
                            onChange={(e) => setMoveTo(e.target.value)}
                            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-lg"
                        >
                            <option value="">Dejarlos sin etapa</option>
                            {others.map((s) => <option key={s.id} value={s.id}>Mover a “{s.name}”</option>)}
                        </select>
                        <p className="text-[11px] text-[#9CA3AF]">Los contactos no se borran: conservan sus chats, notas y etiquetas.</p>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={() => { setMoveTo(''); onClose(); }} className="rounded-xl">Cancelar</Button>
                    <Button disabled={busy || n === null} onClick={confirm} className="rounded-xl bg-red-600 hover:bg-red-700 text-white gap-2">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Eliminar etapa
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
