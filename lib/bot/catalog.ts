import type { createAdminClient } from '@/lib/supabase/admin';
import { getTenantConfig, hasModule } from '@/lib/tenant-plan';
import { ValidationError } from '@/app/api/appointments/shared';
import type { PlanModule } from '@/lib/types/database';
import { IMPL, ToolError, str, list, norm, type ToolContext, type ToolResult } from './tools';

/**
 * Catalog of CRM tools for the AI agent: one explicit action per verb, each with
 * a description and a JSON schema the model reads (REST /api/bot/<tool> and MCP /api/mcp/<tenant>).
 * Reads (get_ / list_ / search_) never change anything. Writes are recorded in
 * ai_actions and in the contact's timeline.
 */

type Admin = ReturnType<typeof createAdminClient>;
type Json = Record<string, unknown>;
export type Contact = { id: string; nombre: string; wa_id: string | null; funnel_stage_id: string | null };

type CatalogCtx = Omit<ToolContext, 'contact'> & { contact: Contact | null };

export type ToolDef = {
    description: string;
    params: Record<string, Json>;
    required?: string[];
    write: boolean;
    module?: PlanModule;
    /** required: acts on the customer of the chat · optional: uses it if given · none: tenant-wide */
    contact: 'required' | 'optional' | 'none';
    /** Old name kept working for flows set up before the catalog */
    legacy?: boolean;
    run: (ctx: CatalogCtx) => Promise<ToolResult>;
};

const S = (description: string, extra: Json = {}): Json => ({ type: 'string', description, ...extra });
const N = (description: string): Json => ({ type: 'number', description });
const ARR = (description: string): Json => ({ type: 'array', items: { type: 'string' }, description });
const OBJ = (description: string): Json => ({ type: 'object', description, additionalProperties: true });
const ISO = 'Fecha y hora ISO 8601 con zona horaria, ej. 2026-10-20T15:00:00-05:00';

/** Runs a legacy implementation with a rewritten body (contact guaranteed by the runner). */
const via = (impl: keyof typeof IMPL, map?: (b: Json) => Json) => (ctx: CatalogCtx) =>
    IMPL[impl].run({ ...ctx, contact: ctx.contact as Contact, body: map ? map(ctx.body) : ctx.body });

async function contactTagIds(supabase: Admin, contactId: string | undefined) {
    if (!contactId) return new Set<string>();
    const { data } = await supabase.from('contact_tags').select('tag_id').eq('contact_id', contactId);
    return new Set((data ?? []).map((r) => r.tag_id as string));
}

