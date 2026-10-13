import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import { n8nHeaders } from '@/lib/n8n';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('chat');
        const { data, error } = await supabase
            .from('message_templates')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ templates: data ?? [] });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/templates]', err);
        return NextResponse.json({ error: 'Error fetching templates' }, { status: 500 });
    }
}

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];

/** Meta only accepts lowercase letters, numbers and underscores. */
function toTemplateName(raw: string): string {
    return raw
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim()
        .replace(/[\s-]+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_+/g, '_')
        .slice(0, 512);
}

/**
 * Creates the template in the CRM (PENDING) and asks the tenant's n8n to create
 * it in the provider (Meta). n8n answers with action template_created.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        if (!body) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });

        const name = toTemplateName(String(body.name ?? ''));
        const content = String(body.content ?? '').trim();
        const language = String(body.language ?? 'es');
        const category = String(body.category ?? '').toUpperCase();
        // examples: { "1": "Ana" } / { "nombre": "Ana" }, or (older clients) an array in {{1}}, {{2}} order
        const exampleOf = (key: string, index: number): string => {
            if (Array.isArray(body.examples)) return String(body.examples[index] ?? '').trim();
            return String((body.examples ?? {})[key] ?? '').trim();
        };

        if (!name) return NextResponse.json({ error: 'El nombre es obligatorio (minúsculas, números y _).' }, { status: 400 });
        if (!content) return NextResponse.json({ error: 'El contenido es obligatorio.' }, { status: 400 });
        if (!CATEGORIES.includes(category)) {
            return NextResponse.json({ error: 'Elige una categoría: Marketing, Utilidad o Autenticación.' }, { status: 400 });
        }

        // Variables: numbered {{1}} {{2}} (in order) or named {{nombre}} — not both. Each needs an example.
        const placeholders = Array.from(new Set((content.match(/\{\{\s*([^{}]+?)\s*\}\}/g) ?? []).map((v) => v.replace(/[{}\s]/g, ''))));
        const numbered = placeholders.filter((p) => /^\d+$/.test(p));
        const named = placeholders.filter((p) => !/^\d+$/.test(p));
        if (numbered.length && named.length) {
            return NextResponse.json({ error: 'No mezcles variables numeradas ({{1}}) con variables con nombre ({{nombre}}).' }, { status: 400 });
        }
        const bad = named.find((p) => !/^[a-z][a-z0-9_]*$/.test(p));
        if (bad) {
            return NextResponse.json({ error: `La variable {{${bad}}} no es válida: usa solo minúsculas, números y _ (sin tildes ni espacios), ej. {{nombre}}.` }, { status: 400 });
        }
        const isNamed = named.length > 0;
        const vars = isNamed ? named : numbered.map(Number).sort((a, b) => a - b).map(String);
        if (!isNamed && vars.some((v, i) => Number(v) !== i + 1)) {
            return NextResponse.json({ error: 'Las variables deben ser consecutivas: {{1}}, {{2}}, {{3}}…' }, { status: 400 });
        }
        if (/^\s*\{\{[^{}]+\}\}/.test(content) || /\{\{[^{}]+\}\}[\s.!?]*$/.test(content)) {
            return NextResponse.json({ error: 'Meta no permite que el mensaje empiece o termine con una variable.' }, { status: 400 });
        }
        const examples = vars.map((v, i) => exampleOf(v, i));
        const missing = vars.find((v, i) => !examples[i]);
        if (missing) {
            return NextResponse.json({ error: `Escribe un ejemplo para la variable {{${missing}}} (Meta lo exige para aprobarla).` }, { status: 400 });
        }
        if (content.length > 1024) {
            return NextResponse.json({ error: 'El contenido no puede superar 1024 caracteres.' }, { status: 400 });
        }

        // Optional header: text, or image / video / PDF with a sample file (Meta needs it to review)
        let header: Record<string, unknown> | null = null;
        const headerFormat = String(body.header?.format ?? '').toUpperCase();
        if (headerFormat === 'TEXT') {
            const text = String(body.header?.text ?? '').trim();
            if (!text) return NextResponse.json({ error: 'Escribe el texto del encabezado.' }, { status: 400 });
            if (text.length > 60) return NextResponse.json({ error: 'El encabezado de texto admite máximo 60 caracteres.' }, { status: 400 });
            if (/\{\{/.test(text)) return NextResponse.json({ error: 'El encabezado de texto no admite variables.' }, { status: 400 });
            header = { type: 'HEADER', format: 'TEXT', text };
        } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {
            const url = String(body.header?.url ?? '');
            if (!/^https:\/\//.test(url)) {
                return NextResponse.json({ error: 'Sube el archivo de ejemplo del encabezado.' }, { status: 400 });
            }
            header = { type: 'HEADER', format: headerFormat, example: { header_url: [url] } };
        } else if (headerFormat) {
            return NextResponse.json({ error: 'Tipo de encabezado no válido.' }, { status: 400 });
        }

        // Buttons: quick replies (answers configured later per button), link or call
        type Btn = { type: string; text?: string; url?: string; phone_number?: string; example?: string };
        const rawButtons: Btn[] = Array.isArray(body.buttons) ? body.buttons : [];
        const buttons: Record<string, unknown>[] = [];
        const quick: Record<string, unknown>[] = [];
        let urls = 0; let phones = 0;
        for (const b of rawButtons) {
            const text = String(b.text ?? '').trim();
            if (!text) return NextResponse.json({ error: 'Cada botón necesita un texto.' }, { status: 400 });
            if (text.length > 25) return NextResponse.json({ error: `El texto del botón "${text}" supera 25 caracteres.` }, { status: 400 });
            const type = String(b.type).toUpperCase();
            if (type === 'QUICK_REPLY') {
                quick.push({ type: 'QUICK_REPLY', text });
            } else if (type === 'URL') {
                const url = String(b.url ?? '').trim();
                if (!/^https?:\/\//.test(url)) return NextResponse.json({ error: `El botón "${text}" necesita un enlace que empiece por https://` }, { status: 400 });
                const btn: Record<string, unknown> = { type: 'URL', text, url };
                // Dynamic link: https://site.com/pedido/{{1}} needs an example
                if (/\{\{1\}\}$/.test(url)) {
                    const ex = String(b.example ?? '').trim();
                    if (!ex) return NextResponse.json({ error: `Escribe un ejemplo para el enlace dinámico del botón "${text}".` }, { status: 400 });
                    btn.example = [url.replace('{{1}}', ex)];
                }
                buttons.push(btn); urls++;
            } else if (type === 'PHONE_NUMBER') {
                const phone = String(b.phone_number ?? '').replace(/[^\d+]/g, '');
                if (!/^\+\d{8,15}$/.test(phone)) return NextResponse.json({ error: `El botón "${text}" necesita un teléfono con indicativo, ej. +573001234567` }, { status: 400 });
                buttons.push({ type: 'PHONE_NUMBER', text, phone_number: phone }); phones++;
            } else {
                return NextResponse.json({ error: 'Tipo de botón no válido.' }, { status: 400 });
            }
        }
        if (quick.length + buttons.length > 10) return NextResponse.json({ error: 'Máximo 10 botones por plantilla.' }, { status: 400 });
        if (urls > 2) return NextResponse.json({ error: 'Máximo 2 botones de enlace.' }, { status: 400 });
        if (phones > 1) return NextResponse.json({ error: 'Máximo 1 botón de llamada.' }, { status: 400 });
        if (category === 'AUTHENTICATION' && (quick.length || buttons.length)) {
            return NextResponse.json({ error: 'Las plantillas de autenticación no admiten estos botones.' }, { status: 400 });
        }
        // Meta requires quick replies grouped together
        const allButtons = [...quick, ...buttons];

        const footer = String(body.footer ?? '').trim();
        if (footer.length > 60) return NextResponse.json({ error: 'El pie de página admite máximo 60 caracteres.' }, { status: 400 });

        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('chat');

        const { data: credentials } = await supabase
            .from('tenant_credentials')
            .select('n8n_templates_webhook, n8n_send_message_webhook, n8n_webhook_secret')
            .eq('tenant_id', TENANT_ID)
            .maybeSingle();
        const webhookUrl = credentials?.n8n_templates_webhook || credentials?.n8n_send_message_webhook;
        if (!webhookUrl) {
            return NextResponse.json(
                { error: 'Falta configurar el webhook de n8n en Configuración → Integraciones.' },
                { status: 422 }
            );
        }

        const { data: existing } = await supabase
            .from('message_templates')
            .select('id, status')
            .eq('tenant_id', TENANT_ID).eq('name', name).eq('language', language)
            .maybeSingle();
        if (existing) {
            // A rejected attempt can be fixed and sent again with the same name
            if ((existing as { status?: string }).status === 'REJECTED') {
                await supabase.from('message_templates').delete().eq('id', existing.id);
            } else {
                return NextResponse.json({ error: `Ya existe una plantilla "${name}" en ese idioma.` }, { status: 409 });
            }
        }

        const bodyComponent: Record<string, unknown> = { type: 'BODY', text: content };
        if (vars.length > 0) {
            bodyComponent.example = isNamed
                ? { body_text_named_params: vars.map((v, i) => ({ param_name: v, example: examples[i] })) }
                : { body_text: [examples] };
        }
        const components: Record<string, unknown>[] = [];
        if (header) components.push(header);
        components.push(bodyComponent);
        if (footer) components.push({ type: 'FOOTER', text: footer });
        if (allButtons.length) components.push({ type: 'BUTTONS', buttons: allButtons });

        const { data: inserted, error } = await supabase
            .from('message_templates')
            .insert({
                tenant_id: TENANT_ID,
                name,
                category,
                language,
                components,
                status: 'PENDING',
            })
            .select()
            .single();
        const template = inserted as { id: string } | null;
        if (error || !template) {
            console.error('[POST /api/templates]', error);
            return NextResponse.json({ error: 'No se pudo guardar la plantilla.' }, { status: 500 });
        }

        // Ask n8n to create it in the provider; if n8n can't be reached, undo
        let res: Response | null = null;
        try {
            res = await fetch(webhookUrl, {
                method: 'POST',
                headers: n8nHeaders(credentials?.n8n_webhook_secret),
                signal: AbortSignal.timeout(10000),
                body: JSON.stringify({
                    action: 'create_template',
                    tenant_id: TENANT_ID,
                    template_id: template.id,
                    name,
                    language,
                    category,
                    components,
                    // Named variables ({{nombre}}) must be declared to Meta as NAMED
                    parameter_format: isNamed ? 'NAMED' : 'POSITIONAL',
                    // Convenience for the gateway: the header sample file, if any
                    header_format: header?.format ?? null,
                    header_media_url: header && header.format !== 'TEXT' ? (header.example as { header_url: string[] }).header_url[0] : null,
                }),
            });
        } catch {
            res = null;
        }
        if (!res?.ok) {
            await supabase.from('message_templates').delete().eq('id', template.id);
            return NextResponse.json(
                { error: res ? `n8n respondió con error (${res.status}). La plantilla no se creó.` : 'No se pudo contactar a n8n. La plantilla no se creó.' },
                { status: 502 }
            );
        }

        return NextResponse.json({ template }, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/templates]', err);
        return NextResponse.json({ error: 'Error al crear la plantilla' }, { status: 500 });
    }
}
