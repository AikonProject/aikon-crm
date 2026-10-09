import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

/** Actions on the conversation's contact (AI on/off, status, tags…) for the chat timeline. */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const TENANT_ID = await requireModule('chat');
        const supabase = createAdminClient();

        const { data: conversation } = await supabase
            .from('conversations')
            .select('contact_id')
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .maybeSingle();
        if (!conversation) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });

        const { data, error } = await supabase
            .from('activity_log')
            .select('id, activity_type, description, performed_by_name, channel, created_at')
            .eq('tenant_id', TENANT_ID)
            .eq('contact_id', conversation.contact_id)
            .order('created_at', { ascending: true })
            .limit(200);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json(data ?? []);
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/conversations/[id]/activity]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
