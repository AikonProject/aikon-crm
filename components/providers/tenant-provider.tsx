'use client';

import { createContext, useContext } from 'react';

type TenantContextType = {
    tenantId: string;
};

const TenantContext = createContext<TenantContextType>({ tenantId: '' });

export function TenantProvider({
    tenantId,
    children,
}: {
    tenantId: string;
    children: React.ReactNode;
}) {
    return (
        <TenantContext.Provider value={{ tenantId }}>
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
