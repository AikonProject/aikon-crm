import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * Supabase admin client — uses SERVICE_ROLE_KEY to bypass RLS.
 * NEVER expose this client to the browser. Use only in server-side code
 * (API routes, Server Actions, server components).
 *
 * Auth (Clerk) is not yet wired up; this client is the primary way to
 * read/write data until per-user RLS policies are in place.
 */
export function createAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error(
            'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
        );
    }

    return createClient<Database>(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
