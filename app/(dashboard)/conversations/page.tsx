import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import ConversationsClient from '@/components/conversations/conversations-client';
import type { Conversation } from '@/lib/types/database';

export default async function ConversationsPage() {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

    const { data } = await supabase
        .from('conversations')
        .select(`
            *,
            contact:contacts(
                id, nombre, wa_id, email, avatar_url,
                funnel_stage_id,
                funnel_stage:funnel_stages(id, name, color)
            )
        `)
        .eq('tenant_id', TENANT_ID)
        .order('last_message_at', { ascending: false });

    const initialConversations = (data ?? []) as Conversation[];

    return <ConversationsClient initialConversations={initialConversations} />;
}
