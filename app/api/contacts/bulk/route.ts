import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, isSuperAdmin, TenantError } from '@/lib/tenant';

const MAX_IDS = 5000;

/**
 * POST /api/contacts/bulk
 *   { action: 'delete', ids }                 → deletes the contacts (admins only) with their chats and history
 *   { action: 'add_tag' | 'remove_tag', ids, tag_id }
 *   { action: 'set_stage', ids, stage_id }        (null = sin etapa)
 *   { action: 'assign', ids, user_id }            (null = sin asignar)
 *   { action: 'set_ai', ids, ai_active }
 *   { action: 'set_field', ids, field_key, value } (empty value = clears the field)
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
            case 'set_stage':
            case 'assign':
            case 'set_ai': {
                let patch: Record<string, unknown>;
                let activity: { type: string; description: string } | null = null;
                if (body.action === 'set_stage') {
                    const stageId = body.stage_id ? String(body.stage_id) : null;
                    let stageName = 'sin etapa';
                    if (stageId) {
                        const { data: stage } = await supabase.from('funnel_stages').select('id, name').eq('id', stageId).eq('tenant_id', TENANT_ID).maybeSingle();
                        if (!stage) return NextResponse.json({ error: 'Etapa no encontrada.' }, { status: 404 });
                        stageName = stage.name as string;
                    }
                    patch = { funnel_stage_id: stageId };
                    activity = { type: 'stage_changed', description: `Movió el contacto a "${stageName}" (acción en lote)` };
                } else if (body.action === 'assign') {
                    const userId = body.user_id ? String(body.user_id) : null;
                    if (userId) {
                        const { data: user } = await supabase.from('users').select('id').eq('id', userId).eq('tenant_id', TENANT_ID).maybeSingle();
                        if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
                    }
                    patch = { assigned_to: userId };
                } else {
                    if (typeof body.ai_active !== 'boolean') return NextResponse.json({ error: 'Valor no válido.' }, { status: 400 });
                    patch = { ai_active: body.ai_active };
                    activity = {
                        type: body.ai_active ? 'ai_enabled' : 'ai_disabled',
                        description: `${body.ai_active ? 'Activó' : 'Desactivó'} la IA para el contacto (acción en lote)`,
                    };
                }
                for (let i = 0; i < owned.length; i += 500) {
                    const chunk = owned.slice(i, i + 500);
                    const { error } = await supabase.from('contacts')
                        .update({ ...patch, updated_at: new Date().toISOString() } as never)
                        .eq('tenant_id', TENANT_ID).in('id', chunk);
                    if (error) throw error;
                    // The chat's AI switch follows the contact's
                    if (body.action === 'set_ai') {
                        await supabase.from('conversations').update({ ai_enabled: body.ai_active } as never)
                            .eq('tenant_id', TENANT_ID).in('contact_id', chunk);
                    }
                    if (activity) {
                        await supabase.from('activity_log').insert(chunk.map((contact_id) => ({
                            tenant_id: TENANT_ID, contact_id, activity_type: activity!.type, description: activity!.description,
                        })) as never);
                    }
                }
                return NextResponse.json({ updated: owned.length });
            }
            case 'set_field': {
                const key = String(body.field_key ?? '');
                const { data: field } = await supabase.from('custom_fields').select('field_key').eq('tenant_id', TENANT_ID).eq('field_key', key).maybeSingle();
                if (!field) return NextResponse.json({ error: 'Campo no encontrado.' }, { status: 404 });
                const value = String(body.value ?? '').trim();
                for (let i = 0; i < owned.length; i += 500) {
                    const chunk = owned.slice(i, i + 500);
                    const { error } = value
                        ? await supabase.from('contact_field_values').upsert(chunk.map((contact_id) => ({
                            tenant_id: TENANT_ID, contact_id, field_key: key, value, updated_at: new Date().toISOString(),
                        })) as never, { onConflict: 'contact_id,field_key' })
                        : await supabase.from('contact_field_values').delete().eq('tenant_id', TENANT_ID).eq('field_key', key).in('contact_id', chunk);
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
