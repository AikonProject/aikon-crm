import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';
import type { PlanModule } from '@/lib/types/database';

export type BusinessType = 'general' | 'restaurant';

export type TenantConfig = {
    planSlug: string;
    planName: string;
    modules: PlanModule[];
    maxContacts: number;
    maxUsers: number;
    businessType: BusinessType;
};

/** Plan used when a tenant's plan can't be read: the most restrictive one. */
const FALLBACK_CONFIG: TenantConfig = {
    planSlug: 'crm_basic',
    planName: 'CRM Básico',
    modules: ['chat', 'contacts', 'funnel'],
    maxContacts: 500,
    maxUsers: 3,
    businessType: 'general',
};

/**
 * Reads the tenant's plan from the plans table (tenants.plan_id → plans),
 * which is the source of truth for the modules a tenant can use.
 * Cached per request.
 */
export const getTenantConfig = cache(async (tenantId?: string): Promise<TenantConfig> => {
    try {
        const supabase = createAdminClient();
        const id = tenantId ?? await getServerTenantId();

        const { data: tenant } = await supabase
            .from('tenants')
            .select('plan_id, business_type')
            .eq('id', id)
            .single();
        if (!tenant?.plan_id) return FALLBACK_CONFIG;

        const { data: plan } = await supabase
            .from('plans')
            .select('slug, name, features, max_contacts, max_users')
            .eq('id', tenant.plan_id)
            .single();
        if (!plan) return FALLBACK_CONFIG;

        return {
            planSlug: plan.slug,
            planName: plan.name,
            modules: plan.features?.modules ?? [],
            maxContacts: plan.max_contacts,
            maxUsers: plan.max_users,
            businessType: (tenant.business_type ?? 'general') as BusinessType,
        };
    } catch (err) {
        console.error('[getTenantConfig] Failed to load plan:', err);
        return FALLBACK_CONFIG;
    }
});

export function hasModule(config: TenantConfig, module: PlanModule): boolean {
    return config.modules.includes(module);
}

/**
 * For API routes: throws TenantError(403) if the current tenant's plan
 * doesn't include the module. Returns the tenant id for convenience.
 */
export async function requireModule(module: PlanModule): Promise<string> {
    const tenantId = await getServerTenantId();
    const config = await getTenantConfig(tenantId);
    if (!hasModule(config, module)) {
        throw new TenantError(`Tu plan no incluye el módulo "${module}"`, 403);
    }
    return tenantId;
}
