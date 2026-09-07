import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Fallback for dev without Clerk session (should not happen in production)
const FALLBACK_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Returns the tenant UUID for the currently authenticated Clerk user.
 * Looks up tenants.clerk_org_id matching the active Clerk organization.
 * Falls back to the default tenant if no org is found (single-tenant mode).
 */
export async function getServerTenantId(): Promise<string> {
    try {
        const { orgId } = await auth();
        if (!orgId) return FALLBACK_TENANT_ID;

        const supabase = createAdminClient();
        const { data } = await supabase
            .from('tenants')
            .select('id')
            .eq('clerk_org_id', orgId)
            .eq('is_active', true)
            .single();

        return data?.id ?? FALLBACK_TENANT_ID;
    } catch {
        return FALLBACK_TENANT_ID;
    }
}

/**
 * Returns the Clerk user_id for the current session.
 */
export async function getServerUserId(): Promise<string | null> {
    try {
        const { userId } = await auth();
        return userId ?? null;
    } catch {
        return null;
    }
}
