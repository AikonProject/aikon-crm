import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

export async function POST() {
    try {
        const supabase = createAdminClient();

        // Fetch tenant credentials for Meta/WhatsApp
        const { data: credentials } = await supabase
            .from('tenant_credentials')
            .select('waba_id, meta_access_token')
            .eq('tenant_id', MOCK_TENANT_ID)
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

        let upserted = 0;
        for (const t of metaTemplates) {
            await supabase.from('message_templates').upsert(
                {
                    tenant_id: MOCK_TENANT_ID,
                    name: t.name,
                    category: t.category,
                    language: t.language,
                    components: t.components,
                    is_active: t.status === 'APPROVED',
                },
                { onConflict: 'tenant_id,name,language' }
            );
            upserted++;
        }

        return NextResponse.json({ synced: upserted, total: metaTemplates.length });
    } catch (err) {
        console.error('[POST /api/templates/sync]', err);
        return NextResponse.json({ error: 'Error syncing templates from Meta' }, { status: 500 });
    }
}
