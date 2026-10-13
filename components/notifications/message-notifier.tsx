'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useSupabaseClient } from '@/lib/supabase/client';
import { subscribeResilient } from '@/lib/supabase/realtime';
import { useTenantId } from '@/components/providers/tenant-provider';
import { isViewingConversation, OPEN_CONVERSATION_EVENT, type OpenConversationDetail } from '@/lib/active-conversation';
import { messagePreview } from '@/lib/message-content';
import { getNotifySettings, playChime, unlockAudioOnGesture } from './notification-settings';
import type { Message } from '@/lib/types/database';

/** Fired on every new inbound customer message (detail = the message row). */
export const NEW_MESSAGE_EVENT = 'aikon:new-message';

/**
 * Global "new WhatsApp message" alerts for the whole dashboard: toast with the
 * contact and a preview, a chime, a desktop notification when the tab is in
 * the background, and an unread counter in the tab title. Skips the chat the
 * agent is looking at.
 */
export function MessageNotifier() {
    const supabase = useSupabaseClient();
    const tenantId = useTenantId();
    const router = useRouter();
    const pathname = usePathname();
    const pathnameRef = useRef(pathname);
    useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

    const names = useRef(new Map<string, string>());
    const seen = useRef(new Set<string>());
    const lastSeenAt = useRef<string>(new Date().toISOString());
    const hiddenCount = useRef(0);
    const baseTitle = useRef<string | null>(null);

    useEffect(() => unlockAudioOnGesture(), []);

    // Tab title "(3) …" while new messages wait in a background tab
    useEffect(() => {
        function onVisible() {
            if (document.visibilityState === 'visible' && hiddenCount.current > 0) {
                hiddenCount.current = 0;
                if (baseTitle.current !== null) document.title = baseTitle.current;
                baseTitle.current = null;
            }
        }
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    useEffect(() => {
        function open(msg: Pick<Message, 'conversation_id' | 'contact_id'>) {
            window.focus();
            if (pathnameRef.current.startsWith('/conversations')) {
                window.dispatchEvent(new CustomEvent<OpenConversationDetail>(OPEN_CONVERSATION_EVENT, {
                    detail: { conversationId: msg.conversation_id, contactId: msg.contact_id },
                }));
            } else {
                router.push(`/conversations?contact=${msg.contact_id}`);
            }
        }

        async function contactName(contactId: string): Promise<string> {
            const cached = names.current.get(contactId);
            if (cached) return cached;
            const { data } = await supabase.from('contacts').select('nombre, wa_id').eq('id', contactId).maybeSingle();
            const name = (data as { nombre: string | null; wa_id: string | null } | null)?.nombre
                || (data as { wa_id: string | null } | null)?.wa_id || 'Contacto';
            names.current.set(contactId, name);
            return name;
        }

        async function notify(msg: Message) {
            if (msg.direction !== 'inbound' || msg.is_note || seen.current.has(msg.id)) return;
            seen.current.add(msg.id);
            if (seen.current.size > 500) seen.current = new Set([...seen.current].slice(-200));
            if (msg.created_at > lastSeenAt.current) lastSeenAt.current = msg.created_at;

            window.dispatchEvent(new CustomEvent<Message>(NEW_MESSAGE_EVENT, { detail: msg }));
            if (isViewingConversation(msg.conversation_id)) return;

            const name = await contactName(msg.contact_id);
            const preview = messagePreview(msg.content_type, msg.content);
            const settings = getNotifySettings();
            const hidden = document.visibilityState !== 'visible';

            toast(name, {
                id: `msg-${msg.conversation_id}`,          // one toast per chat, updated with the latest message
                description: preview,
                duration: 8000,
                action: { label: 'Ver', onClick: () => open(msg) },
            });
            if (settings.sound) playChime();

            if (hidden) {
                hiddenCount.current += 1;
                baseTitle.current ??= document.title;
                document.title = `(${hiddenCount.current}) ${baseTitle.current}`;
                if (settings.desktop && 'Notification' in window && Notification.permission === 'granted') {
                    try {
                        const n = new Notification(name, {
                            body: preview,
                            tag: `aikon-${msg.conversation_id}`,
                            icon: '/favicon.ico',
                        });
                        n.onclick = () => { open(msg); n.close(); };
                    } catch { /* some browsers only allow notifications from a service worker */ }
                }
            }
        }

        // After a reconnect: alert about what arrived while the socket was down
        async function catchUp() {
            const since = lastSeenAt.current;
            const { data } = await supabase
                .from('messages')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('direction', 'inbound')
                .eq('is_note', false)
                .gt('created_at', since)
                .order('created_at', { ascending: true })
                .limit(10);
            for (const m of (data ?? []) as Message[]) await notify(m);
        }

        let first = true;
        return subscribeResilient(supabase, 'notifier', (ch) => ch
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}`,
            }, (payload) => { notify(payload.new as Message); }),
        () => {
            if (first) { first = false; return; }
            catchUp();
        });
    }, [supabase, tenantId, router]);

    return null;
}
