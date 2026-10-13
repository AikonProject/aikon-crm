import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, isSuperAdmin, TenantError } from '@/lib/tenant';

const MAX_IDS = 5000;

/**
 * POST /api/contacts/bulk
 *   { action: 'delete', ids }                 → deletes the contacts (admins only) with their chats and history
 *   { action: 'add_tag' | 'remove_tag', ids, tag_id }
 */
export async function POST(req: NextRequest) {
    try {
        const TENANT_ID = await getServerTenantId();
        const body = await req.json().catch(() => ({}));
        const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : [];
        if (ids.length === 0) return NextResponse.json({ error: 'No hay contactos seleccionados.' }, { status: 400 });
        if (ids.length > MAX_IDS) return NextResponse.json({ error: `Máximo ${MAX_IDS} contactos por operación.` }, { status: 400 });

        const supabase = createAdminClient();
        // Only contacts of this tenant
        const owned: string[] = [];
        for (let i = 0; i < ids.length; i += 500) {
            const { data, error } = await supabase.from('contacts').select('id').eq('tenant_id', TENANT_ID).in('id', ids.slice(i, i + 500));
            if (error) throw error;
            owned.push(...(data ?? []).map((c) => c.id as string));
        }
        if (owned.length === 0) return NextResponse.json({ error: 'Contactos no encontrados.' }, { status: 404 });

        switch (body.action) {
            case 'delete': {
                const { orgRole } = await auth();
                if (orgRole !== 'org:admin' && !(await isSuperAdmin())) {
                    return NextResponse.json({ error: 'Solo un administrador puede eliminar contactos.' }, { status: 403 });
                }
                // Conversations, messages, notes, tags and campaign rows go with them (ON DELETE CASCADE);
                // appointments, reservations and orders stay without contact.
                for (let i = 0; i < owned.length; i += 200) {
                    const { error } = await supabase.from('contacts').delete().eq('tenant_id', TENANT_ID).in('id', owned.slice(i, i + 200));
                    if (error) throw error;
                }
                return NextResponse.json({ deleted: owned.length });
            }
            case 'add_tag':
            case 'remove_tag': {
                const tagId = String(body.tag_id ?? '');
                const { data: tag } = await supabase.from('tags').select('id').eq('id', tagId).eq('tenant_id', TENANT_ID).maybeSingle();
                if (!tag) return NextResponse.json({ error: 'Etiqueta no encontrada.' }, { status: 404 });
                for (let i = 0; i < owned.length; i += 500) {
                    const chunk = owned.slice(i, i + 500);
                    const { error } = body.action === 'add_tag'
                        ? await supabase.from('contact_tags').upsert(chunk.map((contact_id) => ({ contact_id, tag_id: tagId })) as never, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
                        : await supabase.from('contact_tags').delete().eq('tag_id', tagId).in('contact_id', chunk);
                    if (error) throw error;
                }
                return NextResponse.json({ updated: owned.length });
            }
            default:
                return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
        }
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/contacts/bulk]', err);
        return NextResponse.json({ error: 'No se pudo completar la operación.' }, { status: 500 });
    }
}
