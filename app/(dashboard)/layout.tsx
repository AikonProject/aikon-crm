import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-provider';
import { MainContent } from '@/components/layout/main-content';
import { TenantProvider } from '@/components/providers/tenant-provider';
import { getTenantConfig, hasModule } from '@/lib/tenant-plan';
import { ensureTenantMembership, getServerTenantId, isSuperAdmin } from '@/lib/tenant';
import { moduleForPath } from '@/lib/plan-modules';
import { ModuleGuard } from '@/components/layout/module-guard';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Sequential: get tenantId first (may provision), then fetch config with it
    const tenantId = await getServerTenantId();
    const [config, superAdmin] = await Promise.all([
        getTenantConfig(tenantId),
        isSuperAdmin(),
        ensureTenantMembership(tenantId),
    ]);

    // Block routes whose module isn't included in the tenant's plan
    const pathname = (await headers()).get('x-pathname') ?? '';
    const requiredModule = moduleForPath(pathname);
    if (requiredModule && !hasModule(config, requiredModule)) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-[#F8F8FA]">
            <TenantProvider tenantId={tenantId}>
                <SidebarProvider>
                    <Sidebar
                        planName={config.planName}
                        modules={config.modules}
                        isSuperAdmin={superAdmin}
                    />
                    <MainContent>
                        <ModuleGuard modules={config.modules}>{children}</ModuleGuard>
                    </MainContent>
                </SidebarProvider>
            </TenantProvider>
        </div>
    );
}
