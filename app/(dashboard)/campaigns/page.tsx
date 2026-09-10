import { redirect } from 'next/navigation';
import { getTenantPlan } from '@/lib/tenant-plan';
import CampaignsClient from './campaigns-client';

export default async function CampaignsPage() {
    const plan = await getTenantPlan();
    if (plan === 'starter') redirect('/reservations');
    return <CampaignsClient />;
}
