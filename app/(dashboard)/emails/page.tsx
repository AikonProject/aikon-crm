'use client';

import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import { mockCampaigns, mockEmailEvents, mockDailyMetrics } from '@/lib/mock-data';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, FunnelChart } from 'recharts';
import { Mail, MousePointerClick, Reply, AlertTriangle, Send } from 'lucide-react';

function CampaignCard({ campaign }: { campaign: typeof mockCampaigns[0] }) {
    const events = mockEmailEvents.filter((e) => e.campaign_id === campaign.id);
    const sent = events.filter((e) => e.event_type === 'sent').length;
    const opened = events.filter((e) => e.event_type === 'opened').length;
    const replied = events.filter((e) => e.event_type === 'replied').length;
    const bounced = events.filter((e) => e.event_type === 'bounced').length;

    const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0';
    const replyRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : '0';

    const statusColors: Record<string, { text: string; bg: string }> = {
        active: { text: '#34D399', bg: '#ECFDF5' },
        paused: { text: '#FBBF24', bg: '#FFFBEB' },
        draft: { text: '#9CA3AF', bg: '#F3F4F6' },
        completed: { text: '#818CF8', bg: '#EEF0FF' },
    };

    const sc = statusColors[campaign.status] || statusColors.draft;

    return (
        <div className="crm-card p-6">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-1">
                        {campaign.name}
                    </h3>
                    <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: sc.bg, color: sc.text }}
                    >
                        {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                    </span>
                </div>
                <span className="text-[12px] text-[#9CA3AF]">
                    {campaign.sequence_steps} pasos · {campaign.total_leads} leads
                </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                    { label: 'Enviados', value: sent, icon: Send, color: '#818CF8' },
                    { label: 'Abiertos', value: `${openRate}%`, icon: Mail, color: '#34D399' },
                    { label: 'Respondidos', value: `${replyRate}%`, icon: Reply, color: '#F9A8D4' },
                    { label: 'Rebotes', value: bounced, icon: AlertTriangle, color: '#F87171' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="text-center">
                        <Icon size={16} className="mx-auto mb-1" style={{ color }} />
                        <p className="text-[18px] font-bold text-[#1A1A2E]">{value}</p>
                        <p className="text-[11px] text-[#9CA3AF]">{label}</p>
                    </div>
                ))}
            </div>

            {/* Progress bars */}
            <div className="space-y-2">
                {[
                    { label: 'Abiertos', pct: Number(openRate), color: '#34D399' },
                    { label: 'Respondidos', pct: Number(replyRate), color: '#818CF8' },
                ].map(({ label, pct, color }) => (
                    <div key={label}>
                        <div className="flex justify-between text-[11px] text-[#9CA3AF] mb-1">
                            <span>{label}</span>
                            <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function EmailsPage() {
    const totalSent = mockDailyMetrics.reduce((s, m) => s + m.emails_sent, 0);
    const totalOpened = mockDailyMetrics.reduce((s, m) => s + m.emails_opened, 0);
    const totalReplied = mockDailyMetrics.reduce((s, m) => s + m.emails_replied, 0);
    const totalBounced = mockDailyMetrics.reduce((s, m) => s + m.emails_bounced, 0);

    const funnelData = [
        { name: 'Enviados', value: totalSent, fill: '#818CF8' },
        { name: 'Abiertos', value: totalOpened, fill: '#34D399' },
        { name: 'Respondidos', value: totalReplied, fill: '#F9A8D4' },
    ];

    return (
        <>
            <Breadcrumb />
            <PageHeader
                title="Emails"
                description="Dashboard de campañas de cold email (Instantly)"
            />

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total enviados', value: totalSent.toLocaleString(), color: '#818CF8', bg: '#EEF0FF' },
                    { label: 'Total abiertos', value: totalOpened.toLocaleString(), color: '#34D399', bg: '#ECFDF5' },
                    { label: 'Total respondidos', value: totalReplied.toLocaleString(), color: '#F9A8D4', bg: '#FDF2F8' },
                    { label: 'Total rebotes', value: totalBounced.toLocaleString(), color: '#F87171', bg: '#FEF2F2' },
                ].map(({ label, value, color, bg }) => (
                    <div key={label} className="crm-card p-5 text-center">
                        <p className="text-[28px] font-bold text-[#1A1A2E]">{value}</p>
                        <p className="text-[12px] text-[#9CA3AF] mt-0.5">{label}</p>
                        <div className="w-8 h-1 rounded-full mx-auto mt-2" style={{ backgroundColor: color }} />
                    </div>
                ))}
            </div>

            {/* Funnel */}
            <div className="crm-card p-6 mb-6">
                <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-4">
                    Funnel de conversión
                </h3>
                <div className="flex items-end gap-6 justify-center h-[200px]">
                    {funnelData.map((item, idx) => {
                        const maxValue = funnelData[0].value || 1;
                        const height = Math.max((item.value / maxValue) * 180, 30);
                        return (
                            <div key={item.name} className="flex flex-col items-center gap-2">
                                <span className="text-[18px] font-bold text-[#1A1A2E]">
                                    {item.value.toLocaleString()}
                                </span>
                                <div
                                    className="w-24 rounded-t-xl transition-all duration-500"
                                    style={{
                                        height: `${height}px`,
                                        backgroundColor: item.fill,
                                        opacity: 1 - idx * 0.15,
                                    }}
                                />
                                <span className="text-[12px] text-[#6B7280] font-medium">
                                    {item.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Campaign Cards */}
            <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-3">
                Campañas activas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {mockCampaigns.map((campaign) => (
                    <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
            </div>
        </>
    );
}