export const CATALOG: Record<string, ToolDef> = {
    // ─── Leer ─────────────────────────────────────────────────────────────────
    get_contact: {
        description: 'Ficha completa del cliente del chat: datos, etapa del funnel, etiquetas, campos personalizados, notas recientes, deals, pedidos, citas próximas y los catálogos válidos (etapas, etiquetas, campos con opciones, productos). Úsala al empezar y antes de cambiar algo.',
        params: {}, write: false, contact: 'required', run: via('context'),
    },
    search_contacts: {
        description: 'Busca contactos por nombre, teléfono o email (ej. cuando el cliente refiere a otra persona).',
        params: { q: S('Texto a buscar'), limit: N('Máximo de resultados (por defecto 10)') }, required: ['q'],
        write: false, contact: 'none',
        async run({ supabase, tenantId, body }) {
            const q = str(body.q).replace(/[%,()]/g, ' ');
            if (q.length < 2) throw new ToolError('Escribe al menos 2 caracteres.');
            const digits = q.replace(/\D/g, '');
            const ors = [`nombre.ilike.%${q}%`, `email.ilike.%${q}%`];
            if (digits.length >= 4) ors.push(`wa_id.ilike.%${digits}%`);
            const { data, error } = await supabase.from('contacts')
                .select('id, nombre, wa_id, email, funnel_stage_id, created_at')
                .eq('tenant_id', tenantId).is('merged_into_id', null).or(ors.join(','))
                .order('created_at', { ascending: false }).limit(Math.min(50, Number(body.limit) || 10));
            if (error) throw error;
            return { summary: `${data?.length ?? 0} contacto(s)`, data: { contacts: data ?? [] } };
        },
    },
    list_tags: {
        description: 'Lista todas las etiquetas del negocio y marca con assigned=true las que ya tiene el cliente. Solo consulta, no cambia nada.',
        params: {}, write: false, contact: 'optional',
        async run({ supabase, tenantId, contact }) {
            const [{ data }, mine] = await Promise.all([
                supabase.from('tags').select('id, name').eq('tenant_id', tenantId).order('name'),
                contactTagIds(supabase, contact?.id),
            ]);
            const tags = (data ?? []).map((t) => ({ name: t.name, assigned: mine.has(t.id as string) }));
            return { summary: `${tags.length} etiquetas`, data: { tags, contact_tags: tags.filter((t) => t.assigned).map((t) => t.name) } };
        },
    },
    list_stages: {
        description: 'Etapas del funnel en orden, marcando con current=true la etapa actual del cliente.',
        params: {}, write: false, contact: 'optional', module: 'funnel',
        async run({ supabase, tenantId, contact }) {
            const { data } = await supabase.from('funnel_stages').select('id, name, position').eq('tenant_id', tenantId).order('position');
            const stages = (data ?? []).map((s) => ({ name: s.name, current: s.id === contact?.funnel_stage_id }));
            return { summary: `${stages.length} etapas`, data: { stages, current: stages.find((s) => s.current)?.name ?? null } };
        },
    },
    list_custom_fields: {
        description: 'Campos personalizados del negocio (clave, nombre, tipo, opciones) con el valor actual del cliente.',
        params: {}, write: false, contact: 'optional',
        async run({ supabase, tenantId, contact }) {
            const [{ data: defs }, { data: values }] = await Promise.all([
                supabase.from('custom_fields').select('field_key, label, field_type, options').eq('tenant_id', tenantId).order('position'),
                contact ? supabase.from('contact_field_values').select('field_key, value').eq('contact_id', contact.id) : Promise.resolve({ data: [] }),
            ]);
            const byKey = new Map(((values ?? []) as { field_key: string; value: string }[]).map((v) => [v.field_key, v.value]));
            const fields = (defs ?? []).map((d) => ({ ...d, value: byKey.get(d.field_key as string) ?? null }));
            return { summary: `${fields.length} campos`, data: { fields } };
        },
    },
    list_products: {
        description: 'Catálogo de productos activos con precio. Filtra con q para buscar por nombre.',
        params: { q: S('Texto a buscar (opcional)'), limit: N('Máximo (por defecto 50)') },
        write: false, contact: 'none', module: 'orders',
        async run({ supabase, tenantId, body }) {
            let query = supabase.from('products').select('id, name, price, sku, description').eq('tenant_id', tenantId).eq('is_active', true);
            const q = str(body.q).replace(/[%,()]/g, ' ');
            if (q) query = query.ilike('name', `%${q}%`);
            const { data, error } = await query.order('name').limit(Math.min(200, Number(body.limit) || 50));
            if (error) throw error;
            return { summary: `${data?.length ?? 0} productos`, data: { products: data ?? [] } };
        },
    },
    list_team: {
        description: 'Personas del equipo (para asignar o transferir el chat).',
        params: {}, write: false, contact: 'none',
        async run({ supabase, tenantId }) {
            const { data } = await supabase.from('users').select('full_name, email, role').eq('tenant_id', tenantId);
            return { summary: `${data?.length ?? 0} personas`, data: { team: data ?? [] } };
        },
    },
    list_appointments: {
        description: 'Citas del cliente. Por defecto solo las próximas; include_past=true incluye las anteriores.',
        params: { include_past: { type: 'boolean', description: 'Incluir citas pasadas' } },
        write: false, contact: 'required', module: 'appointments',
        async run({ supabase, contact, body }) {
            let q = supabase.from('appointments').select('id, title, start_time, end_time, status, meeting_type, meeting_url, location, notes').eq('contact_id', contact!.id);
            if (!(body.include_past === true || body.include_past === 'true')) q = q.gte('end_time', new Date().toISOString());
            const { data } = await q.order('start_time').limit(20);
            return { summary: `${data?.length ?? 0} citas`, data: { appointments: data ?? [] } };
        },
    },
    list_deals: {
        description: 'Deals (oportunidades de venta) del cliente.',
        params: {}, write: false, contact: 'required', module: 'funnel',
        async run({ supabase, contact }) {
            const { data } = await supabase.from('deals').select('id, name, price, currency, quantity, status, notes, created_at').eq('contact_id', contact!.id).order('created_at', { ascending: false }).limit(20);
            return { summary: `${data?.length ?? 0} deals`, data: { deals: data ?? [] } };
        },
    },
    list_orders: {
        description: 'Pedidos del cliente con sus productos y estado.',
        params: {}, write: false, contact: 'required', module: 'orders',
        async run({ supabase, contact }) {
            const { data } = await supabase.from('orders').select('id, status, total, currency, notes, created_at, order_items ( product_name, quantity, unit_price )').eq('contact_id', contact!.id).order('created_at', { ascending: false }).limit(10);
            return { summary: `${data?.length ?? 0} pedidos`, data: { orders: data ?? [] } };
        },
    },
    list_notes: {
        description: 'Notas internas del equipo y de la IA sobre el cliente (más recientes primero).',
        params: { limit: N('Máximo (por defecto 10)') }, write: false, contact: 'required',
        async run({ supabase, contact, body }) {
            const { data } = await supabase.from('contact_notes').select('content, created_at').eq('contact_id', contact!.id).order('created_at', { ascending: false }).limit(Math.min(50, Number(body.limit) || 10));
            return { summary: `${data?.length ?? 0} notas`, data: { notes: data ?? [] } };
        },
    },
    get_messages: {
        description: 'Últimos mensajes del chat con el cliente (para resumir o recordar lo que se habló). Incluye las transcripciones de audios e imágenes.',
        params: { limit: N('Cuántos mensajes (por defecto 20, máximo 100)') }, write: false, contact: 'required',
        async run({ supabase, conversationId, body }) {
            if (!conversationId) return { summary: 'Sin conversación', data: { messages: [] } };
            const { data } = await supabase.from('messages').select('direction, sender_type, content, content_type, is_note, created_at')
                .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(Math.min(100, Number(body.limit) || 20));
            const messages = (data ?? []).reverse().map((m) => ({
                from: m.is_note ? 'nota' : m.direction === 'inbound' ? 'cliente' : m.sender_type === 'bot' ? 'ia' : 'agente',
                type: m.content_type, text: m.content, at: m.created_at,
            }));
            return { summary: `${messages.length} mensajes`, data: { messages } };
        },
    },

    // ─── Crear / actualizar ──────────────────────────────────────────────────
    create_contact: {
        description: 'Crea un contacto nuevo (ej. un referido). Si el número ya existe, devuelve el existente sin duplicarlo.',
        params: { nombre: S('Nombre'), phone: S('WhatsApp con indicativo, ej. 573001234567'), email: S('Email (opcional)') },
        required: ['nombre', 'phone'], write: true, contact: 'none',
        async run({ supabase, tenantId, body, log }) {
            const phone = str(body.phone ?? body.new_wa_id).replace(/\D/g, '');
            const nombre = str(body.nombre ?? body.name);
            if (phone.length < 8) throw new ToolError('phone debe ser el número con indicativo, ej. 573001234567.');
            if (!nombre) throw new ToolError('Falta nombre.');
            const { data: existing } = await supabase.from('contacts').select('id, nombre, wa_id').eq('tenant_id', tenantId).eq('wa_id', phone).maybeSingle();
            if (existing) return { summary: `Ya existía: ${existing.nombre}`, data: { contact: existing, created: false } };
            const email = str(body.email).toLowerCase() || null;
            const { data, error } = await supabase.from('contacts').insert({
                tenant_id: tenantId, nombre: nombre.slice(0, 200), wa_id: phone, email, source: 'n8n', ai_active: true,
            } as never).select('id, nombre, wa_id').single();
            if (error) throw error;
            const created = data as { id: string; nombre: string };
            log('contact_created', `IA creó el contacto ${created.nombre}`, { contact_id: created.id }, created.id);
            return { summary: `Creó el contacto ${created.nombre}`, data: { contact: data, created: true } };
        },
    },
    update_contact: {
        description: 'Actualiza datos del cliente que él mismo dio: nombre, email o cargo. Envía solo los que cambian.',
        params: { nombre: S('Nombre completo'), email: S('Email'), job_title: S('Cargo u ocupación') },
        write: true, contact: 'required', run: via('update_contact'),
    },
    add_tags: {
        description: 'AGREGA etiquetas al cliente (no quita ninguna). Las que no existen se crean. Ej. tags=["Interesado maíz"].',
        params: { tags: ARR('Nombres de las etiquetas a agregar'), create_missing: { type: 'boolean', description: 'Crear las que no existan (por defecto true)' } },
        required: ['tags'], write: true, contact: 'required',
        run: via('tags', (b) => ({ ...b, add: list(b.tags ?? b.add), remove: [] })),
    },
    remove_tags: {
        description: 'QUITA etiquetas del cliente (no agrega ninguna). Ej. tags=["Cliente frío"].',
        params: { tags: ARR('Nombres de las etiquetas a quitar') },
        required: ['tags'], write: true, contact: 'required',
        run: via('tags', (b) => ({ ...b, add: [], remove: list(b.tags ?? b.remove) })),
    },
    set_stage: {
        description: 'Mueve al cliente a otra etapa del funnel (usa un nombre de list_stages). Solo cuando haya un avance real.',
        params: { stage: S('Nombre de la etapa') }, required: ['stage'],
        write: true, contact: 'required', module: 'funnel', run: via('stage'),
    },
    set_fields: {
        description: 'Guarda campos personalizados del cliente: fields={"Ciudad":"Bogotá","Plan":"Pro"}. Clave o nombre del campo; valor vacío lo borra. En listas usa una de sus opciones.',
        params: { fields: OBJ('Objeto { campo: valor }') }, required: ['fields'],
        write: true, contact: 'required', run: via('fields'),
    },
    add_note: {
        description: 'Deja una nota interna para el equipo (no se envía al cliente). Ej. resumen de lo que necesita.',
        params: { content: S('Texto de la nota') }, required: ['content'],
        write: true, contact: 'required', run: via('note'),
    },
    create_appointment: {
        description: 'Agenda una cita para el cliente. Confirma fecha y hora con él antes.',
        params: {
            title: S('Título, ej. "Visita técnica"'), start_time: S(ISO), end_time: S(ISO),
            meeting_type: S('Tipo', { enum: ['virtual', 'presencial', 'llamada'] }),
            location: S('Dirección (presencial)'), meeting_url: S('Enlace (virtual)'), notes: S('Notas'),
        },
        required: ['start_time', 'end_time', 'meeting_type'], write: true, contact: 'required', module: 'appointments',
        run: via('appointment', (b) => { const { id: _id, ...rest } = b; void _id; return rest; }),
    },
    update_appointment: {
        description: 'Reprograma o cambia una cita existente del cliente (id de list_appointments). Envía solo lo que cambia. Para confirmar usa status="confirmed".',
        params: {
            id: S('id de la cita'), title: S('Título'), start_time: S(ISO), end_time: S(ISO),
            meeting_type: S('Tipo', { enum: ['virtual', 'presencial', 'llamada'] }), location: S('Dirección'), meeting_url: S('Enlace'), notes: S('Notas'),
            status: S('Estado', { enum: ['scheduled', 'confirmed', 'completed', 'no_show'] }),
        },
        required: ['id'], write: true, contact: 'required', module: 'appointments', run: via('appointment'),
    },
    cancel_appointment: {
        description: 'Cancela una cita del cliente (id de list_appointments).',
        params: { id: S('id de la cita') }, required: ['id'], write: true, contact: 'required', module: 'appointments',
        run: via('appointment', (b) => ({ id: b.id, status: 'cancelled', reason: b.reason })),
    },
    create_deal: {
        description: 'Crea un deal (oportunidad de venta) para el cliente. price acepta "950.000".',
        params: {
            name: S('Qué se está vendiendo'), price: N('Valor'), currency: S('Moneda (por defecto COP)'), quantity: N('Cantidad'),
            status: S('Estado', { enum: ['pending', 'paid', 'completed', 'cancelled'] }), notes: S('Notas'),
        },
        required: ['name'], write: true, contact: 'required', module: 'funnel',
        run: via('deal', (b) => { const { id: _id, ...rest } = b; void _id; return rest; }),
    },
    update_deal: {
        description: 'Actualiza un deal del cliente (id de list_deals): precio, estado (pending en negociación, paid pagado, completed entregado, cancelled perdido) o notas.',
        params: {
            id: S('id del deal'), name: S('Nombre'), price: N('Valor'), quantity: N('Cantidad'),
            status: S('Estado', { enum: ['pending', 'paid', 'completed', 'cancelled'] }), notes: S('Notas'),
        },
        required: ['id'], write: true, contact: 'required', module: 'funnel', run: via('deal'),
    },
    create_order: {
        description: 'Crea un pedido del cliente. items=[{product_name, quantity}] con nombres de list_products (toma el precio del catálogo) o unit_price si no está en el catálogo. Confirma con el cliente antes.',
        params: {
            items: { type: 'array', description: 'Productos', items: { type: 'object', properties: { product_name: { type: 'string' }, quantity: { type: 'number' }, unit_price: { type: 'number' }, notes: { type: 'string' } }, required: ['product_name', 'quantity'] } },
            discount: N('Descuento en dinero'), notes: S('Notas del pedido (dirección, entrega…)'),
        },
        required: ['items'], write: true, contact: 'required', module: 'orders',
        run: via('order', (b) => { const { id: _id, ...rest } = b; void _id; return rest; }),
    },
    update_order_status: {
        description: 'Cambia el estado de un pedido del cliente (id de list_orders).',
        params: { id: S('id del pedido'), status: S('Estado', { enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'completed', 'cancelled'] }) },
        required: ['id', 'status'], write: true, contact: 'required', module: 'orders', run: via('order'),
    },
    assign_contact: {
        description: 'Asigna el cliente a una persona del equipo (nombre o email de list_team) sin apagar la IA.',
        params: { assign_to: S('Nombre o email') }, required: ['assign_to'], write: true, contact: 'required',
        async run({ supabase, tenantId, contact, conversationId, body, log }) {
            const ref = str(body.assign_to);
            const { data: users } = await supabase.from('users').select('id, full_name, email').eq('tenant_id', tenantId);
            const u = ((users ?? []) as { id: string; full_name: string | null; email: string | null }[])
                .find((x) => x.id === ref || norm(x.full_name ?? '') === norm(ref) || norm(x.email ?? '') === norm(ref));
            if (!u) throw new ToolError(`No hay nadie llamado "${ref}" en el equipo. Usa list_team.`, 404);
            await supabase.from('contacts').update({ assigned_to: u.id } as never).eq('id', contact!.id).eq('tenant_id', tenantId);
            if (conversationId) await supabase.from('conversations').update({ assigned_to: u.id } as never).eq('id', conversationId);
            const name = u.full_name || u.email;
            log('assigned', `IA asignó el contacto a ${name}`, { assigned_to: u.id });
            return { summary: `Asignó a ${name}` };
        },
    },
    handoff: {
        description: 'Pasa el chat a una persona: apaga la IA para este cliente, deja el motivo como nota y (opcional) lo asigna. Úsala si pide un humano, está molesto o no puedes resolverlo.',
        params: { reason: S('Motivo'), assign_to: S('Nombre o email (opcional)') }, required: ['reason'],
        write: true, contact: 'required', run: via('handoff'),
    },

    // ─── Nombres anteriores (siguen funcionando) ─────────────────────────────
    context: { description: 'Igual que get_contact.', params: {}, write: false, contact: 'required', legacy: true, run: via('context') },
    tags: { description: 'add y/o remove. Mejor usa add_tags / remove_tags.', params: { add: ARR('Agregar'), remove: ARR('Quitar') }, write: true, contact: 'required', legacy: true, run: via('tags') },
    stage: { description: 'Igual que set_stage.', params: { stage: S('Etapa') }, write: true, contact: 'required', module: 'funnel', legacy: true, run: via('stage') },
    fields: { description: 'Igual que set_fields.', params: { fields: OBJ('Campos') }, write: true, contact: 'required', legacy: true, run: via('fields') },
    note: { description: 'Igual que add_note.', params: { content: S('Nota') }, write: true, contact: 'required', legacy: true, run: via('note') },
    appointment: { description: 'Crear, o actualizar con id.', params: {}, write: true, contact: 'required', module: 'appointments', legacy: true, run: via('appointment') },
    deal: { description: 'Crear, o actualizar con id.', params: {}, write: true, contact: 'required', module: 'funnel', legacy: true, run: via('deal') },
    order: { description: 'Crear, o cambiar estado con id.', params: {}, write: true, contact: 'required', module: 'orders', legacy: true, run: via('order') },
};

