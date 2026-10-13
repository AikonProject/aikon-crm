'use client';

import { useEffect } from 'react';
import { useSession } from '@clerk/nextjs';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

type GetToken = () => Promise<string | null>;

/**
 * Browser Supabase client authenticated with the Clerk session token.
 * Supabase verifies the Clerk JWT (third-party auth), so RLS policies
 * resolve the tenant from the token's org claim and Realtime only
 * delivers rows of the current tenant.
 */
export function createClient(getToken: GetToken) {
    return createSupabaseClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { accessToken: getToken }
    );
}

// One client per browser tab. Recreating it on every Clerk token refresh (~60 s)
// opened a new websocket each time and dropped the Realtime subscriptions.
let browserClient: SupabaseClient<Database> | null = null;
let currentGetToken: GetToken = async () => null;

function setTokenGetter(getToken: GetToken) {
    currentGetToken = getToken;
}

function getBrowserClient() {
    if (!browserClient) browserClient = createClient(() => currentGetToken());
    return browserClient;
}

/** React hook: the shared Supabase client, always using the current Clerk session token. */
export function useSupabaseClient() {
    const { session } = useSession();
    // Point the token getter at the current session (no new client, no new websocket)
    if (session) setTokenGetter(async () => (await session.getToken()) ?? null);
    const client = getBrowserClient();

    // When the session becomes available (or changes), push the token to Realtime
    // so channels that joined before sign-in start receiving the tenant's rows.
    useEffect(() => {
        if (!session) return;
        client.realtime.setAuth().catch(() => { /* retried on the next heartbeat */ });
    }, [client, session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    return client;
}
