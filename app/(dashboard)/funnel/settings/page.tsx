import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { FunnelSettingsClient } from '@/components/funnel/funnel-settings-client';
import type { FunnelStage } from '@/lib/types/database';

async function getStages(): Promise<FunnelStage[]> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('funnel_stages')
        .select('*')
        .eq('tenant_id', MOCK_TENANT_ID)
        .order('position', { ascending: true });
    return (data ?? []) as FunnelStage[];
}

export default async function FunnelSettingsPage() {
    const stages = await getStages();

    return (
        <>
            <Breadcrumb />
            <FunnelSettingsClient initialStages={stages} />
        </>
    );
}
