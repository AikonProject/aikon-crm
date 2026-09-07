'use client';

import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
    title: string;
    value: string | number;
    change?: string;
    changeType?: 'positive' | 'negative' | 'neutral';
    icon: LucideIcon;
    iconColor: string;
    iconBg: string;
    subtitle?: string;
}

export function MetricCard({
    title,
    value,
    change,
    changeType = 'neutral',
    icon: Icon,
    iconColor,
    iconBg,
    subtitle,
}: MetricCardProps) {
    return (
        <div className="crm-card p-6 flex flex-col justify-between">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[13px] font-medium text-[#6B7280] mb-1">{title}</p>
                    <p className="text-[28px] font-bold text-[#1A1A2E] leading-tight">
                        {value}
                    </p>
                    {subtitle && (
                        <p className="text-[12px] text-[#9CA3AF] mt-1">{subtitle}</p>
                    )}
                </div>
                <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: iconBg }}
                >
                    <Icon size={22} style={{ color: iconColor }} />
                </div>
            </div>
            {change && (
                <div className="mt-3 flex items-center gap-1.5">
                    <span
                        className={`text-[13px] font-semibold ${changeType === 'positive'
                                ? 'text-[#34D399]'
                                : changeType === 'negative'
                                    ? 'text-[#F87171]'
                                    : 'text-[#9CA3AF]'
                            }`}
                    >
                        {changeType === 'positive' ? '↑' : changeType === 'negative' ? '↓' : ''}
                        {change}
                    </span>
                    <span className="text-[12px] text-[#9CA3AF]">vs. mes anterior</span>
                </div>
            )}
        </div>
    );
}
