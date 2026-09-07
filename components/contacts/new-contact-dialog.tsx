'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ContactSource } from '@/lib/types/database';

interface NewContactDialogProps {
    children: React.ReactNode;
}

const SOURCES: { value: ContactSource; label: string }[] = [
    { value: 'manual', label: 'Manual' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'web', label: 'Web' },
    { value: 'csv', label: 'CSV' },
    { value: 'n8n', label: 'Automatización' },
];

export function NewContactDialog({ children }: NewContactDialogProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
        nombre: '',
        email: '',
        wa_id: '',
        source: 'manual' as ContactSource,
    });

    function handleChange(field: keyof typeof form, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError(null);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.nombre.trim()) {
            setError('El nombre es requerido.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: form.nombre.trim(),
                    email: form.email.trim() || null,
                    wa_id: form.wa_id.trim() || null,
                    source: form.source,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error ?? 'Error al crear el contacto.');
            }

            // Reset and close
            setForm({ nombre: '', email: '', wa_id: '', source: 'manual' });
            setOpen(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="text-[18px] font-bold text-[#1A1A2E]">
                        Nuevo contacto
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-1">
                    {/* Nombre */}
                    <div>
                        <label className="block text-[13px] font-medium text-[#374151] mb-1.5">
                            Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="Ej. María García"
                            value={form.nombre}
                            onChange={(e) => handleChange('nombre', e.target.value)}
                            className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all placeholder:text-[#D1D5DB]"
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-[13px] font-medium text-[#374151] mb-1.5">
                            Email
                        </label>
                        <input
                            type="email"
                            placeholder="maria@ejemplo.com"
                            value={form.email}
                            onChange={(e) => handleChange('email', e.target.value)}
                            className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all placeholder:text-[#D1D5DB]"
                        />
                    </div>

                    {/* WhatsApp */}
                    <div>
                        <label className="block text-[13px] font-medium text-[#374151] mb-1.5">
                            Teléfono / WhatsApp
                        </label>
                        <input
                            type="tel"
                            placeholder="+57 300 123 4567"
                            value={form.wa_id}
                            onChange={(e) => handleChange('wa_id', e.target.value)}
                            className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all placeholder:text-[#D1D5DB]"
                        />
                    </div>

                    {/* Source */}
                    <div>
                        <label className="block text-[13px] font-medium text-[#374151] mb-1.5">
                            Fuente
                        </label>
                        <select
                            value={form.source}
                            onChange={(e) => handleChange('source', e.target.value as ContactSource)}
                            className="w-full px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all appearance-none cursor-pointer"
                        >
                            {SOURCES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-[13px] text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                            {error}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="px-4 py-2 text-[14px] font-medium text-[#6B7280] hover:text-[#374151] transition-colors"
                        >
                            Cancelar
                        </button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white px-5"
                        >
                            {loading ? 'Creando...' : 'Crear contacto'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
