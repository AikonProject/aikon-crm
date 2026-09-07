import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();

        const { error } = await supabase
            .from('canned_responses')
            .delete()
            .eq('id', id)
            .eq('tenant_id', MOCK_TENANT_ID);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/settings/canned-responses/[id]]', err);
        return NextResponse.json({ error: 'Error deleting canned response' }, { status: 500 });
    }
}
