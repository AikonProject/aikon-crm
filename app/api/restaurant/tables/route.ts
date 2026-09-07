import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('restaurant_tables')
            .select('*')
            .eq('tenant_id', MOCK_TENANT_ID)
            .order('name', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (err) {
        console.error('[GET /api/restaurant/tables]', err);
        return NextResponse.json({ error: 'Failed to fetch tables' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, capacity, zone, is_active } = body;

        if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('restaurant_tables')
            .insert({
                tenant_id: MOCK_TENANT_ID,
                name,
                capacity: Number(capacity) || 4,
                zone: zone || null,
                is_active: is_active !== false,
                status: 'available',
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        console.error('[POST /api/restaurant/tables]', err);
        return NextResponse.json({ error: 'Failed to create table' }, { status: 500 });
    }
}
