import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function getTenantPlan(): Promise<'starter' | 'professional' | 'enterprise'> {
    try {
        const supabase = createAdminClient();
        const tenantId = await getServerTenantId();
        const { data } = await supabase
            .from('tenants')
            .select('plan')
            .eq('id', tenantId)
            .single();
        return (data?.plan ?? 'starter') as 'starter' | 'professional' | 'enterprise';
    } catch {
        return 'starter';
    }
}
