import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';

type ImportRow = {
    nombre: string;
    email?: string | null;
    wa_id?: string | null;
    source?: string | null;
    /** custom field values by field_key */
    custom?: Record<string, string | null | undefined>;
};

type Source = 'whatsapp' | 'web' | 'manual' | 'csv' | 'n8n';
const VALID_SOURCES = new Set<Source>(['whatsapp', 'web', 'manual', 'csv', 'n8n']);

/** WhatsApp ids are digits with country code (as they arrive from WhatsApp). */
function normalizePhone(raw: string | null | undefined, countryCode: string): string | null {
    let digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('00')) digits = digits.slice(2);
    // Local number without country code (e.g. 3001234567 in Colombia)
    if (countryCode && digits.length <= 10 && !digits.startsWith(countryCode)) digits = countryCode + digits;
    return digits.length >= 8 ? digits : null;
}

// ---------------------------------------------------------------------------
// POST /api/contacts/import — bulk create contacts from CSV rows
// { rows, tag_ids?, new_tag?: { name, color? }, defaults?: { field_key: value }, update_existing?, country_code? }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const rows: ImportRow[] = body.rows;

        if (!Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json(
                { error: 'Se requiere un arreglo "rows" con al menos una fila.' },
                { status: 400 }
            );
        }
        if (rows.length > 20000) {
            return NextResponse.json({ error: 'Máximo 20.000 filas por importación.' }, { status: 400 });
        }

        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();
        const countryCode = String(body.country_code ?? '').replace(/\D/g, '');
        const updateExisting = body.update_existing === true;
        const defaults: Record<string, string> = Object.fromEntries(
            Object.entries((body.defaults ?? {}) as Record<string, unknown>)
                .map(([k, v]) => [k, String(v ?? '').trim()])
                .filter(([, v]) => v !== '')
        );

        // Only custom fields that exist in this tenant
        const { data: fieldDefs } = await supabase.from('custom_fields').select('field_key').eq('tenant_id', TENANT_ID);
        const validKeys = new Set((fieldDefs ?? []).map((f) => f.field_key as string));

        // Tags to apply: existing ones + a new one created now (or reused if the name exists)
        const tagIds = new Set<string>();
        if (Array.isArray(body.tag_ids) && body.tag_ids.length) {
            const { data: tags } = await supabase.from('tags').select('id').eq('tenant_id', TENANT_ID).in('id', body.tag_ids);
            for (const t of tags ?? []) tagIds.add(t.id as string);
        }
        type TagRow = { id: string; name: string; color: string | null };
        let createdTag: TagRow | null = null;
        const newTagName = String(body.new_tag?.name ?? '').trim();
        if (newTagName) {
            const { data: same } = await supabase.from('tags').select('id, name, color').eq('tenant_id', TENANT_ID).ilike('name', newTagName).maybeSingle();
            if (same) createdTag = same as TagRow;
            else {
                const { data: t, error } = await supabase.from('tags')
                    .insert({ tenant_id: TENANT_ID, name: newTagName, color: body.new_tag?.color ?? '#818CF8' })
                    .select('id, name, color').single();
                if (error) throw error;
                createdTag = t as TagRow;
            }
            tagIds.add(createdTag!.id);
        }

        // Existing contacts, to detect duplicates by phone or email
        const existingByPhone = new Map<string, string>();
        const existingByEmail = new Map<string, string>();
        for (let from = 0; ; from += 1000) {
            const { data: page } = await supabase
                .from('contacts')
                .select('id, email, wa_id')
                .eq('tenant_id', TENANT_ID)
                .range(from, from + 999);
            for (const c of page ?? []) {
                if (c.wa_id) existingByPhone.set(String(c.wa_id).replace(/\D/g, ''), c.id as string);
                if (c.email) existingByEmail.set(String(c.email).toLowerCase(), c.id as string);
            }
            if (!page || page.length < 1000) break;
        }

        const toInsert: { tenant_id: string; nombre: string; email: string | null; wa_id: string | null; source: Source; lead_score: number }[] = [];
        const insertCustom: Record<string, string>[] = [];
        const existingToUpdate: { id: string; custom: Record<string, string> }[] = [];
        let skipped = 0;
        const errors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i] ?? ({} as ImportRow);
            const nombre = row.nombre?.trim();
            const email = row.email?.trim() || null;
            const waId = normalizePhone(row.wa_id, countryCode);
            if (!nombre && !waId) {
                errors.push(`Fila ${i + 2}: sin nombre ni teléfono`);
                skipped++;
                continue;
            }
            const custom: Record<string, string> = { ...defaults };
            for (const [k, v] of Object.entries(row.custom ?? {})) {
                const val = String(v ?? '').trim();
                if (val !== '') custom[k] = val;
            }
            for (const k of Object.keys(custom)) if (!validKeys.has(k)) delete custom[k];

            const existingId = (waId && existingByPhone.get(waId)) || (email && existingByEmail.get(email.toLowerCase())) || null;
            if (existingId) {
                if (updateExisting) existingToUpdate.push({ id: existingId, custom });
                else skipped++;
                continue;
            }

            const source = VALID_SOURCES.has(row.source as Source) ? (row.source as Source) : 'csv';
            toInsert.push({ tenant_id: TENANT_ID, nombre: nombre || waId!, email, wa_id: waId, source, lead_score: 0 });
            insertCustom.push(custom);
            // Avoid duplicates inside the same file
            if (waId) existingByPhone.set(waId, 'pending');
            if (email) existingByEmail.set(email.toLowerCase(), 'pending');
        }

        // Insert new contacts (the DB trigger creates their conversations)
        const newContacts: { id: string; custom: Record<string, string> }[] = [];
        let created = 0;
        const BATCH_SIZE = 200;
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
            const batch = toInsert.slice(i, i + BATCH_SIZE);
            const { data, error } = await supabase.from('contacts').insert(batch).select('id');
            if (error || !data) {
                console.error('[POST /api/contacts/import] batch error', error);
                errors.push(`Error al insertar lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error?.message ?? 'sin respuesta'}`);
                continue;
            }
            created += data.length;
            // RETURNING keeps the order of the VALUES list
            data.forEach((c, j) => newContacts.push({ id: c.id as string, custom: insertCustom[i + j] ?? {} }));
        }

        const touched = [...newContacts, ...existingToUpdate];

        // Tags
        if (tagIds.size > 0 && touched.length > 0) {
            const links = touched.flatMap((c) => [...tagIds].map((tag_id) => ({ contact_id: c.id, tag_id })));
            for (let i = 0; i < links.length; i += 1000) {
                const { error } = await supabase.from('contact_tags')
                    .upsert(links.slice(i, i + 1000) as never, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true });
                if (error) errors.push(`No se pudieron asignar etiquetas: ${error.message}`);
            }
        }

        // Custom fields (overwrites the value of existing contacts when update_existing)
        const values = touched.flatMap((c) => Object.entries(c.custom).map(([field_key, value]) => ({
            tenant_id: TENANT_ID, contact_id: c.id, field_key, value, updated_at: new Date().toISOString(),
        })));
        for (let i = 0; i < values.length; i += 1000) {
            const { error } = await supabase.from('contact_field_values')
                .upsert(values.slice(i, i + 1000) as never, { onConflict: 'contact_id,field_key' });
            if (error) errors.push(`No se pudieron guardar campos personalizados: ${error.message}`);
        }

        return NextResponse.json({
            created,
            updated: existingToUpdate.length,
            skipped,
            errors,
            total: rows.length,
            tag: createdTag,
        });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/contacts/import] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
