import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

const PAGE_SIZE = 12;

// ---------------------------------------------------------------------------
// GET /api/contacts  — paginated contacts list
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
        const search = searchParams.get('search') ?? '';
        const stageId = searchParams.get('stage_id') ?? '';

        const supabase = createAdminClient();

        let query = supabase
            .from('contacts')
            .select(
                `
        id, nombre, email, wa_id, source, lead_score,
        last_contacted_at, created_at, funnel_stage_id, assigned_to,
        funnel_stage:funnel_stages ( id, name, color ),
        assigned_user:users!contacts_assigned_to_fkey ( id, full_name ),
        contact_tags ( tag:tags ( id, name, color ) )
        `,
                { count: 'exact' }
            )
            .eq('tenant_id', MOCK_TENANT_ID)
            .order('created_at', { ascending: false });

        if (search) {
            query = query.or(
                `nombre.ilike.%${search}%,email.ilike.%${search}%,wa_id.ilike.%${search}%`
            );
        }

        if (stageId) {
            query = query.eq('funnel_stage_id', stageId);
        }

        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) {
            console.error('[GET /api/contacts]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            contacts: data ?? [],
            total: count ?? 0,
            page,
            pageSize: PAGE_SIZE,
            totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
        });
    } catch (err) {
        console.error('[GET /api/contacts] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// POST /api/contacts  — create a new contact
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { nombre, email, wa_id, source } = body as {
            nombre?: string;
            email?: string | null;
            wa_id?: string | null;
            source?: string;
        };

        if (!nombre?.trim()) {
            return NextResponse.json({ error: 'El nombre es requerido.' }, { status: 400 });
        }

        const supabase = createAdminClient();

        const { data, error } = await supabase
            .from('contacts')
            .insert({
                tenant_id: MOCK_TENANT_ID,
                nombre: nombre.trim(),
                email: email ?? null,
                wa_id: wa_id ?? null,
                source: (source as 'manual' | 'whatsapp' | 'web' | 'csv' | 'n8n') ?? 'manual',
                lead_score: 0,
                last_contacted_at: null,
                assigned_to: null,
            })
            .select()
            .single();

        if (error) {
            console.error('[POST /api/contacts]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ contact: data }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/contacts] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
