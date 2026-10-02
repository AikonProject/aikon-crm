import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// GET /api/contacts/export — export all contacts as CSV
// ---------------------------------------------------------------------------
export async function GET() {
    try {
        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        const { data, error } = await supabase
            .from('contacts')
            .select(
                `
                id, nombre, email, wa_id, source, lead_score,
                funnel_stage:funnel_stages ( name ),
                contact_tags ( tag:tags ( name ) ),
                created_at
                `
            )
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[GET /api/contacts/export]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        type ExportRow = {
            nombre: string;
            email: string | null;
            wa_id: string | null;
            source: string;
            lead_score: number;
            created_at: string;
            funnel_stage: { name: string } | null;
            contact_tags: { tag: { name: string } | null }[];
        };
        const contacts = (data ?? []) as unknown as ExportRow[];

        // Build CSV
        const headers = ['nombre', 'email', 'wa_id', 'source', 'lead_score', 'funnel_stage', 'tags', 'created_at'];
        const csvRows = [headers.join(',')];

        for (const c of contacts) {
            const stageName = (c.funnel_stage as { name: string } | null)?.name ?? '';
            const tags = (c.contact_tags as { tag: { name: string } | null }[])
                .map((ct) => ct.tag?.name)
                .filter(Boolean)
                .join('; ');

            const row = [
                escapeCsv(c.nombre),
                escapeCsv(c.email ?? ''),
                escapeCsv(c.wa_id ?? ''),
                escapeCsv(c.source),
                String(c.lead_score),
                escapeCsv(stageName),
                escapeCsv(tags),
                escapeCsv(c.created_at),
            ];
            csvRows.push(row.join(','));
        }

        const csv = csvRows.join('\n');
        const date = new Date().toISOString().slice(0, 10);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="contactos-${date}.csv"`,
            },
        });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/contacts/export] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
