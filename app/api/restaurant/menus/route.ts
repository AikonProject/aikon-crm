import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('restaurant_menus')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (err) {
        console.error('[GET /api/restaurant/menus]', err);
        return NextResponse.json({ error: 'Failed to fetch menus' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, description, image_url, is_available } = body;

        if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

        const { data, error } = await supabase
            .from('restaurant_menus')
            .insert({
                tenant_id: TENANT_ID,
                name,
                description: description || null,
                image_url: image_url || null,
                is_available: is_available !== false,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        console.error('[POST /api/restaurant/menus]', err);
        return NextResponse.json({ error: 'Failed to create menu' }, { status: 500 });
    }
}
