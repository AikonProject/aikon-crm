'use client';

import { useMemo } from 'react';
import { useSession } from '@clerk/nextjs';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
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

/** React hook: one Supabase client per Clerk session. */
export function useSupabaseClient() {
    const { session } = useSession();
    return useMemo(
        () => createClient(async () => (await session?.getToken()) ?? null),
        [session]
    );
}
