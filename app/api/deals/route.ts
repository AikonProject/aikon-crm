import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// GET /api/deals — list deals for tenant
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
    try {
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('funnel');
        const { searchParams } = new URL(req.url);
        const contactId = searchParams.get('contact_id');

        let query = supabase
            .from('deals')
            .select('*, contact:contacts ( id, nombre, funnel_stage_id )')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: false });

        if (contactId) {
            query = query.eq('contact_id', contactId);
        }

        const { data, error } = await query.limit(500);

        if (error) {
            console.error('[GET /api/deals]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data ?? []);
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/deals] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// POST /api/deals — create a deal
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
    try {
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('funnel');
        const body = await req.json();

        const { contact_id, name, description, price, currency, quantity, status, notes } = body;

        if (!contact_id || !name) {
            return NextResponse.json({ error: 'contact_id y name son requeridos' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('deals')
            .insert({
                tenant_id: TENANT_ID,
                contact_id,
                name,
                description: description || null,
                price: price ?? null,
                currency: currency || 'MXN',
                quantity: quantity ?? 1,
                status: status || 'pending',
                notes: notes || null,
            })
            .select('*, contact:contacts ( id, nombre, funnel_stage_id )')
            .single();

        if (error) {
            console.error('[POST /api/deals]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/deals] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
