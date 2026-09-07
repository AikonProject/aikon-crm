'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, Lock, ArrowRight } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // TODO: Implement Supabase Auth
        // For now simulate a delay then redirect
        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 1000);
    };

    return (
        <div className="min-h-screen bg-[#F8F8FA] flex items-center justify-center p-4">
            <div className="w-full max-w-[400px]">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#818CF8] to-[#6366F1] flex items-center justify-center mx-auto mb-4">
                        <span className="text-white font-bold text-xl">Ai</span>
                    </div>
                    <h1 className="text-[24px] font-bold text-[#1A1A2E]">
                        Bienvenido a Aikon CRM
                    </h1>
                    <p className="text-[14px] text-[#9CA3AF] mt-1">
                        Inicia sesión para continuar
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="crm-card p-6 space-y-4">
                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                            Email
                        </label>
                        <div className="relative">
                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="tu@email.com"
                                required
                                className="w-full pl-10 pr-4 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">
                            Contraseña
                        </label>
                        <div className="relative">
                            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full pl-10 pr-4 py-2.5 text-[14px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all"
                            />
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white py-5 text-[14px] font-semibold"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                Iniciar sesión
                                <ArrowRight size={16} />
                            </>
                        )}
                    </Button>
                </form>

                <p className="text-center text-[12px] text-[#9CA3AF] mt-6">
                    Powered by Aikon Intelligence
                </p>
            </div>
        </div>
    );
}
