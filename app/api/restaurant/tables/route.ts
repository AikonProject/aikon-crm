import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('restaurant_tables')
            .select('*')
            .eq('tenant_id', TENANT_ID)
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
        const { name, capacity, location, is_active } = body;

        if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('restaurant_tables')
            .insert({
                tenant_id: TENANT_ID,
                name,
                capacity: Number(capacity) || 4,
                location: location || null,
                is_active: is_active !== false,
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
