'use client';

import { PHASE_LABELS } from '@/lib/utils/constants';
import { PHASE_COLORS } from '@/lib/utils/colors';
import type { ContactPhase } from '@/lib/types/database';

interface PhaseBadgeProps {
    phase: ContactPhase | undefined;
    size?: 'sm' | 'md';
}

export function PhaseBadge({ phase = 'nuevo', size = 'md' }: PhaseBadgeProps) {
    const colors = PHASE_COLORS[phase];
    const label = PHASE_LABELS[phase];

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full font-medium ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'
                }`}
            style={{ backgroundColor: colors.bg, color: colors.text }}
        >
            <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: colors.dot }}
            />
            {label}
        </span>
    );
}
