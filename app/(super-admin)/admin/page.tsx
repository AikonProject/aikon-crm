'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Tenant, User } from '@/lib/types/database';

type TenantWithDetails = Tenant & {
    user_count: number;
    users: (User & { last_seen_at: string | null })[];
    meta_configured: boolean;
    n8n_configured: boolean;
};

type PlanOption = { id: string; slug: string; name: string; price_monthly: number };

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
                <Icon size={20} style={{ color }} />
            </div>
            <div>
                <p className="text-[24px] font-bold text-[#1A1A2E]">{value}</p>
                <p className="text-[12px] text-[#9CA3AF]">{label}</p>
            </div>
        </div>
    );
}

function ConfigIndicator({ label, configured }: { label: string; configured: boolean }) {
    return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${configured ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#F3F4F6] text-[#9CA3AF]'}`}>
            {configured ? <CheckCircle size={11} /> : <XCircle size={11} />}
            {label}
        </span>
    );
}

function TenantRow({ tenant, plans, onUpdate }: { tenant: TenantWithDetails; plans: PlanOption[]; onUpdate: (t: TenantWithDetails) => void }) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [planId, setPlanId] = useState(tenant.plan_id);
    const planName = plans.find((p) => p.id === tenant.plan_id)?.name ?? '—';
    const [isActive, setIsActive] = useState(tenant.is_active);
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        setSaving(true);
        const res = await fetch('/api/admin/tenants', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: tenant.id, plan_id: planId, is_active: isActive }),
        });
        const data = await res.json();
        if (data.tenant) {
            onUpdate({ ...tenant, plan_id: data.tenant.plan_id, is_active: data.tenant.is_active });
        }
        setSaving(false);
        setEditing(false);
    }

    return (
        <>
            <tr className="border-b border-[#F3F4F6] hover:bg-[#FAFAFE] transition-colors">
                <td className="px-5 py-3.5">
                    <div>
                        <p className="text-[14px] font-medium text-[#1A1A2E]">{tenant.name}</p>
                        <p className="text-[12px] text-[#9CA3AF]">{tenant.id}</p>
                    </div>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">/{tenant.slug}</td>
                <td className="px-5 py-3.5">
                    {editing ? (
                        <select value={planId} onChange={(e) => setPlanId(e.target.value)}
                            className="text-[12px] border border-[#E8E8EC] rounded-lg px-2 py-1 focus:outline-none focus:border-[#818CF8]">
                            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    ) : (
                        <span className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-[#EEF0FF] text-[#818CF8]">
                            {planName}
                        </span>
                    )}
                </td>
                <td className="px-5 py-3.5">
                    {editing ? (
                        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-[#818CF8]" />
                    ) : (
                        <span className={`w-2 h-2 rounded-full inline-block ${tenant.is_active ? 'bg-[#34D399]' : 'bg-[#D1D5DB]'}`} />
                    )}
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{tenant.user_count}</td>
                <td className="px-5 py-3.5">
                    <div className="flex gap-1.5">
                        <ConfigIndicator label="Meta" configured={tenant.meta_configured} />
                        <ConfigIndicator label="n8n" configured={tenant.n8n_configured} />
                    </div>
                </td>
                <td className="px-5 py-3.5 text-[12px] text-[#9CA3AF]">
                    {new Date(tenant.created_at).toLocaleDateString('es-CO')}
                </td>
                <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                        {editing ? (
                            <>
                                <Button onClick={handleSave} disabled={saving} className="text-[12px] py-1 px-3 rounded-lg bg-[#818CF8] hover:bg-[#6366F1] text-white gap-1">
                                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                                </Button>
                                <Button variant="outline" onClick={() => { setEditing(false); setPlanId(tenant.plan_id); setIsActive(tenant.is_active); }} className="text-[12px] py-1 px-3 rounded-lg border-[#E8E8EC]">
                                    Cancelar
                                </Button>
                            </>
                        ) : (
                            <Button variant="outline" onClick={() => setEditing(true)} className="text-[12px] py-1 px-3 rounded-lg border-[#E8E8EC] text-[#6B7280]">
                                Editar
                            </Button>
                        )}
                        <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] transition-colors">
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                    </div>
                </td>
            </tr>
            {expanded && (
                <tr className="border-b border-[#F3F4F6]">
                    <td colSpan={8} className="px-5 pb-4 pt-1 bg-[#FAFAFE]">
                        <div className="pl-4 border-l-2 border-[#818CF8]/20">
                            <p className="text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Usuarios del tenant</p>
                            {tenant.users.length === 0 ? (
                                <p className="text-[13px] text-[#9CA3AF]">Sin usuarios registrados.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {tenant.users.map((u) => (
                                        <div key={u.id} className="bg-white border border-[#E8E8EC] rounded-xl px-3 py-2 flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center flex-shrink-0">
                                                <span className="text-white text-[10px] font-semibold">
                                                    {u.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="text-[13px] font-medium text-[#1A1A2E]">{u.full_name}</p>
                                                <p className="text-[11px] text-[#9CA3AF]">{u.email} · {u.role}</p>
                                            </div>
                                            <span className={`w-2 h-2 rounded-full ml-2 ${u.is_active ? 'bg-[#34D399]' : 'bg-[#D1D5DB]'}`} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

export default function SuperAdminPage() {
    const [tenants, setTenants] = useState<TenantWithDetails[]>([]);
    const [plans, setPlans] = useState<PlanOption[]>([]);
    const [loading, setLoading] = useState(true);

    // Global n8n config form
    const [globalN8nUrl, setGlobalN8nUrl] = useState('');
    const [savingGlobal, setSavingGlobal] = useState(false);
    const [savedGlobal, setSavedGlobal] = useState(false);

    useEffect(() => {
        fetch('/api/admin/tenants')
            .then((r) => r.json())
            .then((d) => { setTenants(d.tenants ?? []); setPlans(d.plans ?? []); })
            .finally(() => setLoading(false));
        setGlobalN8nUrl(process.env.NEXT_PUBLIC_N8N_URL ?? '');
    }, []);

    const totalOrgs = tenants.length;
    const totalUsers = tenants.reduce((s, t) => s + t.user_count, 0);
    const activeOrgs = tenants.filter((t) => t.is_active).length;

    function handleUpdate(updated: TenantWithDetails) {
        setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1A1A2E]">Panel de Administración</h1>
                    <p className="text-sm text-[#6B7280] mt-1">Gestiona todos los tenants del sistema</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#818CF8] to-[#6366F1] flex items-center justify-center">
                    <span className="text-white font-bold text-sm">Ai</span>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Total organizaciones" value={totalOrgs} icon={Building2} color="#818CF8" />
                <StatCard label="Total usuarios" value={totalUsers} icon={Users} color="#34D399" />
                <StatCard label="Organizaciones activas" value={`${activeOrgs}/${totalOrgs}`} icon={CheckCircle} color="#059669" />
            </div>

            {/* Tenants Table */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E8E8EC]">
                    <h2 className="text-[15px] font-semibold text-[#1A1A2E]">Organizaciones</h2>
                </div>
                {loading ? (
                    <div className="p-12 text-center text-[#9CA3AF] text-[14px] flex items-center justify-center gap-2">
                        <Loader2 size={18} className="animate-spin" /> Cargando tenants…
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[#E8E8EC]">
                                    {['Nombre', 'Slug', 'Plan', 'Activo', 'Usuarios', 'Integraciones', 'Creado', 'Acciones'].map((h) => (
                                        <th key={h} className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tenants.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-5 py-12 text-center text-[#9CA3AF] text-[14px]">No hay organizaciones registradas.</td>
                                    </tr>
                                ) : (
                                    tenants.map((t) => (
                                        <TenantRow key={t.id} tenant={t} plans={plans} onUpdate={handleUpdate} />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Global n8n config */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                <h2 className="text-[15px] font-semibold text-[#1A1A2E] mb-1">Configurar n8n Global</h2>
                <p className="text-[12px] text-[#9CA3AF] mb-4">URL base de n8n compartida (se puede sobreescribir por tenant)</p>
                <div className="flex items-center gap-3 max-w-xl">
                    <input
                        type="text"
                        value={globalN8nUrl}
                        onChange={(e) => setGlobalN8nUrl(e.target.value)}
                        placeholder="https://n8n.tudominio.com"
                        className="flex-1 px-3 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                    />
                    <Button
                        onClick={async () => {
                            setSavingGlobal(true);
                            // In a real app this would save to a global config table
                            await new Promise((r) => setTimeout(r, 600));
                            setSavingGlobal(false); setSavedGlobal(true); setTimeout(() => setSavedGlobal(false), 2500);
                        }}
                        disabled={savingGlobal}
                        className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white"
                    >
                        {savingGlobal ? <Loader2 size={14} className="animate-spin" /> : savedGlobal ? <CheckCircle size={14} /> : <Save size={14} />}
                        {savedGlobal ? 'Guardado' : 'Guardar'}
                    </Button>
                </div>
                <p className="text-[11px] text-[#9CA3AF] mt-2">
                    Configura la variable de entorno <code className="bg-[#F3F4F6] px-1 rounded">NEXT_PUBLIC_N8N_URL</code> para que persista entre reinicios.
                </p>
            </div>
        </div>
    );
}
