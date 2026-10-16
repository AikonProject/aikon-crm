import type { createAdminClient } from '@/lib/supabase/admin';
import { getTenantConfig, hasModule } from '@/lib/tenant-plan';
import { APPOINTMENT_SELECT } from '@/lib/appointments';
import { buildAppointmentFields, formatWhen } from '@/app/api/appointments/shared';
import type { PlanModule } from '@/lib/types/database';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * CRM tools for the AI agent (n8n). Every write goes through here so the CRM
 * stays the only writer to Supabase, and every call is recorded:
 *   - ai_actions: full audit (tool, input, result, reason, status)
 *   - activity_log: what the team sees in the chat / contact timeline ("IA ...")
 */

export class ToolError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

export type ToolContext = {
    supabase: Admin;
    tenantId: string;
    contact: { id: string; nombre: string; wa_id: string | null; funnel_stage_id: string | null };
    conversationId: string | null;
    body: Record<string, unknown>;
    /** Lines for the timeline (each becomes one activity_log entry). */
    log: (type: string, description: string, metadata?: Record<string, unknown>, contactId?: string) => void;
};

export type ToolResult = { summary: string; data?: unknown; stageBefore?: string | null; stageAfter?: string | null };

export type Tool = { module?: PlanModule; write: boolean; run: (ctx: ToolContext) => Promise<ToolResult> };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const list = (v: unknown): string[] =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((x) => str(x)).filter(Boolean);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
/** "950.000", "950,000", "$1.250.000,50", "95000" → number (NaN if not a price). */
export function parseMoney(v: unknown): number {
    if (typeof v === 'number') return v;
    let t = str(v).replace(/[^\d.,-]/g, '');
    if (!t) return NaN;
    const lastDot = t.lastIndexOf('.');
    const lastComma = t.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
        // Both: the last one is the decimal separator
        const dec = lastDot > lastComma ? '.' : ',';
        t = t.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
    } else if (lastDot >= 0 || lastComma >= 0) {
        const sep = lastDot >= 0 ? '.' : ',';
        const parts = t.split(sep);
        // 950.000 / 1,250,000 → thousands; 95.5 / 95,50 → decimals
        t = parts.length > 2 || parts[parts.length - 1].length === 3 ? parts.join('') : parts.join('.');
    }
    return Number(t);
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ─── Lookups by id or by name (the agent usually knows names) ─────────────────

async function findStage(supabase: Admin, tenantId: string, ref: string) {
    const { data } = await supabase.from('funnel_stages').select('id, name').eq('tenant_id', tenantId);
    const rows = (data ?? []) as { id: string; name: string }[];
    return rows.find((s) => s.id === ref) ?? rows.find((s) => norm(s.name) === norm(ref)) ?? null;
}

