import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import { n8nHeaders } from '@/lib/n8n';

export async function POST() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('chat');

        const { data: credentials } = await supabase
            .from('tenant_credentials')
            .select('waba_id, meta_access_token, n8n_templates_webhook, n8n_webhook_secret')
            .eq('tenant_id', TENANT_ID)
            .maybeSingle();

        // Preferred: the tenant's n8n syncs from whatever provider it uses and
        // pushes the list back (action templates_sync on /api/webhooks/n8n)
        if (credentials?.n8n_templates_webhook) {
            const res = await fetch(credentials.n8n_templates_webhook, {
                method: 'POST',
                headers: n8nHeaders(credentials.n8n_webhook_secret),
                body: JSON.stringify({ action: 'sync_templates', tenant_id: TENANT_ID }),
                signal: AbortSignal.timeout(10000),
            }).catch(() => null);
            if (!res?.ok) {
                return NextResponse.json({ error: 'n8n no respondió al pedir la sincronización.' }, { status: 502 });
            }
            return NextResponse.json({ requested: true });
        }

        // Fallback: Meta Cloud API directly with the credentials stored in the CRM
        if (!credentials?.waba_id || !credentials?.meta_access_token) {
            return NextResponse.json(
                { error: 'Configura el webhook de plantillas de n8n (o WABA ID y token de Meta) en Integraciones.' },
                { status: 422 }
            );
        }

        const { waba_id, meta_access_token: access_token } = credentials;

        const url = `https://graph.facebook.com/v19.0/${waba_id}/message_templates?access_token=${access_token}&limit=100`;
        const res = await fetch(url);

        if (!res.ok) {
            const errBody = await res.text();
            return NextResponse.json(
                { error: `Meta API error: ${errBody}` },
                { status: 502 }
            );
        }

        const json = await res.json();
        const metaTemplates: Array<{
            id: string;
            name: string;
            language: string;
            status: string;
            category: string;
            components: Array<{ type: string; text?: string; buttons?: unknown[] }>;
        }> = json.data ?? [];

        const STATUSES = ['APPROVED', 'PENDING', 'REJECTED'] as const;
        type Status = (typeof STATUSES)[number];
        let upserted = 0;
        for (const t of metaTemplates) {
            const { error } = await supabase.from('message_templates').upsert(
                {
                    tenant_id: TENANT_ID,
                    name: t.name,
                    category: t.category,
                    language: t.language,
                    components: t.components,
                    meta_id: t.id,
                    // Meta also returns PAUSED / DISABLED / IN_APPEAL…: not usable → treat as pending
                    status: (STATUSES as readonly string[]).includes(t.status) ? (t.status as Status) : 'PENDING',
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'tenant_id,name,language' }
            );
            if (error) console.error('[POST /api/templates/sync] upsert', t.name, error);
            else upserted++;
        }

        return NextResponse.json({ synced: upserted, total: metaTemplates.length });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/templates/sync]', err);
        return NextResponse.json({ error: 'Error syncing templates from Meta' }, { status: 500 });
    }
}
