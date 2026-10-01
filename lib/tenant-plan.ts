import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export type TenantPlan = 'starter' | 'professional' | 'enterprise';
export type BusinessType = 'general' | 'restaurant';

export type TenantConfig = {
    plan: TenantPlan;
    businessType: BusinessType;
};

export async function getTenantConfig(tenantId?: string): Promise<TenantConfig> {
    try {
        const supabase = createAdminClient();
        const id = tenantId ?? await getServerTenantId();
        const { data } = await supabase
            .from('tenants')
            .select('plan, business_type')
            .eq('id', id)
            .single();
        return {
            plan: (data?.plan ?? 'starter') as TenantPlan,
            businessType: (data?.business_type ?? 'general') as BusinessType,
        };
    } catch {
        return { plan: 'starter', businessType: 'general' };
    }
}

/** @deprecated Use getTenantConfig instead */
export async function getTenantPlan(): Promise<TenantPlan> {
    const config = await getTenantConfig();
    return config.plan;
}
