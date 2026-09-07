import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const supabase = createAdminClient();

        const { data, error } = await supabase
            .from('tags')
            .update(body)
            .eq('id', id)
            .eq('tenant_id', MOCK_TENANT_ID)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ tag: data });
    } catch (err) {
        console.error('[PATCH /api/settings/tags/[id]]', err);
        return NextResponse.json({ error: 'Error updating tag' }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();

        const { error } = await supabase
            .from('tags')
            .delete()
            .eq('id', id)
            .eq('tenant_id', MOCK_TENANT_ID);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/settings/tags/[id]]', err);
        return NextResponse.json({ error: 'Error deleting tag' }, { status: 500 });
    }
}
