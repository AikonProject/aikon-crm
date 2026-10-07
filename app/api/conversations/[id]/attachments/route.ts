import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

const MAX_BYTES = 16 * 1024 * 1024; // WhatsApp media limit

/**
 * Uploads a file an agent attaches in a conversation to the public
 * chat-media bucket and returns its URL (then sent via the messages route).
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const TENANT_ID = await requireModule('chat');
        const supabase = createAdminClient();

        const { data: conversation } = await supabase
            .from('conversations')
            .select('id')
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .maybeSingle();
        if (!conversation) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });

        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
        if (file.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo supera 16 MB' }, { status: 413 });

        const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-100);
        const path = `${TENANT_ID}/${id}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage
            .from('chat-media')
            .upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (error) {
            console.error('[POST /api/conversations/[id]/attachments]', error);
            return NextResponse.json({ error: 'No se pudo subir el archivo' }, { status: 500 });
        }

        const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(path);
        return NextResponse.json({ url: publicUrl, filename: file.name, mime_type: file.type }, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/conversations/[id]/attachments] unexpected', err);
        return NextResponse.json({ error: 'Error al subir el archivo' }, { status: 500 });
    }
}
