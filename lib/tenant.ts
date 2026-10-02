import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';

export class TenantError extends Error {
    public status: number;
    constructor(message: string, status = 401) {
        super(message);
        this.name = 'TenantError';
        this.status = status;
    }
}

/**
 * Generates a URL-safe slug from a name.
 */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip accents
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'tenant';
}

/**
 * Creates sample tags, custom fields, and funnel stages for a new tenant.
 */
async function seedTenantData(supabase: ReturnType<typeof createAdminClient>, tenantId: string) {
    // Funnel stages
    const stages = [
        { tenant_id: tenantId, name: 'Nuevo', slug: 'nuevo', color: '#818CF8', position: 0, is_default: true },
        { tenant_id: tenantId, name: 'Contactado', slug: 'contactado', color: '#60A5FA', position: 1 },
        { tenant_id: tenantId, name: 'Interesado', slug: 'interesado', color: '#F59E0B', position: 2 },
        { tenant_id: tenantId, name: 'Negociación', slug: 'negociacion', color: '#F97316', position: 3 },
        { tenant_id: tenantId, name: 'Cerrado ganado', slug: 'cerrado-ganado', color: '#10B981', position: 4, is_won: true },
        { tenant_id: tenantId, name: 'Cerrado perdido', slug: 'cerrado-perdido', color: '#EF4444', position: 5, is_lost: true },
    ];

    // Tags
    const tags = [
        { tenant_id: tenantId, name: 'VIP', color: '#F59E0B' },
        { tenant_id: tenantId, name: 'Lead caliente', color: '#EF4444' },
        { tenant_id: tenantId, name: 'Seguimiento', color: '#3B82F6' },
        { tenant_id: tenantId, name: 'Referido', color: '#10B981' },
        { tenant_id: tenantId, name: 'Nuevo', color: '#818CF8' },
    ];

    // Custom fields
    const customFields = [
        { tenant_id: tenantId, field_key: 'empresa', label: 'Empresa', field_type: 'text' as const },
        { tenant_id: tenantId, field_key: 'cargo', label: 'Cargo', field_type: 'text' as const },
        { tenant_id: tenantId, field_key: 'ciudad', label: 'Ciudad', field_type: 'text' as const },
        { tenant_id: tenantId, field_key: 'fecha_nacimiento', label: 'Fecha de nacimiento', field_type: 'date' as const },
        { tenant_id: tenantId, field_key: 'notas', label: 'Notas adicionales', field_type: 'text' as const },
    ];

    // Product categories
    const categories = [
        { tenant_id: tenantId, name: 'General', position: 0 },
    ];

    await Promise.all([
        supabase.from('funnel_stages').insert(stages),
        supabase.from('tags').insert(tags),
        supabase.from('custom_fields').insert(customFields),
        supabase.from('product_categories').insert(categories),
    ]);

    console.log(`[seedTenantData] Created seed data for tenant ${tenantId}`);
}

/**
 * Returns the tenant id for a Clerk organization, creating and seeding the
 * tenant if it doesn't exist yet. Idempotent: safe to call from both the
 * Clerk webhook and the first request of a new organization.
 */
export async function provisionTenant(orgId: string): Promise<string> {
    const supabase = createAdminClient();

    const { data: existingTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('clerk_org_id', orgId)
        .maybeSingle();
    if (existingTenant) return existingTenant.id;

    const clerk = await clerkClient();
    const org = await clerk.organizations.getOrganization({ organizationId: orgId });

    const name = org.name || 'Mi Negocio';
    let slug = org.slug ? slugify(org.slug) : slugify(name);

    // Ensure slug is unique — append random suffix if taken
    const { data: slugTaken } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

    if (slugTaken) {
        slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    // plan_id defaults to the crm_basic plan (column default in the DB)
    const { data, error } = await supabase
        .from('tenants')
        .insert({
            clerk_org_id: orgId,
            name,
            slug,
            logo_url: org.imageUrl ?? null,
        })
        .select('id')
        .single();

    if (error || !data) {
        // Another request may have created it concurrently (unique clerk_org_id)
        const { data: raced } = await supabase
            .from('tenants')
            .select('id')
            .eq('clerk_org_id', orgId)
            .maybeSingle();
        if (raced) return raced.id;

        console.error('[provisionTenant] Failed to create tenant:', error);
        throw new TenantError('Failed to provision tenant for new organization.', 500);
    }

    try {
        await seedTenantData(supabase, data.id);
    } catch (err) {
        console.error('[provisionTenant] Failed to seed data:', err);
    }

    console.log(`[provisionTenant] Created tenant ${data.id} for org ${orgId} (${name})`);
    return data.id;
}

/**
 * Returns the tenant UUID for the currently authenticated Clerk user.
 * Looks up tenants.clerk_org_id matching the active Clerk organization.
 * If no tenant exists, auto-provisions one from the Clerk org metadata.
 * Throws TenantError if no org is found or the tenant is deactivated.
 */
export async function getServerTenantId(): Promise<string> {
    const { orgId } = await auth();
    if (!orgId) {
        throw new TenantError('No Clerk organization found. User must belong to an organization.');
    }

    const supabase = createAdminClient();
    const { data } = await supabase
        .from('tenants')
        .select('id, is_active')
        .eq('clerk_org_id', orgId)
        .maybeSingle();

    if (data) {
        if (!data.is_active) throw new TenantError('This organization is deactivated.', 403);
        return data.id;
    }

    // Auto-provision tenant for new Clerk orgs
    return provisionTenant(orgId);
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

/**
 * Returns the Clerk org metadata for the current session.
 * Useful for checking roles (super_admin, etc.)
 */
export async function getServerAuth() {
    return auth();
}

/**
 * True if the current Clerk user is a super admin: either flagged in Clerk
 * publicMetadata.role or listed (active) in the super_admins table, which is
 * also what the RLS helper is_super_admin() checks.
 */
export async function isSuperAdmin(): Promise<boolean> {
    const { userId, sessionClaims } = await auth();
    if (!userId) return false;
    const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
    if (role === 'super_admin') return true;

    const supabase = createAdminClient();
    const { data } = await supabase
        .from('super_admins')
        .select('id')
        .eq('clerk_user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
    return !!data;
}

/**
 * Throws TenantError(403) if the current user is not a super admin.
 */
export async function requireSuperAdmin(): Promise<void> {
    if (!(await isSuperAdmin())) {
        throw new TenantError('Forbidden: super_admin role required', 403);
    }
}

/** Maps a Clerk organization role to a CRM role. */
export function mapClerkOrgRole(orgRole: string | null | undefined): 'admin' | 'agent' {
    return orgRole === 'org:admin' || orgRole === 'admin' ? 'admin' : 'agent';
}

/**
 * Ensures the current Clerk user has a users row for this tenant, so the RLS
 * helper has_role() works even if the Clerk membership webhook was missed.
 * Existing rows are left untouched (their CRM role may have been changed).
 */
export async function ensureTenantMembership(tenantId: string): Promise<void> {
    const { userId, orgRole } = await auth();
    if (!userId) return;

    const supabase = createAdminClient();
    const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('clerk_user_id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
    if (existing) return;

    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || email || userId;

    const { error } = await supabase.from('users').upsert({
        clerk_user_id: userId,
        tenant_id: tenantId,
        email,
        full_name: fullName,
        avatar_url: user?.imageUrl ?? null,
        role: mapClerkOrgRole(orgRole),
        is_active: true,
    }, { onConflict: 'clerk_user_id,tenant_id', ignoreDuplicates: true });

    if (error) console.error('[ensureTenantMembership] Failed to create user row:', error);
}
