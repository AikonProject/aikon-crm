import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function GET() {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('funnel_stages')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .order('position', { ascending: true });

        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (err) {
        console.error('[GET /api/funnel-stages]', err);
        return NextResponse.json({ error: 'Failed to fetch funnel stages' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, color, position, is_won, is_lost } = body;

        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

        // Determine position if not provided
        let stagePosition = position;
        if (stagePosition === undefined || stagePosition === null) {
            const { data: existing } = await supabase
                .from('funnel_stages')
                .select('position')
                .eq('tenant_id', TENANT_ID)
                .order('position', { ascending: false })
                .limit(1);
            stagePosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;
        }

        // Generate unique slug from name + random suffix to avoid collisions
        const baseSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const slug = `${baseSlug}-${Date.now()}`;

        const { data, error } = await supabase
            .from('funnel_stages')
            .insert({
                tenant_id: TENANT_ID,
                name,
                slug,
                color: color ?? '#818CF8',
                position: stagePosition,
                is_default: false,
                ...(is_won !== undefined && { is_won }),
                ...(is_lost !== undefined && { is_lost }),
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        console.error('[POST /api/funnel-stages]', err);
        return NextResponse.json({ error: 'Failed to create funnel stage' }, { status: 500 });
    }
}
