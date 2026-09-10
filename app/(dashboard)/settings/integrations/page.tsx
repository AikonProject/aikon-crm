import { getTenantPlan } from '@/lib/tenant-plan';
import IntegrationsClient from './integrations-client';

export default async function IntegrationsPage() {
    const plan = await getTenantPlan();
    return <IntegrationsClient plan={plan} />;
}
