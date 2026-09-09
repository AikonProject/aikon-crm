import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { tag_id } = await request.json();
        if (!tag_id) return NextResponse.json({ error: 'tag_id required' }, { status: 400 });

        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        // Verify contact belongs to tenant
        const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single();
        if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

        const { error } = await supabase
            .from('contact_tags')
            .insert({ contact_id: id, tag_id })
            .select()
            .single();

        if (error && error.code !== '23505') throw error; // ignore duplicate
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[POST /api/contacts/[id]/tags]', err);
        return NextResponse.json({ error: 'Failed to add tag' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { tag_id } = await request.json();
        if (!tag_id) return NextResponse.json({ error: 'tag_id required' }, { status: 400 });

        const supabase = createAdminClient();
        const TENANT_ID = await getServerTenantId();

        const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single();
        if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

        await supabase
            .from('contact_tags')
            .delete()
            .eq('contact_id', id)
            .eq('tag_id', tag_id);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/contacts/[id]/tags]', err);
        return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
    }
}
