'use client';

import { useState } from 'react';
import { Bot, UserCheck } from 'lucide-react';

interface AiToggleButtonProps {
    contactId: string;
    initialAiActive: boolean;
}

export function AiToggleButton({ contactId, initialAiActive }: AiToggleButtonProps) {
    const [aiActive, setAiActive] = useState(initialAiActive);
    const [loading, setLoading] = useState(false);

    async function toggle() {
        if (loading) return;
        const next = !aiActive;
        setAiActive(next); // optimistic
        setLoading(true);

        try {
            const res = await fetch(`/api/contacts/${contactId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ai_active: next }),
            });
            if (!res.ok) {
                setAiActive(!next); // revert on error
            }
        } catch {
            setAiActive(!next);
        } finally {
            setLoading(false);
        }
    }

    if (aiActive) {
        return (
            <button
                onClick={toggle}
                disabled={loading}
                title="La IA está respondiendo. Haz clic para tomar control manual."
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[13px] font-medium border transition-all bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
                <Bot size={14} className="flex-shrink-0" />
                IA activa
            </button>
        );
    }

    return (
        <button
            onClick={toggle}
            disabled={loading}
            title="Tú tienes el control. Haz clic para devolver el control a la IA."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[13px] font-medium border transition-all bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 disabled:opacity-60"
        >
            <UserCheck size={14} className="flex-shrink-0" />
            Control manual
        </button>
    );
}
