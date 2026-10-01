import { Sidebar } from '@/components/layout/sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-provider';
import { MainContent } from '@/components/layout/main-content';
import { TenantProvider } from '@/components/providers/tenant-provider';
import { getTenantConfig } from '@/lib/tenant-plan';
import { getServerTenantId } from '@/lib/tenant';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Sequential: get tenantId first (may provision), then fetch config with it
    const tenantId = await getServerTenantId();
    const config = await getTenantConfig(tenantId);

    return (
        <div className="min-h-screen bg-[#F8F8FA]">
            <TenantProvider tenantId={tenantId}>
                <SidebarProvider>
                    <Sidebar plan={config.plan} businessType={config.businessType} />
                    <MainContent>{children}</MainContent>
                </SidebarProvider>
            </TenantProvider>
        </div>
    );
}
