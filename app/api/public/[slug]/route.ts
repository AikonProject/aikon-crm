import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const supabase = createAdminClient();

        // Look up tenant by slug
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, name, slug, logo_url, primary_color, booking_bg_color, booking_bg_image_url, corporate_events_enabled, corporate_min_party_size, corporate_contact_link, plan, is_active')
            .eq('slug', slug)
            .eq('is_active', true)
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const tenantId = tenant.id;

        // Fetch schedules, events, menus in parallel
        const [schedulesRes, eventsRes, menusRes, tablesRes] = await Promise.all([
            supabase
                .from('restaurant_schedules')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .order('day_of_week', { ascending: true }),

            supabase
                .from('restaurant_events')
                .select('id, name, description, event_date, start_time, end_time, price, currency, max_guests, image_url, event_type')
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .gte('event_date', new Date().toISOString().split('T')[0])
                .order('event_date', { ascending: true })
                .limit(10),

            supabase
                .from('restaurant_menus')
                .select('id, name, menu_url, is_default')
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .order('created_at', { ascending: true }),

            supabase
                .from('restaurant_tables')
                .select('id, name, capacity, location')
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .order('position', { ascending: true }),
        ]);

        return NextResponse.json({
            tenant: {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                logo_url: tenant.logo_url,
                primary_color: tenant.primary_color ?? '#C8961C',
                booking_bg_color: tenant.booking_bg_color ?? '#0D0D0D',
                booking_bg_image_url: tenant.booking_bg_image_url ?? null,
                corporate_events_enabled: tenant.corporate_events_enabled ?? false,
                corporate_min_party_size: tenant.corporate_min_party_size ?? 10,
                corporate_contact_link: tenant.corporate_contact_link ?? null,
            },
            schedules: schedulesRes.data ?? [],
            events: eventsRes.data ?? [],
            menus: menusRes.data ?? [],
            tables: tablesRes.data ?? [],
        });
    } catch (err) {
        console.error('[GET /api/public/[slug]]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
