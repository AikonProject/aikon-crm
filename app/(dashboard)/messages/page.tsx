'use client';

import { useEffect, useState } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import {
    Loader2,
    ExternalLink,
    MessageCircle,
    Users,
    MessageSquare,
    ArrowUpRight,
    Search,
    LayoutDashboard
} from 'lucide-react';

export default function MessagesPage() {
    const [ssoUrl, setSsoUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchSSO() {
            try {
                const res = await fetch('/api/chatwoot/sso');
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error de sincronización');
                setSsoUrl(data.url);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchSSO();
    }, []);

    const stats = [
        { label: 'Conversaciones Activas', value: '12', icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Tiempo de Respuesta', value: '4m 20s', icon: ArrowUpRight, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Contactos Totales', value: '1,284', icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    ];

    return (
        <div className="flex flex-col min-h-screen bg-[#F8FAFC] pb-8">
            <div className="bg-white border-b border-slate-200 mb-6">
                <div className="max-w-[1600px] mx-auto px-6 py-4">
                    <Breadcrumb />
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2">
                        <PageHeader
                            title="Centro de Comunicaciones"
                            description="Monitor de actividad y acceso a terminal de mensajería"
                        />
                        <div className="flex items-center gap-3">
                            <div className="relative hidden sm:block">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Buscar conversación..."
                                    className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 w-64"
                                />
                            </div>
                            {ssoUrl && !loading && (
                                <a
                                    href={ssoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#1A1A2E] hover:bg-[#2C2C42] text-white rounded-lg font-medium text-sm transition-all shadow-md active:scale-95"
                                >
                                    Abrir Consola Chatwoot
                                    <ExternalLink size={16} />
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto px-6 w-full">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {stats.map((stat, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-500 mb-1">{stat.label}</p>
                                <h3 className="text-2xl font-bold text-slate-900">{stat.value}</h3>
                            </div>
                            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                                <stat.icon size={24} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Welcome / Action Card */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center justify-center text-center">
                        {loading ? (
                            <div className="flex flex-col items-center py-20">
                                <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
                                <p className="text-slate-500 font-medium tracking-wide">Sincronizando consola de mensajes...</p>
                            </div>
                        ) : error ? (
                            <div className="py-20">
                                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="text-2xl font-bold">!</span>
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Error de Sincronización</h3>
                                <p className="text-slate-500 mb-6">{error}</p>
                                <button onClick={() => window.location.reload()} className="text-indigo-600 font-semibold hover:underline">Reintentar conexión</button>
                            </div>
                        ) : (
                            <div className="py-12 px-4">
                                <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                    <LayoutDashboard size={40} />
                                </div>
                                <h2 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">Listo para gestionar</h2>
                                <p className="text-slate-500 text-lg max-w-lg mx-auto mb-10 leading-relaxed">
                                    Tu terminal de Chatwoot está vinculada y activa. Haz clic a continuación para entrar a la consola completa con todos tus contactos y automatizaciones.
                                </p>
                                <a
                                    href={ssoUrl || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-indigo-200 hover:-translate-y-1"
                                >
                                    Ingresar a la Terminal
                                    <MessageCircle size={22} />
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Side Info Panel */}
                    <div className="space-y-6">
                        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl">
                            <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                Estado del Sistema
                            </h4>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between text-sm text-slate-300">
                                    <span>Servidor Chatwoot</span>
                                    <span className="text-emerald-400 font-medium">En línea</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-slate-300">
                                    <span>Conexión SSO</span>
                                    <span className="text-emerald-400 font-medium">Autorizada</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-slate-300">
                                    <span>API de Plataforma</span>
                                    <span className="text-indigo-400 font-medium text-xs font-mono">...{String(process.env.CHATWOOT_PLATFORM_ACCESS_TOKEN).slice(-4)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <h4 className="font-bold text-slate-900 mb-4 tracking-tight">Actividad Reciente</h4>
                            <div className="space-y-4 opacity-75">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex-shrink-0" />
                                        <div className="space-y-1 w-full">
                                            <div className="h-3 w-3/4 bg-slate-100 rounded animate-pulse" />
                                            <div className="h-2 w-1/2 bg-slate-50 rounded animate-pulse" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
