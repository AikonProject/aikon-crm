import { Plus, Upload } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { NewContactDialog } from '@/components/contacts/new-contact-dialog';
import { ContactsTableClient } from '@/components/contacts/contacts-table-client';
import type { FunnelStage } from '@/lib/types/database';

// Server-side data fetching
async function getPageData() {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

    const [stagesRes, contactsRes] = await Promise.all([
        supabase
            .from('funnel_stages')
            .select('id, name, color, position')
            .eq('tenant_id', TENANT_ID)
            .order('position', { ascending: true }),
        supabase
            .from('contacts')
            .select(
                `
        id, nombre, email, wa_id, source, lead_score,
        last_contacted_at, created_at, funnel_stage_id, assigned_to,
        funnel_stage:funnel_stages ( id, name, color, position ),
        contact_tags ( tag:tags ( id, name, color ) )
        `,
                { count: 'exact' }
            )
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false })
            .limit(200),
    ]);

    return {
        stages: (stagesRes.data ?? []) as FunnelStage[],
        contacts: (contactsRes.data ?? []) as ContactWithRelations[],
        total: contactsRes.count ?? 0,
    };
}

// Inline type for joined contact rows
export type ContactWithRelations = {
    id: string;
    nombre: string;
    email: string | null;
    wa_id: string | null;
    source: string;
    lead_score: number;
    last_contacted_at: string | null;
    created_at: string;
    funnel_stage_id: string | null;
    assigned_to: string | null;
    funnel_stage: { id: string; name: string; color: string | null; position: number } | null;
    contact_tags: { tag: { id: string; name: string; color: string | null } | null }[];
};

export default async function ContactsPage() {
    const { stages, contacts, total } = await getPageData();

    return (
        <>
            <Breadcrumb />
            <PageHeader
                title="Contactos"
                description="Gestiona todos tus leads y clientes del restaurante"
            >
                <Button
                    variant="outline"
                    className="gap-2 rounded-[10px] border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]"
                >
                    <Upload size={16} />
                    Importar CSV
                </Button>
                <NewContactDialog>
                    <Button className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white">
                        <Plus size={16} />
                        Nuevo contacto
                    </Button>
                </NewContactDialog>
            </PageHeader>

            <ContactsTableClient
                contacts={contacts}
                stages={stages}
                total={total}
            />
        </>
    );
}