export const TOOL_NAMES = Object.keys(CATALOG);

/** Common inputs every tool accepts (who the customer is and why). */
const COMMON_PARAMS: Record<string, Json> = {
    wa_id: S('WhatsApp del cliente con indicativo (si no viene en la URL)'),
    reason: S('Por qué haces esta acción, en una frase (queda en el registro del CRM)'),
};

/** JSON schema of a tool's input (for MCP tools/list and GET /api/bot). */
export function toolSchema(name: string) {
    const t = CATALOG[name];
    return {
        type: 'object',
        properties: { ...t.params, ...(t.contact === 'none' ? { reason: COMMON_PARAMS.reason } : COMMON_PARAMS) },
        required: t.required ?? [],
    };
}

/** Tools offered to the agent: hides legacy names and modules the plan doesn't include. */
export async function availableTools(tenantId: string) {
    const config = await getTenantConfig(tenantId);
    return TOOL_NAMES
        .filter((n) => !CATALOG[n].legacy && (!CATALOG[n].module || hasModule(config, CATALOG[n].module!)))
        .map((n) => ({ name: n, description: CATALOG[n].description, inputSchema: toolSchema(n), write: CATALOG[n].write }));
}

export type RunResult = { ok: true; summary: string; data?: unknown } | { ok: false; error: string; status: number };

