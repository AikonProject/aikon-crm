import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';
import { cleanFilter, type ContactFilter } from '@/lib/contact-filter';

/**
 * POST /api/contacts/filter  { filter, sample? }
 * → { count, with_phone, sample: [...] } — live preview for the filter builder.
 *
 * POST /api/contacts/filter  { filter, ids_only: true } → { ids, count }
 *
 * POST /api/contacts/filter  { filter?, list: { search?, page?, page_size? } }
 * → { rows: [{ id, nombre, wa_id, email, in_filter }], total } — contact list to pick recipients by hand.
 *   Without search it lists the contacts that match the filter (or all, with no filter);
 *   with search it looks in every contact and flags the ones that match the filter.
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

        if (body.list) return listContacts(supabase, TENANT_ID, body.filter ? allIds : null, body.list);
        // Every matching id (contacts table: show and act on the filtered contacts)
        if (body.ids_only) return NextResponse.json({ ids: allIds, count });

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

const LIST_COLUMNS = 'id, nombre, wa_id, email';

async function listContacts(
    supabase: ReturnType<typeof createAdminClient>,
    tenantId: string,
    filterIds: string[] | null,
    list: { search?: string; page?: number; page_size?: number }
) {
    const pageSize = Math.min(100, Math.max(1, Number(list.page_size) || 25));
    const page = Math.max(0, Number(list.page) || 0);
    const search = String(list.search ?? '').trim().replace(/[%,()]/g, ' ');
    const inFilter = new Set(filterIds ?? []);
    type Row = { id: string; nombre: string; wa_id: string | null; email: string | null };

    let rows: Row[] = [];
    let total = 0;
    if (search) {
        const q = `%${search}%`;
        const { data, count, error } = await supabase
            .from('contacts')
            .select(LIST_COLUMNS, { count: 'exact' })
            .eq('tenant_id', tenantId)
            .is('merged_into_id', null)
            .or(`nombre.ilike.${q},wa_id.ilike.${q},email.ilike.${q}`)
            .order('nombre', { ascending: true })
            .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw error;
        rows = (data ?? []) as Row[];
        total = count ?? 0;
    } else if (filterIds) {
        total = filterIds.length;
        const slice = filterIds.slice(page * pageSize, page * pageSize + pageSize);
        if (slice.length) {
            const { data, error } = await supabase.from('contacts').select(LIST_COLUMNS).in('id', slice);
            if (error) throw error;
            rows = ((data ?? []) as Row[]).sort((a, b) => a.nombre.localeCompare(b.nombre));
        }
    } else {
        const { data, count, error } = await supabase
            .from('contacts')
            .select(LIST_COLUMNS, { count: 'exact' })
            .eq('tenant_id', tenantId)
            .is('merged_into_id', null)
            .order('created_at', { ascending: false })
            .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw error;
        rows = (data ?? []) as Row[];
        total = count ?? 0;
    }
    return NextResponse.json({
        rows: rows.map((r) => ({ ...r, in_filter: filterIds ? inFilter.has(r.id) : false })),
        total,
        page,
        page_size: pageSize,
    });
}
