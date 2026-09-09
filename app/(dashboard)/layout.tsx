import { Sidebar } from '@/components/layout/sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-provider';
import { MainContent } from '@/components/layout/main-content';
import { getTenantPlan } from '@/lib/tenant-plan';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const plan = await getTenantPlan();
    return (
        <div className="min-h-screen bg-[#F8F8FA]">
            <SidebarProvider>
                <Sidebar plan={plan} />
                <MainContent>{children}</MainContent>
            </SidebarProvider>
        </div>
    );
}
