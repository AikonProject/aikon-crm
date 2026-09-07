'use client';

import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from 'recharts';
import type { DailyMetrics } from '@/lib/types/database';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface LeadsChartProps {
    metrics: DailyMetrics[];
}

export function LeadsChart({ metrics }: LeadsChartProps) {
    const data = metrics.map((m) => ({
        date: format(new Date(m.date), 'dd MMM', { locale: es }),
        leads: m.new_leads,
        interested: m.leads_interested,
    }));

    return (
        <div className="crm-card p-6">
            <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-1">
                Leads por Día
            </h3>
            <p className="text-[12px] text-[#9CA3AF] mb-4">Últimos 30 días</p>
            <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#818CF8" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="intGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#34D399" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11, fill: '#9CA3AF' }}
                            axisLine={false}
                            tickLine={false}
                            interval={4}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: '#9CA3AF' }}
                            axisLine={false}
                            tickLine={false}
                            width={30}
                        />
                        <Tooltip
                            contentStyle={{
                                background: '#fff',
                                border: '1px solid #E8E8EC',
                                borderRadius: '12px',
                                fontSize: '13px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="leads"
                            stroke="#818CF8"
                            strokeWidth={2}
                            fill="url(#leadGradient)"
                            name="Nuevos leads"
                        />
                        <Area
                            type="monotone"
                            dataKey="interested"
                            stroke="#34D399"
                            strokeWidth={2}
                            fill="url(#intGradient)"
                            name="Interesados"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

interface EmailsChartProps {
    metrics: DailyMetrics[];
}

export function EmailsChart({ metrics }: EmailsChartProps) {
    // Aggregate last 7 days into weekly buckets
    const recent = metrics.slice(-14);
    const data = [];
    for (let i = 0; i < recent.length; i += 2) {
        const chunk = recent.slice(i, i + 2);
        data.push({
            period: format(new Date(chunk[0].date), 'dd MMM', { locale: es }),
            sent: chunk.reduce((s, m) => s + m.emails_sent, 0),
            opened: chunk.reduce((s, m) => s + m.emails_opened, 0),
            replied: chunk.reduce((s, m) => s + m.emails_replied, 0),
        });
    }

    return (
        <div className="crm-card p-6">
            <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-1">
                Rendimiento de Emails
            </h3>
            <p className="text-[12px] text-[#9CA3AF] mb-4">Últimas 2 semanas</p>
            <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                        <XAxis
                            dataKey="period"
                            tick={{ fontSize: 11, fill: '#9CA3AF' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: '#9CA3AF' }}
                            axisLine={false}
                            tickLine={false}
                            width={30}
                        />
                        <Tooltip
                            contentStyle={{
                                background: '#fff',
                                border: '1px solid #E8E8EC',
                                borderRadius: '12px',
                                fontSize: '13px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            }}
                        />
                        <Bar dataKey="sent" fill="#818CF8" radius={[6, 6, 0, 0]} name="Enviados" />
                        <Bar dataKey="opened" fill="#34D399" radius={[6, 6, 0, 0]} name="Abiertos" />
                        <Bar dataKey="replied" fill="#F9A8D4" radius={[6, 6, 0, 0]} name="Respondidos" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
