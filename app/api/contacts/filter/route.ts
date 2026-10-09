import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';
import { cleanFilter, type ContactFilter } from '@/lib/contact-filter';

/**
 * POST /api/contacts/filter  { filter, sample? }
 * → { count, with_phone, sample: [...] } — live preview for the filter builder.
 */
export async function POST(req: NextRequest) {
    try {
        const TENANT_ID = await getServerTenantId();
        const body = await req.json().catch(() => ({}));
        const filter = cleanFilter((body.filter ?? { match: 'all', conditions: [] }) as ContactFilter);
        const supabase = createAdminClient();

        const { data: ids, error } = await supabase.rpc('filter_contacts' as never, { p_tenant: TENANT_ID, p_filter: filter } as never);
        if (error) {
            console.error('[POST /api/contacts/filter]', error);
            return NextResponse.json({ error: 'Uno de los filtros no es válido. Revisa los valores (fechas, números).' }, { status: 400 });
        }
        const allIds = ((ids ?? []) as unknown as string[]);
        const count = allIds.length;

        // Count those reachable on WhatsApp and return a small sample to show
        let withPhone = 0;
        let sample: unknown[] = [];
        for (let i = 0; i < allIds.length; i += 500) {
            const chunk = allIds.slice(i, i + 500);
            const { count: c } = await supabase
                .from('contacts')
                .select('id', { count: 'exact', head: true })
                .in('id', chunk)
                .not('wa_id', 'is', null)
                .eq('is_blocked', false);
            withPhone += c ?? 0;
        }
        const sampleSize = Math.min(50, Number(body.sample ?? 8));
        if (count > 0 && sampleSize > 0) {
            const { data } = await supabase
                .from('contacts')
                .select('id, nombre, wa_id, email, created_at, last_incoming_at')
                .in('id', allIds.slice(0, 500))
                .order('created_at', { ascending: false })
                .limit(sampleSize);
            sample = data ?? [];
        }
        return NextResponse.json({ count, with_phone: withPhone, sample });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/contacts/filter] unexpected', err);
        return NextResponse.json({ error: 'Error al filtrar contactos' }, { status: 500 });
    }
}
