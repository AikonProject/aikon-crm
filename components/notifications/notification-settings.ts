'use client';

/** Per-browser notification preferences (localStorage). */
const SOUND_KEY = 'aikon.notify.sound';
const DESKTOP_KEY = 'aikon.notify.desktop';
export const NOTIFY_SETTINGS_EVENT = 'aikon:notify-settings';

export type NotifySettings = { sound: boolean; desktop: boolean };

function read(key: string, fallback: boolean): boolean {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v === '1';
    } catch { return fallback; }
}

export function getNotifySettings(): NotifySettings {
    return { sound: read(SOUND_KEY, true), desktop: read(DESKTOP_KEY, true) };
}

export function setNotifySettings(next: Partial<NotifySettings>) {
    try {
        if (next.sound !== undefined) localStorage.setItem(SOUND_KEY, next.sound ? '1' : '0');
        if (next.desktop !== undefined) localStorage.setItem(DESKTOP_KEY, next.desktop ? '1' : '0');
    } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(NOTIFY_SETTINGS_EVENT));
}

export function desktopPermission(): NotificationPermission | 'unsupported' {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

let audioCtx: AudioContext | null = null;

/** Short two-tone chime generated with WebAudio (no asset to load). */
export function playChime() {
    try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        audioCtx ??= new Ctx();
        const ctx = audioCtx;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const now = ctx.currentTime;
        [[880, 0], [1320, 0.12]].forEach(([freq, at]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, now + at);
            gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.25);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + at);
            osc.stop(now + at + 0.3);
        });
    } catch { /* audio blocked */ }
}

/** Browsers only allow audio after a user gesture: unlock it on the first click/key. */
export function unlockAudioOnGesture() {
    const unlock = () => {
        try {
            const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (Ctx) { audioCtx ??= new Ctx(); audioCtx.resume().catch(() => {}); }
        } catch { /* ignore */ }
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return unlock;
}
