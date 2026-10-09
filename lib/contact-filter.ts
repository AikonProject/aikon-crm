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

/** Operators that don't take a value. */
const NO_VALUE_OPS = new Set(['empty', 'not_empty', 'never', 'ever', 'unread', 'open', 'resolved', 'none', 'birthday_today']);

function hasValue(c: FilterCondition): boolean {
    if (NO_VALUE_OPS.has(c.op) && c.field !== 'campaign') return true;
    const v = c.value;
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0 && v.every((x) => x !== '' && x !== null && x !== undefined);
    return true;
}

/** Strips UI-only data and incomplete rules (not filled in yet) before sending to the server. */
export function cleanFilter(filter: ContactFilter): ContactFilter {
    return {
        match: filter.match === 'any' ? 'any' : 'all',
        conditions: (filter.conditions ?? [])
            .filter((c) => c.field && c.op && (c.field !== 'custom' || c.key) && hasValue(c))
            .map(({ field, op, value, key }) => ({ field, op, value: value ?? null, ...(key ? { key } : {}) })),
    };
}
