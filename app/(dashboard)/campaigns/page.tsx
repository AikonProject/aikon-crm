'use client';

import { useEffect, useState } from 'react';
import { Plus, Send, CheckCircle, Eye, MessageSquare, MoreHorizontal, Copy, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import Link from 'next/link';
import type { Campaign } from '@/lib/types/database';

type CampaignWithCount = Campaign & { contact_count: number; template?: { name: string } | null };

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    draft: { label: 'Borrador', className: 'bg-[#F3F4F6] text-[#6B7280]' },
    scheduled: { label: 'Programada', className: 'bg-[#EFF6FF] text-[#3B82F6]' },
    running: { label: 'Enviando', className: 'bg-[#EEF0FF] text-[#4F46E5]' },
    completed: { label: 'Completada', className: 'bg-[#ECFDF5] text-[#059669]' },
    cancelled: { label: 'Cancelada', className: 'bg-[#FEF2F2] text-[#DC2626]' },
    paused: { label: 'Pausada', className: 'bg-[#FFFBEB] text-[#D97706]' },
};

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pct(num: number, denom: number): string {
    if (!denom) return '—';
    return `${Math.round((num / denom) * 100)}%`;
}

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<CampaignWithCount[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/campaigns')
            .then((r) => r.json())
            .then((d) => setCampaigns(d.campaigns ?? []))
            .finally(() => setLoading(false));
    }, []);

    const totalSent = campaigns.reduce((s, c) => s + c.sent_count, 0);
    const totalDelivered = campaigns.reduce((s, c) => s + c.delivered_count, 0);
    const totalRead = campaigns.reduce((s, c) => s + c.read_count, 0);
    // "Responded" is not tracked yet — use a reasonable placeholder
    const totalResponded = 0;

    async function handleCancel(id: string) {
        await fetch(`/api/campaigns/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' }),
        });
        setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'cancelled' } : c)));
    }

    async function handleDuplicate(campaign: CampaignWithCount) {
        const res = await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `${campaign.name} (copia)`,
                description: campaign.description,
                template_id: campaign.template_id,
            }),
        });
        const data = await res.json();
        if (data.campaign) {
            setCampaigns((prev) => [{ ...data.campaign, contact_count: data.contact_count ?? 0 }, ...prev]);
        }
    }

    return (
        <>
            <Breadcrumb />
            <PageHeader title="Campañas" description="Gestiona tus campañas de mensajería masiva">
                <Link href="/campaigns/new">
                    <Button className="bg-[#818CF8] hover:bg-[#6366F1] text-white rounded-xl gap-2">
                        <Plus size={16} /> Nueva Campaña
                    </Button>
                </Link>
            </PageHeader>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total enviados', value: totalSent.toLocaleString(), icon: Send, color: '#818CF8', bg: '#EEF0FF' },
                    { label: 'Entregados', value: totalDelivered.toLocaleString(), icon: CheckCircle, color: '#059669', bg: '#ECFDF5' },
                    { label: 'Leídos', value: totalRead.toLocaleString(), icon: Eye, color: '#3B82F6', bg: '#EFF6FF' },
                    { label: 'Respondidos', value: totalResponded.toLocaleString(), icon: MessageSquare, color: '#D97706', bg: '#FFFBEB' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5 flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
                            <Icon size={20} style={{ color }} />
                        </div>
                        <div>
                            <p className="text-[22px] font-bold text-[#1A1A2E]">{value}</p>
                            <p className="text-[12px] text-[#9CA3AF]">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-[#9CA3AF] text-[14px]">Cargando campañas…</div>
                ) : campaigns.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="text-[#9CA3AF] text-[14px] mb-4">No hay campañas todavía.</p>
                        <Link href="/campaigns/new">
                            <Button className="bg-[#818CF8] hover:bg-[#6366F1] text-white rounded-xl gap-2">
                                <Plus size={16} /> Crear primera campaña
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[#E8E8EC]">
                                    {['Nombre', 'Plantilla', 'Contactos', 'Estado', 'Enviados / Entregados / Leídos', 'Programada', 'Creada', 'Acciones'].map((h) => (
                                        <th key={h} className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.map((campaign) => {
                                    const badge = STATUS_BADGE[campaign.status] ?? STATUS_BADGE.draft;
                                    return (
                                        <tr key={campaign.id} className="border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE] transition-colors">
                                            <td className="px-5 py-3.5">
                                                <p className="text-[14px] font-medium text-[#1A1A2E]">{campaign.name}</p>
                                                {campaign.description && (
                                                    <p className="text-[12px] text-[#9CA3AF] truncate max-w-[180px]">{campaign.description}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">
                                                {campaign.template?.name ?? '—'}
                                            </td>
                                            <td className="px-5 py-3.5 text-[14px] text-[#1A1A2E] font-medium">
                                                {campaign.contact_count.toLocaleString()}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full ${badge.className}`}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-1 text-[13px] text-[#6B7280]">
                                                    <span>{campaign.sent_count}</span>
                                                    <span className="text-[#D1D5DB]">/</span>
                                                    <span>{campaign.delivered_count}</span>
                                                    <span className="text-[#D1D5DB]">/</span>
                                                    <span className="font-medium text-[#1A1A2E]">{pct(campaign.read_count, campaign.sent_count)}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 text-[13px] text-[#6B7280] whitespace-nowrap">
                                                {formatDate(campaign.scheduled_at)}
                                            </td>
                                            <td className="px-5 py-3.5 text-[13px] text-[#6B7280] whitespace-nowrap">
                                                {formatDate(campaign.created_at)}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        title="Duplicar"
                                                        onClick={() => handleDuplicate(campaign)}
                                                        className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                                                    >
                                                        <Copy size={15} />
                                                    </button>
                                                    {campaign.status !== 'cancelled' && campaign.status !== 'completed' && (
                                                        <button
                                                            title="Cancelar"
                                                            onClick={() => handleCancel(campaign.id)}
                                                            className="p-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626] transition-colors"
                                                        >
                                                            <XCircle size={15} />
                                                        </button>
                                                    )}
                                                    <button
                                                        title="Más opciones"
                                                        className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                                                    >
                                                        <MoreHorizontal size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
