import { redirect } from 'next/navigation';
import { getTenantPlan } from '@/lib/tenant-plan';
import TemplatesClient from './templates-client';

export default async function TemplatesPage() {
    const plan = await getTenantPlan();
    if (plan === 'starter') redirect('/reservations');
    return <TemplatesClient />;
}
