import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { purgeExpiredMedia } from '@/lib/media-retention';

export const maxDuration = 60;

/**
 * Daily cleanup (Vercel Cron, see vercel.json): deletes chat files older than
 * each tenant's media_retention_days. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: tenants, error } = await supabase
        .from('tenants')
        .select('id, media_retention_days')
        .gt('media_retention_days', 0);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results: Record<string, { files: number; messages: number } | { error: string }> = {};
    for (const t of (tenants ?? []) as { id: string; media_retention_days: number }[]) {
        try {
            results[t.id] = await purgeExpiredMedia(supabase, t.id, t.media_retention_days);
        } catch (err) {
            console.error('[cron media-retention]', t.id, err);
            results[t.id] = { error: err instanceof Error ? err.message : String(err) };
        }
    }
    return NextResponse.json({ ok: true, results });
}
