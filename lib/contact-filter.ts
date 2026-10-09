/**
 * Contact filter shared by the filter builder (UI), /api/contacts/filter and
 * campaigns. Evaluated in Postgres by public.filter_contacts(tenant, filter).
 */
export type FilterCondition = {
    id?: string; // UI only
    field: string;
    op: string;
    value?: unknown;
    key?: string; // custom field key
};

export type ContactFilter = {
    match: 'all' | 'any';
    conditions: FilterCondition[];
};

export const EMPTY_FILTER: ContactFilter = { match: 'all', conditions: [] };

/** Strips UI-only data and incomplete rules before sending to the server. */
export function cleanFilter(filter: ContactFilter): ContactFilter {
    return {
        match: filter.match === 'any' ? 'any' : 'all',
        conditions: filter.conditions
            .filter((c) => c.field && c.op)
            .map(({ field, op, value, key }) => ({ field, op, value: value ?? null, ...(key ? { key } : {}) })),
    };
}
