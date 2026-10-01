import { getTenantConfig } from '@/lib/tenant-plan';
import DashboardClient from './dashboard-client';

export default async function DashboardPage() {
    const config = await getTenantConfig();
    return <DashboardClient plan={config.plan} businessType={config.businessType} />;
}
