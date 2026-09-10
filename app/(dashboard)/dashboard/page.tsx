import { getTenantPlan } from '@/lib/tenant-plan';
import DashboardClient from './dashboard-client';

export default async function DashboardPage() {
    const plan = await getTenantPlan();
    return <DashboardClient plan={plan} />;
}
