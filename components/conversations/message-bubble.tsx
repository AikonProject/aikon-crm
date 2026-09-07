'use client';

import { FileText, Music, Image } from 'lucide-react';
import type { Message } from '@/lib/types/database';

interface MessageBubbleProps {
    message: Message & { is_note?: boolean };
}

function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function MessageContent({ message }: { message: Message & { is_note?: boolean } }) {
    const isNote = message.is_note;

    switch (message.message_type) {
        case 'image':
            return (
                <div className="flex items-center gap-2">
                    <Image size={16} className={isNote ? 'text-amber-600' : message.direction === 'outbound' ? 'text-white/80' : 'text-[#9CA3AF]'} />
                    <span className="text-sm italic">Imagen</span>
                </div>
            );
        case 'audio':
            return (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/10 w-fit">
                    <Music size={14} />
                    <span className="text-sm">Audio</span>
                </div>
            );
        case 'document': {
            const filename = message.media_filename;
            return (
                <div className="flex items-center gap-2">
                    <FileText size={16} />
                    <span className="text-sm">{filename ?? 'Documento'}</span>
                </div>
            );
        }
        default:
            return <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>;
    }
}

export function MessageBubble({ message }: MessageBubbleProps) {
    const isNote = message.is_note;
    const isOutbound = message.direction === 'outbound';

    if (isNote) {
        return (
            <div className="flex justify-center my-1 px-4">
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2 max-w-[80%] text-center">
                    <p className="text-xs font-semibold text-amber-600 mb-0.5">Nota interna</p>
                    <p className="text-sm italic">{message.content}</p>
                    <p className="text-[11px] text-amber-500 mt-1">{formatTime(message.created_at)}</p>
                </div>
            </div>
        );
    }

    if (isOutbound) {
        return (
            <div className="flex justify-end px-4 my-0.5">
                <div className="max-w-[70%]">
                    {message.sent_by_name && (
                        <p className="text-[11px] text-[#9CA3AF] text-right mb-0.5 px-1">{message.sent_by_name}</p>
                    )}
                    <div className="bg-[#818CF8] text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
                        <MessageContent message={message} />
                    </div>
                    <p className="text-[11px] text-[#9CA3AF] text-right mt-0.5 px-1">{formatTime(message.created_at)}</p>
                </div>
            </div>
        );
    }

    // Inbound
    return (
        <div className="flex justify-start px-4 my-0.5">
            <div className="max-w-[70%]">
                <div className="bg-white border border-[#E8E8EC] rounded-2xl rounded-tl-sm px-4 py-2.5 text-[#1A1A2E]">
                    <MessageContent message={message} />
                </div>
                <p className="text-[11px] text-[#9CA3AF] mt-0.5 px-1">{formatTime(message.created_at)}</p>
            </div>
        </div>
    );
}
