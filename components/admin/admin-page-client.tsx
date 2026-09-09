'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Building2, Users, ChevronDown, Check, X } from 'lucide-react';

type TenantRow = {
    id: string;
    name: string;
    slug: string;
    plan: string;
    is_active: boolean;
    created_at: string;
    clerk_org_id: string | null;
};

type UserRow = {
    id: string;
    full_name: string;
    email: string;
    role: string;
    is_active: boolean;
    tenant_id: string;
    created_at: string;
};

const PLAN_OPTIONS = ['starter', 'professional', 'enterprise'];

const PLAN_COLORS: Record<string, string> = {
    starter: 'bg-[#F3F4F6] text-[#6B7280]',
    professional: 'bg-[#EEF0FF] text-[#818CF8]',
    enterprise: 'bg-amber-100 text-amber-700',
};

export function AdminPageClient({
    initialTenants,
    initialUsers,
}: {
    initialTenants: TenantRow[];
    initialUsers: UserRow[];
}) {
    const [tenants, setTenants] = useState(initialTenants);
    const [users, setUsers] = useState(initialUsers);
    const [activeTab, setActiveTab] = useState<'tenants' | 'users'>('tenants');
    const [planDropdown, setPlanDropdown] = useState<string | null>(null);

    async function handlePlanChange(tenantId: string, plan: string) {
        setTenants((prev) => prev.map((t) => t.id === tenantId ? { ...t, plan } : t));
        setPlanDropdown(null);
        try {
            const res = await fetch(`/api/admin/tenants/${tenantId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan }),
            });
            if (!res.ok) throw new Error();
            toast.success('Plan actualizado');
        } catch {
            toast.error('Error al actualizar el plan');
            setTenants(initialTenants);
        }
    }

    async function handleTenantToggle(tenantId: string, isActive: boolean) {
        setTenants((prev) => prev.map((t) => t.id === tenantId ? { ...t, is_active: isActive } : t));
        try {
            const res = await fetch(`/api/admin/tenants/${tenantId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isActive }),
            });
            if (!res.ok) throw new Error();
            toast.success(isActive ? 'Restaurante activado' : 'Restaurante desactivado');
        } catch {
            toast.error('Error al actualizar');
            setTenants(initialTenants);
        }
    }

    async function handleUserToggle(userId: string, isActive: boolean) {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: isActive } : u));
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isActive }),
            });
            if (!res.ok) throw new Error();
            toast.success(isActive ? 'Usuario activado' : 'Usuario desactivado');
        } catch {
            toast.error('Error al actualizar');
            setUsers(initialUsers);
        }
    }

    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    return (
        <div>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Restaurantes', value: tenants.length, icon: Building2, color: '#818CF8' },
                    { label: 'Activos', value: tenants.filter((t) => t.is_active).length, icon: Check, color: '#059669' },
                    { label: 'Usuarios', value: users.length, icon: Users, color: '#F97316' },
                    { label: 'Professional+', value: tenants.filter((t) => t.plan !== 'starter').length, icon: Building2, color: '#D97706' },
                ].map((stat) => (
                    <div key={stat.label} className="bg-white rounded-2xl border border-[#E8E8EC] p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${stat.color}15` }}>
                            <stat.icon size={18} style={{ color: stat.color }} />
                        </div>
                        <div>
                            <p className="text-[22px] font-bold text-[#1A1A2E]">{stat.value}</p>
                            <p className="text-[11px] text-[#9CA3AF]">{stat.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[#F3F4F6] rounded-[12px] p-1 mb-5 w-fit">
                {(['tenants', 'users'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-[10px] text-[13px] font-medium transition-all ${
                            activeTab === tab ? 'bg-white text-[#1A1A2E] shadow-sm' : 'text-[#6B7280] hover:text-[#1A1A2E]'
                        }`}
                    >
                        {tab === 'tenants' ? `Restaurantes (${tenants.length})` : `Usuarios (${users.length})`}
                    </button>
                ))}
            </div>

            {/* Tenants table */}
            {activeTab === 'tenants' && (
                <div className="bg-white rounded-2xl border border-[#E8E8EC] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#E8E8EC] bg-[#F8F8FA]">
                                {['Restaurante', 'Slug', 'Plan', 'Estado', 'Creado', 'Acciones'].map((h) => (
                                    <th key={h} className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F3F4F6]">
                            {tenants.map((tenant) => (
                                <tr key={tenant.id} className="hover:bg-[#F8F8FA] transition-colors">
                                    <td className="px-4 py-3 font-semibold text-[#1A1A2E] text-[13px]">{tenant.name}</td>
                                    <td className="px-4 py-3"><code className="text-[11px] bg-[#F3F4F6] px-2 py-0.5 rounded">{tenant.slug}</code></td>
                                    <td className="px-4 py-3">
                                        <div className="relative">
                                            <button
                                                onClick={() => setPlanDropdown(planDropdown === tenant.id ? null : tenant.id)}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${PLAN_COLORS[tenant.plan] ?? PLAN_COLORS.starter}`}
                                            >
                                                {tenant.plan}
                                                <ChevronDown size={11} />
                                            </button>
                                            {planDropdown === tenant.id && (
                                                <>
                                                    <div className="fixed inset-0 z-10" onClick={() => setPlanDropdown(null)} />
                                                    <div className="absolute left-0 top-8 z-20 bg-white rounded-xl border border-[#E8E8EC] shadow-lg py-1 min-w-[140px]">
                                                        {PLAN_OPTIONS.map((p) => (
                                                            <button
                                                                key={p}
                                                                onClick={() => handlePlanChange(tenant.id, p)}
                                                                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[#F8F8FA] flex items-center gap-2 ${p === tenant.plan ? 'font-semibold text-[#1A1A2E]' : 'text-[#6B7280]'}`}
                                                            >
                                                                <span className={`w-2 h-2 rounded-full ${p === 'enterprise' ? 'bg-amber-400' : p === 'professional' ? 'bg-[#818CF8]' : 'bg-[#D1D5DB]'}`} />
                                                                {p}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tenant.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                            {tenant.is_active ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-[12px] text-[#9CA3AF]">
                                        {new Date(tenant.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleTenantToggle(tenant.id, !tenant.is_active)}
                                            className={`p-1.5 rounded-lg transition-colors ${tenant.is_active ? 'hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626]' : 'hover:bg-[#ECFDF5] text-[#9CA3AF] hover:text-[#059669]'}`}
                                            title={tenant.is_active ? 'Desactivar' : 'Activar'}
                                        >
                                            {tenant.is_active ? <X size={14} /> : <Check size={14} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {tenants.length === 0 && (
                        <div className="py-12 text-center text-[13px] text-[#9CA3AF]">No hay restaurantes registrados</div>
                    )}
                </div>
            )}

            {/* Users table */}
            {activeTab === 'users' && (
                <div className="bg-white rounded-2xl border border-[#E8E8EC] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#E8E8EC] bg-[#F8F8FA]">
                                {['Usuario', 'Email', 'Restaurante', 'Rol', 'Estado', 'Acciones'].map((h) => (
                                    <th key={h} className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F3F4F6]">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-[#F8F8FA] transition-colors">
                                    <td className="px-4 py-3 font-semibold text-[#1A1A2E] text-[13px]">{user.full_name}</td>
                                    <td className="px-4 py-3 text-[12px] text-[#6B7280]">{user.email}</td>
                                    <td className="px-4 py-3 text-[12px] text-[#6B7280]">{tenantMap.get(user.tenant_id) ?? '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                            user.role === 'admin' ? 'bg-[#EEF0FF] text-[#818CF8]' :
                                            user.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                                            'bg-[#F3F4F6] text-[#6B7280]'
                                        }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                            {user.is_active ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleUserToggle(user.id, !user.is_active)}
                                            className={`p-1.5 rounded-lg transition-colors ${user.is_active ? 'hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626]' : 'hover:bg-[#ECFDF5] text-[#9CA3AF] hover:text-[#059669]'}`}
                                            title={user.is_active ? 'Desactivar' : 'Activar'}
                                        >
                                            {user.is_active ? <X size={14} /> : <Check size={14} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {users.length === 0 && (
                        <div className="py-12 text-center text-[13px] text-[#9CA3AF]">No hay usuarios registrados</div>
                    )}
                </div>
            )}
        </div>
    );
}
