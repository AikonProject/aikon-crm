'use client';

import { PHASE_LABELS, PHASE_ORDER } from '@/lib/utils/constants';
import { PHASE_COLORS } from '@/lib/utils/colors';
import type { Contact } from '@/lib/types/database';

interface PipelineSummaryProps {
    contacts: Contact[];
}

export function PipelineSummary({ contacts }: PipelineSummaryProps) {
    const phaseCounts = PHASE_ORDER.map((phase) => ({
        phase,
        label: PHASE_LABELS[phase],
        count: contacts.filter((c) => (c as Record<string, unknown>).phase === phase).length,
        colors: PHASE_COLORS[phase],
    }));

    const maxCount = Math.max(...phaseCounts.map((p) => p.count), 1);

    return (
        <div className="crm-card p-6">
            <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-4">
                Resumen del Pipeline
            </h3>
            <div className="space-y-3">
                {phaseCounts.map(({ phase, label, count, colors }) => (
                    <div key={phase} className="flex items-center gap-3">
                        <div className="w-[120px] flex-shrink-0">
                            <span className="text-[13px] text-[#6B7280]">{label}</span>
                        </div>
                        <div className="flex-1 h-7 bg-[#F3F4F6] rounded-lg overflow-hidden">
                            <div
                                className="h-full rounded-lg transition-all duration-500 flex items-center px-2"
                                style={{
                                    width: `${Math.max((count / maxCount) * 100, 8)}%`,
                                    backgroundColor: colors.bg,
                                    borderLeft: `3px solid ${colors.dot}`,
                                }}
                            >
                                <span
                                    className="text-[12px] font-semibold"
                                    style={{ color: colors.text }}
                                >
                                    {count}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
