import { currentUser } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Supabase = ReturnType<typeof createAdminClient>;

/** Name of the signed-in agent, for "who did this" in the chat timeline. */
export async function getActorName(): Promise<string> {
    try {
        const user = await currentUser();
        const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
        return name || user?.primaryEmailAddress?.emailAddress || 'Agente';
    } catch {
        return 'Agente';
    }
}

/**
 * Records an action on a contact (AI on/off, status, assignment, tags…).
 * Shown in the conversation timeline and the contact's activity. Never throws:
 * a failed log must not break the action itself.
 */
export async function logActivity(
    supabase: Supabase,
    entry: {
        tenantId: string;
        contactId: string;
        type: string;
        description: string;
        performedByName?: string;
        metadata?: Record<string, unknown>;
        channel?: 'manual' | 'n8n';
    }
) {
    const { error } = await supabase.from('activity_log').insert({
        tenant_id: entry.tenantId,
        contact_id: entry.contactId,
        activity_type: entry.type,
        description: entry.description,
        performed_by_name: entry.performedByName ?? (await getActorName()),
        metadata: entry.metadata ?? null,
        channel: entry.channel ?? 'manual',
    });
    if (error) console.error('[logActivity]', entry.type, error);
}
