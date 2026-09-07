import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('restaurant_events')
            .select('*')
            .eq('tenant_id', MOCK_TENANT_ID)
            .order('event_date', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (err) {
        console.error('[GET /api/restaurant/events]', err);
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, description, event_date, start_time, end_time, max_guests, price, is_active } = body;

        if (!name || !event_date) {
            return NextResponse.json({ error: 'name and event_date are required' }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('restaurant_events')
            .insert({
                tenant_id: MOCK_TENANT_ID,
                name,
                description: description || null,
                event_date,
                start_time: start_time || null,
                end_time: end_time || null,
                max_guests: max_guests ? Number(max_guests) : null,
                price: price ? Number(price) : null,
                is_active: is_active !== false,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        console.error('[POST /api/restaurant/events]', err);
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }
}
