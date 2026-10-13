'use client';

import { useEffect, useState } from 'react';
import { HardDrive, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const OPTIONS = [
    { days: 30, label: '30 días' },
    { days: 90, label: '90 días (recomendado)' },
    { days: 180, label: '6 meses' },
    { days: 365, label: '1 año' },
    { days: 0, label: 'Conservar siempre' },
];

/** Free tier of Supabase Storage; shown as reference for the usage bar. */
const REFERENCE_BYTES = 1024 ** 3;

function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Settings → Archivos: space used by chat files and how long they are kept. */
export function MediaStorageSettings() {
    const [data, setData] = useState<{ bytes: number; files: number; retention_days: number } | null>(null);
    const [days, setDays] = useState(90);
    const [saving, setSaving] = useState(false);

    async function load() {
        const res = await fetch('/api/settings/media');
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(d.error || 'No se pudo leer el almacenamiento'); return; }
        setData(d);
        setDays(d.retention_days);
    }
    useEffect(() => { load(); }, []);

    async function save() {
        const tightening = data && days > 0 && (data.retention_days === 0 || days < data.retention_days);
        const purgeNow = tightening && window.confirm(
            `¿Borrar ahora los archivos de más de ${days} días? Las transcripciones y descripciones se conservan.`
        );
        setSaving(true);
        try {
            const res = await fetch('/api/settings/media', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ retention_days: days, purge_now: purgeNow }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || 'No se pudo guardar'); return; }
            toast.success(d.purged ? `Guardado · ${d.purged.files} archivos eliminados` : 'Guardado');
            load();
        } catch {
            toast.error('Error de conexión');
        } finally {
            setSaving(false);
        }
    }

    if (!data) return <div className="p-8 text-center text-[#9CA3AF] text-[14px]">Cargando…</div>;
    const pct = Math.min(100, (data.bytes / REFERENCE_BYTES) * 100);

    return (
        <div className="crm-card p-6 max-w-2xl space-y-6">
            <div>
                <h3 className="text-[15px] font-semibold text-[#1A1A2E] flex items-center gap-2">
                    <HardDrive size={16} className="text-[#818CF8]" /> Archivos del chat
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-1">
                    Fotos, audios, videos y documentos que envían tus clientes por WhatsApp y los que envía tu equipo.
                </p>
            </div>

            <div>
                <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-[22px] font-semibold text-[#1A1A2E]">{formatBytes(data.bytes)}</span>
                    <span className="text-[12px] text-[#9CA3AF]">{data.files} archivos · referencia 1 GB</span>
                </div>
                <div className="h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                    <div
                        className={`h-full rounded-full ${pct > 80 ? 'bg-[#EF4444]' : pct > 50 ? 'bg-[#F59E0B]' : 'bg-[#818CF8]'}`}
                        style={{ width: `${Math.max(pct, data.bytes > 0 ? 1 : 0)}%` }}
                    />
                </div>
            </div>

            <div>
                <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Conservar los archivos durante</label>
                <div className="flex flex-wrap gap-2">
                    {OPTIONS.map((o) => (
                        <button
                            key={o.days}
                            onClick={() => setDays(o.days)}
                            className={`px-3 py-1.5 rounded-lg text-[13px] border transition-colors ${days === o.days
                                ? 'border-[#818CF8] bg-[#EEF0FF] text-[#4F46E5] font-medium'
                                : 'border-[#E8E8EC] text-[#6B7280] hover:border-[#C7D2FE]'}`}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
                <p className="text-[12px] text-[#9CA3AF] mt-2 leading-snug">
                    Cada noche se borran los archivos más antiguos. En el chat queda el mensaje con su transcripción o descripción
                    y la nota “Archivo eliminado por antigüedad”. Las imágenes de las plantillas no se borran.
                </p>
            </div>

            <Button
                onClick={save}
                disabled={saving || days === data.retention_days}
                className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
            >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
            </Button>
        </div>
    );
}
