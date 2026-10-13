import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, isSuperAdmin, TenantError } from '@/lib/tenant';
import { purgeExpiredMedia } from '@/lib/media-retention';

/** Chat files: space used in Storage and how long they are kept. */
export async function GET() {
    try {
        const TENANT_ID = await getServerTenantId();
        const supabase = createAdminClient();
        const [{ data: usage, error: uErr }, { data: tenant }] = await Promise.all([
            supabase.rpc('tenant_media_usage' as never, { p_tenant: TENANT_ID } as never),
            supabase.from('tenants').select('media_retention_days').eq('id', TENANT_ID).single(),
        ]);
        if (uErr) throw uErr;
        const row = (Array.isArray(usage) ? usage[0] : usage) as { bytes?: number; files?: number } | null;
        return NextResponse.json({
            bytes: Number(row?.bytes ?? 0),
            files: Number(row?.files ?? 0),
            retention_days: (tenant as { media_retention_days?: number } | null)?.media_retention_days ?? 90,
        });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[GET /api/settings/media]', err);
        return NextResponse.json({ error: 'No se pudo leer el almacenamiento' }, { status: 500 });
    }
}

/** Admins change the retention; `purge_now` applies it right away. */
export async function PATCH(req: NextRequest) {
    try {
        const TENANT_ID = await getServerTenantId();
        const { orgRole } = await auth();
        if (orgRole !== 'org:admin' && !(await isSuperAdmin())) {
            return NextResponse.json({ error: 'Solo un administrador puede cambiar esto' }, { status: 403 });
        }
        const body = await req.json().catch(() => ({}));
        const days = Math.round(Number(body.retention_days));
        if (!Number.isFinite(days) || (days !== 0 && (days < 7 || days > 3650))) {
            return NextResponse.json({ error: 'Usa 0 (conservar siempre) o entre 7 y 3650 días' }, { status: 400 });
        }
        const supabase = createAdminClient();
        const { error } = await supabase.from('tenants').update({ media_retention_days: days } as never).eq('id', TENANT_ID);
        if (error) throw error;

        const purged = body.purge_now && days > 0 ? await purgeExpiredMedia(supabase, TENANT_ID, days) : null;
        return NextResponse.json({ retention_days: days, purged });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/settings/media]', err);
        return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
}
