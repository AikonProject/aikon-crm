'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type ParsedRow = Record<string, string>;

const FIELD_OPTIONS = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'wa_id', label: 'Teléfono / WhatsApp' },
    { key: 'source', label: 'Fuente' },
    { key: '_skip', label: '— Ignorar —' },
] as const;

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = splitCSVLine(lines[0]);
    const rows = lines.slice(1).map(splitCSVLine);
    return { headers, rows };
}

function splitCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current.trim());
    return result;
}

function autoDetectMapping(headers: string[]): Record<number, string> {
    const mapping: Record<number, string> = {};
    const usedFields = new Set<string>();

    headers.forEach((h, i) => {
        const lower = h.toLowerCase().trim();
        let match: string | null = null;
        if (/^nombre|^name|^full.?name/i.test(lower)) match = 'nombre';
        else if (/^email|^correo|^e-?mail/i.test(lower)) match = 'email';
        else if (/^tel|^phone|^wa|^whatsapp|^celular|^móvil|^movil/i.test(lower)) match = 'wa_id';
        else if (/^source|^fuente|^origen/i.test(lower)) match = 'source';

        if (match && !usedFields.has(match)) {
            mapping[i] = match;
            usedFields.add(match);
        } else {
            mapping[i] = '_skip';
        }
    });

    return mapping;
}

export function ImportCSVDialog({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<Record<number, string>>({});
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const reset = useCallback(() => {
        setStep('upload');
        setHeaders([]);
        setRows([]);
        setMapping({});
        setResult(null);
        setImporting(false);
    }, []);

    function handleFile(file: File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const parsed = parseCSV(text);
            if (parsed.headers.length === 0) {
                toast.error('No se pudo leer el archivo CSV');
                return;
            }
            setHeaders(parsed.headers);
            setRows(parsed.rows);
            setMapping(autoDetectMapping(parsed.headers));
            setStep('preview');
        };
        reader.readAsText(file);
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }

    async function handleImport() {
        // Build rows from mapping
        const hasNombre = Object.values(mapping).includes('nombre');
        if (!hasNombre) {
            toast.error('Debes mapear al menos la columna "Nombre"');
            return;
        }

        setImporting(true);

        const importRows: ParsedRow[] = rows.map((row) => {
            const obj: ParsedRow = {};
            Object.entries(mapping).forEach(([colIdx, field]) => {
                if (field !== '_skip') {
                    obj[field] = row[parseInt(colIdx)] ?? '';
                }
            });
            return obj;
        });

        try {
            const res = await fetch('/api/contacts/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: importRows }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Error al importar');
                setImporting(false);
                return;
            }
            setResult(data);
            setStep('result');
            router.refresh();
        } catch {
            toast.error('Error de conexión');
        }
        setImporting(false);
    }

    if (!open) {
        return (
            <span onClick={() => { setOpen(true); reset(); }}>
                {children}
            </span>
        );
    }

    return (
        <>
            <span onClick={() => { setOpen(true); reset(); }}>
                {children}
            </span>

            {/* Backdrop */}
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
                <div
                    className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]">
                        <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Importar contactos desde CSV</h2>
                        <button onClick={() => setOpen(false)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {step === 'upload' && (
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleDrop}
                                onClick={() => fileRef.current?.click()}
                                className="border-2 border-dashed border-[#E8E8EC] rounded-2xl p-12 text-center cursor-pointer hover:border-[#818CF8] transition-colors"
                            >
                                <Upload size={40} className="mx-auto text-[#9CA3AF] mb-3" />
                                <p className="text-[14px] text-[#6B7280] mb-1">
                                    Arrastra un archivo CSV aquí o haz clic para seleccionar
                                </p>
                                <p className="text-[12px] text-[#9CA3AF]">
                                    Columnas esperadas: nombre, email, wa_id (teléfono), source
                                </p>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFile(file);
                                    }}
                                />
                            </div>
                        )}

                        {step === 'preview' && (
                            <div className="space-y-5">
                                <div className="flex items-center gap-2 text-[13px] text-[#6B7280]">
                                    <FileText size={15} />
                                    {rows.length} filas encontradas
                                </div>

                                {/* Column mapping */}
                                <div>
                                    <p className="text-[13px] font-semibold text-[#1A1A2E] mb-3">Mapeo de columnas</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {headers.map((h, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="text-[12px] text-[#9CA3AF] w-28 truncate" title={h}>{h}</span>
                                                <span className="text-[12px] text-[#9CA3AF]">→</span>
                                                <select
                                                    value={mapping[i] ?? '_skip'}
                                                    onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))}
                                                    className="flex-1 text-[12px] px-2 py-1.5 border border-[#E8E8EC] rounded-lg bg-white"
                                                >
                                                    {FIELD_OPTIONS.map((opt) => (
                                                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Preview table */}
                                <div>
                                    <p className="text-[13px] font-semibold text-[#1A1A2E] mb-2">Vista previa (primeras 5 filas)</p>
                                    <div className="overflow-x-auto rounded-xl border border-[#E8E8EC]">
                                        <table className="w-full text-[12px]">
                                            <thead>
                                                <tr className="bg-[#F9FAFB]">
                                                    {headers.map((h, i) => (
                                                        <th key={i} className="px-3 py-2 text-left text-[#6B7280] font-medium whitespace-nowrap">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.slice(0, 5).map((row, ri) => (
                                                    <tr key={ri} className="border-t border-[#E8E8EC]">
                                                        {headers.map((_, ci) => (
                                                            <td key={ci} className="px-3 py-2 text-[#1A1A2E] whitespace-nowrap">{row[ci] ?? ''}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 'result' && result && (
                            <div className="text-center py-8 space-y-4">
                                <CheckCircle2 size={48} className="mx-auto text-[#059669]" />
                                <div>
                                    <p className="text-[16px] font-semibold text-[#1A1A2E]">Importación completada</p>
                                    <div className="mt-3 space-y-1 text-[13px]">
                                        <p className="text-[#059669]">{result.created} contactos creados</p>
                                        {result.skipped > 0 && (
                                            <p className="text-[#9CA3AF]">{result.skipped} duplicados omitidos</p>
                                        )}
                                    </div>
                                </div>
                                {result.errors.length > 0 && (
                                    <div className="mt-4 text-left bg-red-50 rounded-xl p-3">
                                        <div className="flex items-center gap-1.5 text-[12px] text-red-600 font-medium mb-1">
                                            <AlertCircle size={13} /> Errores
                                        </div>
                                        {result.errors.slice(0, 5).map((err, i) => (
                                            <p key={i} className="text-[11px] text-red-500">{err}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-[#E8E8EC] flex justify-end gap-2">
                        {step === 'preview' && (
                            <>
                                <Button variant="outline" onClick={() => setStep('upload')} className="rounded-xl border-[#E8E8EC] text-[#6B7280]">
                                    Atrás
                                </Button>
                                <Button
                                    onClick={handleImport}
                                    disabled={importing}
                                    className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white"
                                >
                                    {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                    Importar {rows.length} contactos
                                </Button>
                            </>
                        )}
                        {step === 'result' && (
                            <Button onClick={() => setOpen(false)} className="rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white">
                                Cerrar
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
