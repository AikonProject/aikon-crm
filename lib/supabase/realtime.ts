'use client';

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/**
 * Subscribes to a Realtime channel and keeps it alive: if the channel errors,
 * times out or closes, it is recreated after a short delay. `onReady` runs on
 * every (re)subscription so the caller can refetch what it may have missed.
 * Returns the cleanup function for useEffect.
 */
export function subscribeResilient(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SupabaseClient<any>,
    name: string,
    configure: (channel: RealtimeChannel) => RealtimeChannel,
    onReady?: () => void
): () => void {
    let channel: RealtimeChannel | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const scheduleRetry = () => {
        if (stopped || retry) return;
        attempt += 1;
        retry = setTimeout(() => { retry = null; start(); }, Math.min(30000, 2000 * attempt));
    };

    const start = () => {
        if (stopped) return;
        // Unique topic: two components may listen to the same table
        const ch = configure(supabase.channel(`${name}:${Math.random().toString(36).slice(2, 10)}`));
        channel = ch;
        ch.subscribe((status) => {
            // Ignore events from channels we already replaced or removed (removeChannel emits CLOSED,
            // which must not trigger yet another reconnection)
            if (stopped || ch !== channel) return;
            if (status === 'SUBSCRIBED') {
                attempt = 0;
                onReady?.();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                channel = null;
                supabase.removeChannel(ch);
                scheduleRetry();
            }
        });
    };

    start();
    return () => {
        stopped = true;
        if (retry) clearTimeout(retry);
        if (channel) supabase.removeChannel(channel);
        channel = null;
    };
}

/** Runs `fn` every `ms` while the tab is visible, and right away when it becomes visible again. */
export function pollWhileVisible(fn: () => void, ms: number): () => void {
    const tick = () => { if (document.visibilityState === 'visible') fn(); };
    const id = setInterval(tick, ms);
    const onVisible = () => { if (document.visibilityState === 'visible') fn(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
        clearInterval(id);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
    };
}
