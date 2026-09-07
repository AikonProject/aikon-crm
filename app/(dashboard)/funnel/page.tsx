import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { FunnelPageClient } from '@/components/funnel/funnel-page-client';
import type { FunnelStage } from '@/lib/types/database';

type ContactRow = {
    id: string;
    nombre: string;
    wa_id: string | null;
    last_contacted_at: string | null;
    funnel_stage_id: string | null;
    contact_tags: { tag: { id: string; name: string; color: string | null } | null }[];
};

async function getPageData() {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

    const [stagesRes, contactsRes] = await Promise.all([
        supabase
            .from('funnel_stages')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('position', { ascending: true }),
        supabase
            .from('contacts')
            .select(
                `id, nombre, wa_id, last_contacted_at, funnel_stage_id,
                 contact_tags ( tag:tags ( id, name, color ) )`
            )
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false }),
    ]);

    return {
        stages: (stagesRes.data ?? []) as FunnelStage[],
        contacts: (contactsRes.data ?? []) as ContactRow[],
    };
}

export default async function FunnelPage() {
    const { stages, contacts } = await getPageData();

    return (
        <>
            <Breadcrumb />
            <FunnelPageClient stages={stages} contacts={contacts} />
        </>
    );
}
