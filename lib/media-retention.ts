import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

const BUCKET_MARKER = '/object/public/chat-media/';

/** Storage path of a chat-media public URL, or null for external URLs. */
export function chatMediaPath(url: string | null | undefined): string | null {
    if (!url) return null;
    const i = url.indexOf(BUCKET_MARKER);
    if (i === -1) return null;
    return decodeURIComponent(url.slice(i + BUCKET_MARKER.length).split('?')[0]);
}

/**
 * Deletes chat files older than `days` for one tenant and marks their messages
 * (the transcript / description stays). Template header files are kept: they
 * are reused on every send. Processes at most `limit` messages per call.
 */
export async function purgeExpiredMedia(supabase: Admin, tenantId: string, days: number, limit = 500) {
    if (!days || days <= 0) return { files: 0, messages: 0 };
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: rows, error } = await supabase
        .from('messages')
        .select('id, media_url')
        .eq('tenant_id', tenantId)
        .is('media_expired_at', null)
        .not('media_url', 'is', null)
        .like('media_url', `%${BUCKET_MARKER}${tenantId}/%`)
        .lt('created_at', cutoff)
        .limit(limit);
    if (error) throw error;

    const targets = (rows ?? [])
        .map((r) => ({ id: r.id as string, path: chatMediaPath(r.media_url as string) }))
        .filter((r): r is { id: string; path: string } => !!r.path && !r.path.startsWith(`${tenantId}/templates/`));
    if (targets.length === 0) return { files: 0, messages: 0 };

    let files = 0;
    const paths = [...new Set(targets.map((t) => t.path))];
    for (let i = 0; i < paths.length; i += 100) {
        const { data, error: rmErr } = await supabase.storage.from('chat-media').remove(paths.slice(i, i + 100));
        if (rmErr) throw rmErr;
        files += data?.length ?? 0;
    }

    const ids = targets.map((t) => t.id);
    for (let i = 0; i < ids.length; i += 200) {
        await supabase
            .from('messages')
            .update({ media_url: null, media_expired_at: new Date().toISOString() } as never)
            .in('id', ids.slice(i, i + 200));
    }
    return { files, messages: ids.length };
}
