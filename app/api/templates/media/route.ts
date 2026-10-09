import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

// WhatsApp limits for template headers
const RULES: Record<string, { types: string[]; maxMb: number; label: string }> = {
    IMAGE: { types: ['image/jpeg', 'image/png'], maxMb: 5, label: 'JPG o PNG de máximo 5 MB' },
    VIDEO: { types: ['video/mp4', 'video/3gpp'], maxMb: 16, label: 'MP4 de máximo 16 MB' },
    DOCUMENT: { types: ['application/pdf'], maxMb: 16, label: 'PDF de máximo 16 MB' },
};

/**
 * Validates the sample media of a template header and returns a signed upload
 * URL: the browser uploads straight to storage (Vercel caps request bodies at ~4.5 MB).
 * Body: { format, filename, type, size }
 */
export async function POST(req: NextRequest) {
    try {
        const TENANT_ID = await requireModule('chat');
        const body = await req.json().catch(() => ({}));
        const format = String(body.format ?? '').toUpperCase();
        const rule = RULES[format];
        if (!rule) return NextResponse.json({ error: 'Tipo de encabezado no válido.' }, { status: 400 });
        if (!rule.types.includes(String(body.type))) {
            return NextResponse.json({ error: `Formato no permitido: usa ${rule.label}.` }, { status: 415 });
        }
        if (!(Number(body.size) > 0) || Number(body.size) > rule.maxMb * 1024 * 1024) {
            return NextResponse.json({ error: `El archivo supera ${rule.maxMb} MB.` }, { status: 413 });
        }

        const supabase = createAdminClient();
        const safeName = String(body.filename ?? 'archivo').replace(/[^\w.\-]+/g, '_').slice(-100);
        const path = `${TENANT_ID}/templates/${crypto.randomUUID()}-${safeName}`;
        const { data, error } = await supabase.storage.from('chat-media').createSignedUploadUrl(path);
        if (error || !data) {
            console.error('[POST /api/templates/media]', error);
            return NextResponse.json({ error: 'No se pudo preparar la subida.' }, { status: 500 });
        }
        const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(path);
        return NextResponse.json({ path, token: data.token, url: publicUrl }, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/templates/media] unexpected', err);
        return NextResponse.json({ error: 'Error al preparar la subida.' }, { status: 500 });
    }
}
