'use client';

import { APP_TIME_ZONE } from '@/lib/utils/format';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils/format';
import type { Conversation } from '@/lib/types/database';

interface ConversationListItemProps {
    conversation: Conversation & { ai_enabled?: boolean };
    isActive: boolean;
    onClick: () => void;
}

function formatTimeShort(dateStr: string | null): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: APP_TIME_ZONE });
    } else if (diffDays === 1) {
        return 'Ayer';
    } else if (diffDays < 7) {
        return d.toLocaleDateString('es-CO', { weekday: 'short', timeZone: APP_TIME_ZONE });
    }
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', timeZone: APP_TIME_ZONE });
}

const statusColors: Record<string, string> = {
    open: 'bg-emerald-400',
    pending: 'bg-amber-400',
    resolved: 'bg-[#9CA3AF]',
    snoozed: 'bg-blue-400',
};

export function ConversationListItem({ conversation, isActive, onClick }: ConversationListItemProps) {
    const contact = conversation.contact;
    const contactName = contact
        ? (contact.nombre ?? 'Sin nombre')
        : 'Contacto desconocido';
    const initials = getInitials(contactName);
    const lastMsg = (conversation.messages ?? [])[0];
    const lastMsgText = lastMsg?.content ?? 'Sin mensajes';
    const timeStr = formatTimeShort(conversation.last_message_at);
    const unread = conversation.unread_count ?? 0;
    const statusColor = statusColors[conversation.status] ?? 'bg-[#9CA3AF]';
    const aiEnabled = (conversation as Conversation & { ai_enabled?: boolean }).ai_enabled;

    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-l-2',
                isActive
                    ? 'bg-[#F3F4FF] border-l-[#818CF8]'
                    : 'border-l-transparent hover:bg-[#F9FAFB]'
            )}
        >
            {/* Status indicator dot */}
            <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center">
                    <span className="text-white text-[12px] font-semibold">{initials}</span>
                </div>
                <span className={cn('absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white', statusColor)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className={cn('text-[13px] font-semibold truncate', isActive ? 'text-[#4F46E5]' : 'text-[#1A1A2E]')}>
                        {contactName}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {aiEnabled && (
                            <Bot size={12} className="text-emerald-500" />
                        )}
                        {timeStr && (
                            <span className="text-[11px] text-[#9CA3AF]">{timeStr}</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] text-[#6B7280] truncate">{lastMsgText}</p>
                    {unread > 0 && (
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#818CF8] text-white text-[10px] font-bold flex items-center justify-center">
                            {unread > 9 ? '9+' : unread}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}