/** Runs a tool and records writes (ai_actions + contact timeline). */
export async function runTool(
    name: string,
    base: { supabase: Admin; tenantId: string; contact: Contact | null; conversationId: string | null; body: Json }
): Promise<RunResult> {
    const tool = CATALOG[name];
    if (!tool) return { ok: false, error: `Herramienta desconocida: ${name}. Disponibles: ${TOOL_NAMES.filter((n) => !CATALOG[n].legacy).join(', ')}`, status: 404 };

    const { supabase, tenantId, contact, conversationId, body } = base;
    if (tool.contact === 'required' && !contact) {
        return { ok: false, error: 'Falta el cliente: envía wa_id (su WhatsApp) o contact_id.', status: 400 };
    }
    if (tool.module && !hasModule(await getTenantConfig(tenantId), tool.module)) {
        return { ok: false, error: `El plan de este negocio no incluye el módulo "${tool.module}".`, status: 403 };
    }

    const entries: { type: string; description: string; metadata?: Json; contactId?: string }[] = [];
    const ctx = {
        supabase, tenantId, conversationId, body,
        contact: tool.contact === 'none' ? null : contact,
        log: (type: string, description: string, metadata?: Json, contactId?: string) => entries.push({ type, description, metadata, contactId }),
    } as CatalogCtx;
    const reason = str(body.reason) || null;
    const input = Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'tenant_id'));

    try {
        const result = await tool.run(ctx);
        if (tool.write) {
            const subject = contact?.id ?? entries.find((e) => e.contactId)?.contactId ?? null;
            await supabase.from('ai_actions').insert({
                tenant_id: tenantId, conversation_id: conversationId, contact_id: subject,
                action_type: name, tool_name: name, status: 'completed', summary: result.summary,
                details: { input, result: result.data ?? null }, reasoning: reason,
                stage_before: result.stageBefore ?? null, stage_after: result.stageAfter ?? null,
            } as never);
            const rows = entries.filter((e) => e.contactId ?? contact?.id).map((e) => ({
                tenant_id: tenantId, contact_id: e.contactId ?? contact!.id, activity_type: e.type, description: e.description,
                performed_by_name: 'IA', channel: 'n8n', metadata: { ...(e.metadata ?? {}), tool: name, reason },
            }));
            if (rows.length) await supabase.from('activity_log').insert(rows as never);
        }
        return { ok: true, summary: result.summary, data: result.data };
    } catch (err) {
        const known = err instanceof ToolError || err instanceof ValidationError;
        const message = known ? (err as Error).message : (err as { message?: string })?.message ?? 'Error interno';
        const status = known ? (err as ToolError).status : 500;
        if (status >= 500) console.error(`[bot tool ${name}]`, err);
        if (tool.write) {
            await supabase.from('ai_actions').insert({
                tenant_id: tenantId, conversation_id: conversationId, contact_id: contact?.id ?? null,
                action_type: name, tool_name: name, status: 'failed', summary: message.slice(0, 500),
                details: { input }, reasoning: reason,
            } as never);
        }
        return { ok: false, error: message, status };
    }
}
