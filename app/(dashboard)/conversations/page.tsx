import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import ConversationsClient from '@/components/conversations/conversations-client';
import type { Conversation } from '@/lib/types/database';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
    const { contact } = await searchParams;

    const { data } = await supabase
        .from('conversations')
        .select(`
            *,
            contact:contacts!conversations_contact_id_fkey(
                id, nombre, wa_id, email, avatar_url,
                funnel_stage_id,
                funnel_stage:funnel_stages(id, name, color)
            )
        `)
        .eq('tenant_id', TENANT_ID)
        // Empty chats are hidden unless the deep link opens that contact's chat
        .or(['last_message_at.not.is.null', ...(contact && UUID.test(contact) ? [`contact_id.eq.${contact}`] : [])].join(','))
        .order('last_message_at', { ascending: false });

    const initialConversations = (data ?? []) as Conversation[];

    return <ConversationsClient initialConversations={initialConversations} />;
}
