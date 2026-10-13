/**
 * Campaign template variables. Each {{var}} of the template body maps to:
 *   - fixed text, the same for every recipient: "Promo de octubre" or { type: 'text', value }
 *   - a contact field, resolved per recipient: { type: 'field', field, fallback? }
 *     field = 'nombre' | 'first_name' | 'wa_id' | 'email' | 'custom:<field_key>'
 */
export type VariableMapping =
    | string
    | { type: 'text'; value: string }
    | { type: 'field'; field: string; fallback?: string };

export type VariableMap = Record<string, VariableMapping>;

export const CONTACT_FIELD_OPTIONS = [
    { value: 'first_name', label: 'Primer nombre' },
    { value: 'nombre', label: 'Nombre completo' },
    { value: 'wa_id', label: 'Teléfono' },
    { value: 'email', label: 'Email' },
] as const;

export type ContactForVariables = {
    nombre: string | null;
    wa_id: string | null;
    email: string | null;
    custom?: Record<string, string | null | undefined>;
};

/** Custom field keys the mapping needs (to load only those values). */
export function customKeysOf(map: VariableMap): string[] {
    return [...new Set(Object.values(map ?? {})
        .filter((m): m is { type: 'field'; field: string } => typeof m === 'object' && m?.type === 'field' && m.field.startsWith('custom:'))
        .map((m) => m.field.slice('custom:'.length)))];
}

export function hasFieldVariables(map: VariableMap): boolean {
    return Object.values(map ?? {}).some((m) => typeof m === 'object' && m?.type === 'field');
}

function fieldValue(field: string, c: ContactForVariables): string {
    switch (field) {
        case 'nombre': return (c.nombre ?? '').trim();
        case 'first_name': return (c.nombre ?? '').trim().split(/\s+/)[0] ?? '';
        case 'wa_id': return c.wa_id ? `+${String(c.wa_id).replace(/\D/g, '')}` : '';
        case 'email': return (c.email ?? '').trim();
        default:
            if (field.startsWith('custom:')) return String(c.custom?.[field.slice(7)] ?? '').trim();
            return '';
    }
}

/** Final text of every variable for one contact (WhatsApp rejects empty parameters, so a fallback is always used). */
export function resolveVariables(map: VariableMap, contact: ContactForVariables | null): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, m] of Object.entries(map ?? {})) {
        if (typeof m === 'string') out[key] = m;
        else if (m?.type === 'text') out[key] = m.value ?? '';
        else if (m?.type === 'field') {
            const v = contact ? fieldValue(m.field, contact) : '';
            out[key] = v || (m.fallback ?? '').trim() || '-';
        }
    }
    return out;
}

/** Same values for everybody: fixed texts as is, contact fields as their fallback (legacy n8n flows). */
export function staticVariables(map: VariableMap): Record<string, string> {
    return resolveVariables(map, null);
}
