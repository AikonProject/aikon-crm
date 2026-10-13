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

    const start = () => {
        if (stopped) return;
        // Unique topic: two components may listen to the same table
        channel = configure(supabase.channel(`${name}:${Math.random().toString(36).slice(2, 10)}`));
        channel.subscribe((status) => {
            if (stopped) return;
            if (status === 'SUBSCRIBED') {
                attempt = 0;
                onReady?.();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                const dead = channel;
                channel = null;
                if (dead) supabase.removeChannel(dead);
                attempt += 1;
                retry = setTimeout(start, Math.min(30000, 1500 * attempt));
            }
        });
    };

    start();
    return () => {
        stopped = true;
        if (retry) clearTimeout(retry);
        if (channel) supabase.removeChannel(channel);
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
