import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

export async function POST() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('chat');

        // Fetch tenant credentials for Meta/WhatsApp
        const { data: credentials } = await supabase
            .from('tenant_credentials')
            .select('waba_id, meta_access_token')
            .eq('tenant_id', TENANT_ID)
            .maybeSingle();

        if (!credentials?.waba_id || !credentials?.meta_access_token) {
            return NextResponse.json(
                { error: 'WhatsApp credentials not configured. Please set WABA ID and Meta Access Token in Integrations.' },
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