async function stageName(supabase: Admin, id: string | null) {
    if (!id) return null;
    const { data } = await supabase.from('funnel_stages').select('name').eq('id', id).maybeSingle();
    return (data?.name as string | undefined) ?? null;
}

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOLS: Record<'context' | 'update_contact' | 'tags' | 'stage' | 'fields' | 'note' | 'appointment' | 'deal' | 'order' | 'handoff', Tool> = {
    /** Everything the agent may need to decide: contact, stage, tags, fields, deals, orders, appointments and catalogs. */
    context: {
        write: false,
        async run({ supabase, tenantId, contact }) {
            const config = await getTenantConfig(tenantId);
            const has = (m: PlanModule) => hasModule(config, m);
            const [full, tags, values, defs, stages, allTags, notes, deals, orders, appts, products] = await Promise.all([
                supabase.from('contacts').select('id, nombre, email, wa_id, job_title, ai_active, lead_score, assigned_to, funnel_stage_id, created_at, last_incoming_at').eq('id', contact.id).single(),
                supabase.from('contact_tags').select('tag:tags ( id, name )').eq('contact_id', contact.id),
                supabase.from('contact_field_values').select('field_key, value').eq('contact_id', contact.id),
                supabase.from('custom_fields').select('field_key, label, field_type, options').eq('tenant_id', tenantId).order('position'),
                supabase.from('funnel_stages').select('id, name, position').eq('tenant_id', tenantId).order('position'),
                supabase.from('tags').select('id, name').eq('tenant_id', tenantId).order('name'),
                supabase.from('contact_notes').select('content, created_at').eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(5),
                has('funnel') ? supabase.from('deals').select('id, name, price, currency, quantity, status, created_at').eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(10) : Promise.resolve({ data: null }),
                has('orders') ? supabase.from('orders').select('id, status, total, currency, created_at, order_items ( product_name, quantity, unit_price )').eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(5) : Promise.resolve({ data: null }),
                has('appointments') ? supabase.from('appointments').select('id, title, start_time, end_time, status, meeting_type, meeting_url, location').eq('contact_id', contact.id).gte('end_time', new Date().toISOString()).order('start_time').limit(10) : Promise.resolve({ data: null }),
                has('orders') ? supabase.from('products').select('id, name, price, sku, description').eq('tenant_id', tenantId).eq('is_active', true).order('name').limit(100) : Promise.resolve({ data: null }),
            ]);
            const c = full.data as Record<string, unknown> | null;
            const stageList = (stages.data ?? []) as { id: string; name: string }[];
            return {
                summary: 'Consultó el contacto',
                data: {
                    contact: c && {
                        ...c,
                        stage: stageList.find((s) => s.id === c.funnel_stage_id)?.name ?? null,
                        tags: ((tags.data ?? []) as unknown as { tag: { name: string } | null }[]).map((t) => t.tag?.name).filter(Boolean),
                        custom_fields: Object.fromEntries(((values.data ?? []) as { field_key: string; value: string }[]).map((v) => [v.field_key, v.value])),
                    },
                    recent_notes: notes.data ?? [],
                    deals: deals.data ?? undefined,
                    orders: orders.data ?? undefined,
                    upcoming_appointments: appts.data ?? undefined,
                    catalog: {
                        modules: config.modules,
                        stages: stageList.map((s) => s.name),
                        tags: ((allTags.data ?? []) as { name: string }[]).map((t) => t.name),
                        custom_fields: defs.data ?? [],
                        products: products.data ?? undefined,
                    },
                },
            };
        },
    },

    /** Contact data the customer gave: name, email, job title. */
    update_contact: {
        write: true,
        async run({ supabase, tenantId, contact, body, log }) {
            const patch: Record<string, unknown> = {};
            const nombre = str(body.nombre ?? body.name);
            const email = str(body.email);
            const jobTitle = str(body.job_title);
            if (nombre) patch.nombre = nombre.slice(0, 200);
            if (email) {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ToolError('El correo no es válido.');
                patch.email = email.toLowerCase();
            }
            if (jobTitle) patch.job_title = jobTitle.slice(0, 200);
            if (Object.keys(patch).length === 0) throw new ToolError('Nada que actualizar: envía nombre, email o job_title.');
            const { error } = await supabase.from('contacts').update({ ...patch, updated_at: new Date().toISOString() } as never)
                .eq('id', contact.id).eq('tenant_id', tenantId);
            if (error) throw error;
            const what = Object.entries(patch).map(([k, v]) => `${k === 'nombre' ? 'nombre' : k === 'job_title' ? 'cargo' : k}: ${v}`).join(', ');
            log('contact_updated', `IA actualizó el contacto (${what})`, patch);
            return { summary: `Actualizó el contacto (${what})`, data: patch };
        },
    },

    /** Adds / removes tags by name or id. Unknown names are created when create_missing is true (default). */
    tags: {
        write: true,
        async run({ supabase, tenantId, contact, body, log }) {
            const add = list(body.add);
            const remove = list(body.remove);
            if (!add.length && !remove.length) throw new ToolError('Envía "add" y/o "remove" con nombres de etiquetas.');
            const createMissing = body.create_missing !== false;
            const { data } = await supabase.from('tags').select('id, name').eq('tenant_id', tenantId);
            const all = (data ?? []) as { id: string; name: string }[];
            const resolve = (ref: string) => all.find((t) => t.id === ref) ?? all.find((t) => norm(t.name) === norm(ref));

            const added: string[] = [];
            const missing: string[] = [];
            for (const ref of add) {
                let tag = resolve(ref);
                if (!tag && createMissing && !isUuid(ref)) {
                    const { data: created, error } = await supabase.from('tags')
                        .insert({ tenant_id: tenantId, name: ref.slice(0, 50), color: '#818CF8' }).select('id, name').single();
                    if (error) throw error;
                    tag = created as { id: string; name: string };
                    all.push(tag);
                }
                if (!tag) { missing.push(ref); continue; }
                await supabase.from('contact_tags').upsert({ contact_id: contact.id, tag_id: tag.id } as never, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true });
                added.push(tag.name);
            }
            const removed: string[] = [];
            for (const ref of remove) {
                const tag = resolve(ref);
                if (!tag) continue;
                await supabase.from('contact_tags').delete().eq('contact_id', contact.id).eq('tag_id', tag.id);
                removed.push(tag.name);
            }
            const parts = [added.length ? `agregó ${added.join(', ')}` : '', removed.length ? `quitó ${removed.join(', ')}` : ''].filter(Boolean);
            if (parts.length) log('tags_updated', `IA ${parts.join(' y ')} (etiquetas)`, { added, removed });
            return { summary: parts.length ? `Etiquetas: ${parts.join(' y ')}` : 'Sin cambios en etiquetas', data: { added, removed, not_found: missing } };
        },
    },

    /** Moves the contact to a funnel stage (by name or id). */
    stage: {
        module: 'funnel',
        write: true,
        async run({ supabase, tenantId, contact, body, log }) {
            const ref = str(body.stage ?? body.stage_id ?? body.stage_name);
            if (!ref) throw new ToolError('Envía "stage" con el nombre de la etapa.');
            const stage = await findStage(supabase, tenantId, ref);
            if (!stage) {
                const { data } = await supabase.from('funnel_stages').select('name').eq('tenant_id', tenantId).order('position');
                throw new ToolError(`No existe la etapa "${ref}". Etapas: ${(data ?? []).map((s) => s.name).join(', ')}`, 404);
            }
            const before = await stageName(supabase, contact.funnel_stage_id);
            if (contact.funnel_stage_id === stage.id) return { summary: `Ya estaba en "${stage.name}"`, stageBefore: before, stageAfter: stage.name };
            const { error } = await supabase.from('contacts').update({ funnel_stage_id: stage.id, updated_at: new Date().toISOString() } as never)
                .eq('id', contact.id).eq('tenant_id', tenantId);
            if (error) throw error;
            log('stage_changed', `IA movió el contacto a "${stage.name}"${before ? ` (antes: ${before})` : ''}`, { from: before, to: stage.name });
            return { summary: `Movió a "${stage.name}"`, stageBefore: before, stageAfter: stage.name, data: { stage: stage.name } };
        },
    },

    /** Sets custom fields by key or label: { fields: { ciudad: "Bogotá", plan: "Pro" } }. Empty value clears it. */
    fields: {
        write: true,
        async run({ supabase, tenantId, contact, body, log }) {
            const input = (body.fields && typeof body.fields === 'object' ? body.fields : {}) as Record<string, unknown>;
            if (!Object.keys(input).length) throw new ToolError('Envía "fields" con { campo: valor }.');
            const { data } = await supabase.from('custom_fields').select('field_key, label, field_type, options').eq('tenant_id', tenantId);
            const defs = (data ?? []) as { field_key: string; label: string; field_type: string; options: unknown }[];
            const saved: Record<string, string | null> = {};
            const unknown: string[] = [];
            for (const [ref, raw] of Object.entries(input)) {
                const def = defs.find((d) => d.field_key === ref) ?? defs.find((d) => norm(d.label) === norm(ref));
                if (!def) { unknown.push(ref); continue; }
                const value = str(raw);
                const opts = Array.isArray(def.options) ? (def.options as string[]) : [];
                if (value && opts.length) {
                    const match = opts.find((o) => norm(o) === norm(value));
                    if (!match) throw new ToolError(`"${value}" no es una opción de ${def.label}. Opciones: ${opts.join(', ')}`);
                    saved[def.field_key] = match;
                } else if (value && def.field_type === 'number' && Number.isNaN(Number(value.replace(',', '.')))) {
                    throw new ToolError(`${def.label} debe ser un número.`);
                } else {
                    saved[def.field_key] = value || null;
                }
            }
            for (const [field_key, value] of Object.entries(saved)) {
                if (value === null) {
                    await supabase.from('contact_field_values').delete().eq('contact_id', contact.id).eq('field_key', field_key);
                } else {
                    const { error } = await supabase.from('contact_field_values').upsert({
                        tenant_id: tenantId, contact_id: contact.id, field_key, value, updated_at: new Date().toISOString(),
                    } as never, { onConflict: 'contact_id,field_key' });
                    if (error) throw error;
                }
            }
            const label = (k: string) => defs.find((d) => d.field_key === k)?.label ?? k;
            const desc = Object.entries(saved).map(([k, v]) => `${label(k)}: ${v ?? '(vacío)'}`).join(', ');
            if (desc) log('fields_updated', `IA actualizó ${desc}`, saved);
            return { summary: desc ? `Campos: ${desc}` : 'Sin cambios', data: { saved, not_found: unknown, available: defs.map((d) => d.label) } };
        },
    },

    /** Internal note (not sent to WhatsApp): shown in the chat as "Nota de la IA" and in the contact's notes. */
    note: {
        write: true,
        async run({ supabase, tenantId, contact, conversationId, body }) {
            const content = str(body.content ?? body.note);
            if (!content) throw new ToolError('Envía "content" con el texto de la nota.');
            if (conversationId) {
                await supabase.from('messages').insert({
                    tenant_id: tenantId, conversation_id: conversationId, contact_id: contact.id,
                    direction: 'outbound', content_type: 'text', content: content.slice(0, 4000),
                    status: 'sent', sender_type: 'bot', sent_by_name: 'IA', is_note: true,
                } as never);
            }
            const { error } = await supabase.from('contact_notes').insert({ tenant_id: tenantId, contact_id: contact.id, content: `🤖 ${content.slice(0, 4000)}`, created_by: null });
            if (error) throw error;
            return { summary: `Nota: ${content.slice(0, 80)}` };
        },
    },

    /** Creates an appointment, or updates / reschedules / cancels one when "id" is sent. */
    appointment: {
        module: 'appointments',
        write: true,
        async run({ supabase, tenantId, contact, body, log }) {
            const input = { ...((body.appointment && typeof body.appointment === 'object' ? body.appointment : body) as Record<string, unknown>) };
            for (const k of ['tenant_id', 'contact_id', 'wa_id', 'phone', 'conversation_id', 'reason']) delete input[k];
            input.contact_id = contact.id;
            const isUpdate = typeof input.id === 'string' && input.id.length > 0;
            let before: { title: string; start_time: string } | null = null;
            if (isUpdate) {
                const { data } = await supabase.from('appointments').select('title, start_time')
                    .eq('id', input.id as string).eq('tenant_id', tenantId).eq('contact_id', contact.id).maybeSingle();
                if (!data) throw new ToolError('Cita no encontrada para este contacto.', 404);
                before = data;
            } else if (!input.title) {
                input.title = `Cita con ${contact.nombre}`;
            }
            const { fields } = await buildAppointmentFields(supabase, tenantId, input, isUpdate);
            if (!isUpdate && new Date(fields.end_time as string) <= new Date(fields.start_time as string)) {
                throw new ToolError('end_time debe ser posterior a start_time.');
            }
            const result = isUpdate
                ? await supabase.from('appointments').update(fields as never).eq('id', input.id as string).eq('tenant_id', tenantId).select(APPOINTMENT_SELECT).single()
                : await supabase.from('appointments').insert({ ...fields, tenant_id: tenantId, created_by: 'IA' } as never).select(APPOINTMENT_SELECT).single();
            if (result.error) throw result.error;
            const saved = result.data as unknown as { id: string; title: string; status: string; start_time: string };
            const when = formatWhen(saved.start_time ?? before?.start_time);
            const desc = !isUpdate
                ? `IA agendó "${saved.title}" para el ${when}`
                : saved.status === 'cancelled' ? `IA canceló la cita "${saved.title}"` : `IA actualizó la cita "${saved.title}" (${when})`;
            log(isUpdate ? 'appointment_updated' : 'appointment_created', desc, { appointment_id: saved.id });
            return { summary: desc.replace(/^IA /, ''), data: { appointment: result.data } };
        },
    },

    /** Creates a deal (sale opportunity), or updates one when "id" is sent. status: pending | paid | completed | cancelled */
    deal: {
        module: 'funnel',
        write: true,
        async run({ supabase, tenantId, contact, body, log }) {
            const id = str(body.id);
            const patch: Record<string, unknown> = {};
            if (body.name !== undefined) patch.name = str(body.name).slice(0, 200);
            if (body.description !== undefined) patch.description = str(body.description) || null;
            if (body.notes !== undefined) patch.notes = str(body.notes) || null;
            if (body.price !== undefined) {
                const p = parseMoney(body.price);
                if (Number.isNaN(p) || p < 0) throw new ToolError('price no es un número válido.');
                patch.price = p;
            }
            if (body.quantity !== undefined) patch.quantity = Math.max(1, Math.round(Number(body.quantity) || 1));
            if (body.currency !== undefined) patch.currency = str(body.currency).toUpperCase().slice(0, 3) || 'COP';
            if (body.status !== undefined) {
                const s = str(body.status).toLowerCase();
                // pending = en negociación, paid = pagado / vendido, completed = entregado, cancelled = perdido
                const DEAL_STATUSES = ['pending', 'paid', 'completed', 'cancelled'];
                if (!DEAL_STATUSES.includes(s)) throw new ToolError(`status debe ser uno de: ${DEAL_STATUSES.join(', ')}`);
                patch.status = s;
                if (s === 'paid' || s === 'completed') patch.sold_at = new Date().toISOString();
            }

            if (id) {
                const { data, error } = await supabase.from('deals').update({ ...patch, updated_at: new Date().toISOString() } as never)
                    .eq('id', id).eq('tenant_id', tenantId).eq('contact_id', contact.id).select().maybeSingle();
                if (error) throw error;
                if (!data) throw new ToolError('Deal no encontrado para este contacto.', 404);
                const d = data as { name: string; status: string };
                log('deal_updated', `IA actualizó el deal "${d.name}"${patch.status ? ` (${d.status})` : ''}`, { deal_id: id, ...patch });
                return { summary: `Actualizó el deal "${d.name}"`, data: { deal: data } };
            }
            if (!patch.name) throw new ToolError('Envía "name" para crear el deal.');
            const { data, error } = await supabase.from('deals').insert({
                tenant_id: tenantId, contact_id: contact.id, currency: 'COP', quantity: 1, status: 'pending', ...patch,
            } as never).select().single();
            if (error) throw error;
            const d = data as { id: string; name: string; price: number | null; currency: string };
            log('deal_created', `IA creó el deal "${d.name}"${d.price != null ? ` por ${d.price} ${d.currency}` : ''}`, { deal_id: d.id });
            return { summary: `Creó el deal "${d.name}"`, data: { deal: data } };
        },
    },

    /**
     * Creates an order: { items: [{ product_id? | product_name, quantity, unit_price? }], notes?, discount? }.
     * Prices come from the catalog when the product exists. With "id" + "status" it changes an order's status.
     */
    order: {
        module: 'orders',
        write: true,
        async run({ supabase, tenantId, contact, conversationId, body, log }) {
            const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'completed', 'cancelled'];
            const id = str(body.id);
            if (id) {
                const status = str(body.status).toLowerCase();
                if (!STATUSES.includes(status)) throw new ToolError(`status debe ser uno de: ${STATUSES.join(', ')}`);
                const { data, error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() } as never)
                    .eq('id', id).eq('tenant_id', tenantId).eq('contact_id', contact.id).select('id, status, total').maybeSingle();
                if (error) throw error;
                if (!data) throw new ToolError('Pedido no encontrado para este contacto.', 404);
                log('order_updated', `IA cambió el pedido a "${status}"`, { order_id: id });
                return { summary: `Pedido → ${status}`, data: { order: data } };
            }

            const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
            if (!items.length) throw new ToolError('Envía "items" con al menos un producto.');
            const { data: catalog } = await supabase.from('products').select('id, name, price').eq('tenant_id', tenantId).eq('is_active', true);
            const products = (catalog ?? []) as { id: string; name: string; price: number | null }[];
            const rows = items.map((it, i) => {
                const ref = str(it.product_id ?? it.product_name ?? it.name);
                const product = products.find((p) => p.id === ref) ?? products.find((p) => norm(p.name) === norm(ref));
                const quantity = Math.round(Number(it.quantity ?? 1));
                if (!ref) throw new ToolError(`El artículo ${i + 1} no tiene producto.`);
                if (!(quantity > 0)) throw new ToolError(`La cantidad de "${ref}" debe ser mayor a 0.`);
                const unit = it.unit_price !== undefined && it.unit_price !== null && it.unit_price !== ''
                    ? parseMoney(it.unit_price)
                    : product?.price ?? NaN;
                if (Number.isNaN(unit) || unit < 0) throw new ToolError(`No hay precio para "${ref}": envía unit_price o usa un producto del catálogo.`);
                return { product_id: product?.id ?? null, product_name: product?.name ?? ref, quantity, unit_price: unit, subtotal: quantity * unit, notes: str(it.notes) || null };
            });
            const subtotal = rows.reduce((s, r) => s + r.subtotal, 0);
            const discount = Math.max(0, parseMoney(body.discount ?? 0) || 0);
            const { data: order, error } = await supabase.from('orders').insert({
                tenant_id: tenantId, contact_id: contact.id, conversation_id: conversationId, status: 'pending',
                subtotal, discount, total: Math.max(0, subtotal - discount), currency: str(body.currency).toUpperCase() || 'COP',
                notes: str(body.notes) || null, source: 'whatsapp',
            } as never).select('id, total, currency').single();
            if (error) throw error;
            const o = order as unknown as { id: string; total: number; currency: string };
            const { error: itemsError } = await supabase.from('order_items').insert(rows.map((r) => ({ ...r, order_id: o.id })) as never);
            if (itemsError) {
                await supabase.from('orders').delete().eq('id', o.id).eq('tenant_id', tenantId);
                throw itemsError;
            }
            const desc = rows.map((r) => `${r.quantity}× ${r.product_name}`).join(', ');
            log('order_created', `IA creó un pedido: ${desc} (total ${o.total} ${o.currency})`, { order_id: o.id });
            return { summary: `Pedido: ${desc} · total ${o.total} ${o.currency}`, data: { order: { ...o, items: rows } } };
        },
    },

    /** Passes the chat to a human: AI off, optional assignment, reason as a note. */
    handoff: {
        write: true,
        async run({ supabase, tenantId, contact, conversationId, body, log }) {
            const reason = str(body.reason ?? body.content) || 'El cliente necesita atención de una persona';
            await supabase.from('contacts').update({ ai_active: false, updated_at: new Date().toISOString() } as never).eq('id', contact.id).eq('tenant_id', tenantId);
            await supabase.from('conversations').update({ ai_enabled: false } as never).eq('contact_id', contact.id).eq('tenant_id', tenantId);
            let assigned: string | null = null;
            const assignRef = str(body.assign_to);
            if (assignRef) {
                const { data: users } = await supabase.from('users').select('id, full_name, email').eq('tenant_id', tenantId);
                const u = ((users ?? []) as { id: string; full_name: string | null; email: string | null }[])
                    .find((x) => x.id === assignRef || norm(x.full_name ?? '') === norm(assignRef) || norm(x.email ?? '') === norm(assignRef));
                if (u) {
                    await supabase.from('contacts').update({ assigned_to: u.id } as never).eq('id', contact.id).eq('tenant_id', tenantId);
                    if (conversationId) await supabase.from('conversations').update({ assigned_to: u.id } as never).eq('id', conversationId);
                    assigned = u.full_name || u.email;
                }
            }
            if (conversationId) {
                await supabase.from('messages').insert({
                    tenant_id: tenantId, conversation_id: conversationId, contact_id: contact.id,
                    direction: 'outbound', content_type: 'text', content: `Transferido a una persona: ${reason}`,
                    status: 'sent', sender_type: 'bot', sent_by_name: 'IA', is_note: true,
                } as never);
            }
            log('ai_disabled', `IA transfirió a humano${assigned ? ` (${assigned})` : ''}: ${reason}`, { reason, assigned_to: assigned });
            return { summary: `Transfirió a humano${assigned ? ` (${assigned})` : ''}`, data: { ai_active: false, assigned_to: assigned } };
        },
    },
};

/** Implementations reused by the tool catalog (lib/bot/catalog.ts), which adds names, schemas and logging. */
export const IMPL = TOOLS;
export { str, list, norm, findStage };
