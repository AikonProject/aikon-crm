import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

type ImportRow = {
    nombre: string;
    email?: string | null;
    wa_id?: string | null;
    source?: string | null;
};

// ---------------------------------------------------------------------------
// POST /api/contacts/import — bulk create contacts from CSV rows
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

        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        // Fetch existing contacts to detect duplicates by wa_id or email
        const { data: existing } = await supabase
            .from('contacts')
            .select('email, wa_id')
            .eq('tenant_id', TENANT_ID);

        const existingEmails = new Set(
            (existing ?? []).map((c) => c.email?.toLowerCase()).filter(Boolean)
        );
        const existingWaIds = new Set(
            (existing ?? []).map((c) => c.wa_id?.toLowerCase()).filter(Boolean)
        );

        const validSources = new Set(['whatsapp', 'web', 'manual', 'csv', 'n8n']);
        const toInsert: {
            tenant_id: string;
            nombre: string;
            email: string | null;
            wa_id: string | null;
            source: 'whatsapp' | 'web' | 'manual' | 'csv' | 'n8n';
            lead_score: number;
        }[] = [];
        let skipped = 0;
        const errors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const nombre = row.nombre?.trim();

            if (!nombre) {
                errors.push(`Fila ${i + 1}: nombre vacío`);
                skipped++;
                continue;
            }

            const email = row.email?.trim() || null;
            const waId = row.wa_id?.trim() || null;

            // Check duplicates
            if (email && existingEmails.has(email.toLowerCase())) {
                skipped++;
                continue;
            }
            if (waId && existingWaIds.has(waId.toLowerCase())) {
                skipped++;
                continue;
            }

            const source = validSources.has(row.source ?? '')
                ? (row.source as 'whatsapp' | 'web' | 'manual' | 'csv' | 'n8n')
                : 'csv';

            toInsert.push({
                tenant_id: TENANT_ID,
                nombre,
                email,
                wa_id: waId,
                source,
                lead_score: 0,
            });

            // Track newly added to avoid duplicates within the import batch
            if (email) existingEmails.add(email.toLowerCase());
            if (waId) existingWaIds.add(waId.toLowerCase());
        }

        let created = 0;

        if (toInsert.length > 0) {
            // Insert in batches of 100
            const BATCH_SIZE = 100;
            for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
                const batch = toInsert.slice(i, i + BATCH_SIZE);
                const { error } = await supabase.from('contacts').insert(batch);
                if (error) {
                    console.error('[POST /api/contacts/import] batch error', error);
                    errors.push(`Error al insertar lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
                } else {
                    created += batch.length;
                }
            }
        }

        return NextResponse.json({
            created,
            skipped,
            errors,
            total: rows.length,
        });
    } catch (err) {
        console.error('[POST /api/contacts/import] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
