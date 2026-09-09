import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/layout/page-header';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { AdminPageClient } from '@/components/admin/admin-page-client';

export default async function AdminPage() {
    const supabase = createAdminClient();

    const [tenantsRes, usersRes] = await Promise.all([
        supabase
            .from('tenants')
            .select('id, name, slug, plan, is_active, created_at, clerk_org_id')
            .order('created_at', { ascending: false }),
        supabase
            .from('users')
            .select('id, full_name, email, role, is_active, tenant_id, created_at')
            .order('created_at', { ascending: false }),
    ]);

    return (
        <>
            <Breadcrumb />
            <PageHeader
                title="Panel de Administración"
                description="Gestiona todos los restaurantes y usuarios del CRM"
            />
            <AdminPageClient
                initialTenants={tenantsRes.data ?? []}
                initialUsers={usersRes.data ?? []}
            />
        </>
    );
}
