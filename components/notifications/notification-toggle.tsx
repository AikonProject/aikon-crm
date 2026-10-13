'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, BellRing, Volume2, VolumeX, MonitorSmartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    desktopPermission, getNotifySettings, setNotifySettings, playChime, NOTIFY_SETTINGS_EVENT, type NotifySettings,
} from './notification-settings';

/** Bell in the sidebar: sound on/off and desktop notifications (asks the browser for permission). */
export function NotificationToggle({ collapsed }: { collapsed: boolean }) {
    const [open, setOpen] = useState(false);
    const [settings, setSettings] = useState<NotifySettings>({ sound: true, desktop: true });
    const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sync = () => { setSettings(getNotifySettings()); setPerm(desktopPermission()); };
        sync();
        window.addEventListener(NOTIFY_SETTINGS_EVENT, sync);
        return () => window.removeEventListener(NOTIFY_SETTINGS_EVENT, sync);
    }, []);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const desktopOn = settings.desktop && perm === 'granted';
    const needsAttention = perm === 'default';
    const Icon = !settings.sound && !desktopOn ? BellOff : needsAttention ? BellRing : Bell;

    async function enableDesktop() {
        if (perm === 'unsupported') return;
        let p = perm;
        if (p === 'default') p = await Notification.requestPermission();
        setPerm(p);
        setNotifySettings({ desktop: p === 'granted' });
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                title="Notificaciones de mensajes"
                className={cn(
                    'relative flex items-center gap-3 w-full rounded-xl px-3 py-2 text-sm font-medium text-[#6B7280] hover:bg-[#F9FAFB] transition-colors',
                    collapsed && 'justify-center px-0'
                )}
            >
                <Icon size={20} className={cn('flex-shrink-0', needsAttention ? 'text-[#F59E0B]' : 'text-[#9CA3AF]')} />
                {!collapsed && <span>Notificaciones</span>}
                {needsAttention && <span className="absolute top-1.5 left-7 w-2 h-2 rounded-full bg-[#F59E0B]" />}
            </button>

            {open && (
                <div className={cn(
                    'absolute bottom-full mb-2 z-50 w-64 rounded-xl border border-[#E8E8EC] bg-white shadow-lg p-3 space-y-2',
                    collapsed ? 'left-2' : 'left-0'
                )}>
                    <p className="text-[12px] font-semibold text-[#1A1A2E]">Avisos de mensajes nuevos</p>

                    <button
                        onClick={() => {
                            const sound = !settings.sound;
                            setNotifySettings({ sound });
                            if (sound) playChime();
                        }}
                        className="flex items-center gap-2 w-full text-left text-[12px] text-[#374151] hover:bg-[#F9FAFB] rounded-lg px-2 py-1.5"
                    >
                        {settings.sound ? <Volume2 size={14} className="text-[#4F46E5]" /> : <VolumeX size={14} className="text-[#9CA3AF]" />}
                        <span className="flex-1">Sonido</span>
                        <span className={cn('text-[11px] font-medium', settings.sound ? 'text-[#4F46E5]' : 'text-[#9CA3AF]')}>
                            {settings.sound ? 'Activado' : 'Apagado'}
                        </span>
                    </button>

                    <button
                        onClick={() => (desktopOn ? setNotifySettings({ desktop: false }) : enableDesktop())}
                        disabled={perm === 'unsupported' || perm === 'denied'}
                        className="flex items-center gap-2 w-full text-left text-[12px] text-[#374151] hover:bg-[#F9FAFB] rounded-lg px-2 py-1.5 disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                        <MonitorSmartphone size={14} className={desktopOn ? 'text-[#4F46E5]' : 'text-[#9CA3AF]'} />
                        <span className="flex-1">Escritorio</span>
                        <span className={cn('text-[11px] font-medium', desktopOn ? 'text-[#4F46E5]' : 'text-[#9CA3AF]')}>
                            {perm === 'unsupported' ? 'No disponible' : perm === 'denied' ? 'Bloqueado' : desktopOn ? 'Activado' : 'Activar'}
                        </span>
                    </button>

                    <p className="text-[11px] text-[#9CA3AF] leading-snug">
                        {perm === 'denied'
                            ? 'El navegador bloqueó las notificaciones. Habilítalas desde el candado de la barra de direcciones.'
                            : 'Los avisos de escritorio aparecen cuando el CRM está en otra pestaña o minimizado.'}
                    </p>
                </div>
            )}
        </div>
    );
}
