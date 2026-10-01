import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin, TenantError } from '@/lib/tenant';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireSuperAdmin();
        const { id } = await params;
        const body = await request.json();
        const supabase = createAdminClient();

        const allowed = ['is_active', 'role'];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = {};
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        const { error } = await supabase.from('users').update(update).eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (err) {
        if (err instanceof TenantError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[PATCH /api/admin/users/[id]]', err);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}
