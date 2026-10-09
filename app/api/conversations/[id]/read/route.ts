import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

/** Marks a conversation as seen (unread_count = 0) while an agent has it open. */
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const TENANT_ID = await requireModule('chat');
        const { error } = await createAdminClient()
            .from('conversations')
            .update({ unread_count: 0 })
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .gt('unread_count', 0);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ read: true });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/conversations/[id]/read]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
