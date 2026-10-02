import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('restaurant');
        const { data, error } = await supabase
            .from('restaurant_menus')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/restaurant/menus]', err);
        return NextResponse.json({ error: 'Failed to fetch menus' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, menu_url, is_active, is_default } = body;

        if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('restaurant');

        const { data, error } = await supabase
            .from('restaurant_menus')
            .insert({
                tenant_id: TENANT_ID,
                name,
                menu_url: menu_url?.trim() || null,
                is_active: is_active !== false,
                is_default: is_default === true,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/restaurant/menus]', err);
        return NextResponse.json({ error: 'Failed to create menu' }, { status: 500 });
    }
}
