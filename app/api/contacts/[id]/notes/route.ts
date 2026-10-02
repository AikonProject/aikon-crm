import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, TenantError } from '@/lib/tenant';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: contactId } = await params;
        const body = await req.json();
        const { content } = body as { content?: string };

        if (!content?.trim()) {
            return NextResponse.json({ error: 'El contenido es requerido.' }, { status: 400 });
        }

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

        // Verify the contact belongs to this tenant
        const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('id', contactId)
            .eq('tenant_id', TENANT_ID)
            .single();

        if (!contact) {
            return NextResponse.json({ error: 'Contacto no encontrado.' }, { status: 404 });
        }

        const { data: note, error } = await supabase
            .from('contact_notes')
            .insert({
                tenant_id: TENANT_ID,
                contact_id: contactId,
                content: content.trim(),
                created_by: null, // No auth yet
            })
            .select('id, content, created_at, user:users!contact_notes_created_by_fkey ( id, full_name )')
            .single();

        if (error) {
            console.error('[POST /api/contacts/[id]/notes]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ note }, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/contacts/[id]/notes] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
