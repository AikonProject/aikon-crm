import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const supabase = createAdminClient();

        const allowed = ['plan', 'is_active', 'name', 'slug'];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = {};
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const { error } = await supabase.from('tenants').update(update).eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[PATCH /api/admin/tenants/[id]]', err);
        return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 });
    }
}
