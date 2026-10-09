'use client';

import { createContext, useContext } from 'react';
import type { PlanModule } from '@/lib/types/database';
import type { BusinessType } from '@/lib/tenant-plan';

type TenantContextType = {
    tenantId: string;
    modules: PlanModule[];
    businessType: BusinessType;
};

const TenantContext = createContext<TenantContextType>({ tenantId: '', modules: [], businessType: 'general' });

export function TenantProvider({
    tenantId,
    modules,
    businessType,
    children,
}: {
    tenantId: string;
    modules: PlanModule[];
    businessType: BusinessType;
    children: React.ReactNode;
}) {
    return (
        <TenantContext.Provider value={{ tenantId, modules, businessType }}>
            {children}
        </TenantContext.Provider>
    );
}

export function useTenantId(): string {
    const { tenantId } = useContext(TenantContext);
    if (!tenantId) {
        throw new Error('useTenantId must be used within a TenantProvider');
    }
    return tenantId;
}

/** True if the current tenant's plan includes the module. */
export function useHasModule(module: PlanModule): boolean {
    return useContext(TenantContext).modules.includes(module);
}

export function useBusinessType(): BusinessType {
    return useContext(TenantContext).businessType;
}
