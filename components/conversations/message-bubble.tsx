'use client';

import { FileText, Music, Video, Image as ImageIcon, Clock, Check, CheckCheck, X, Bot, User } from 'lucide-react';
import type { Message, DeliveryStatus, SenderType } from '@/lib/types/database';

interface MessageBubbleProps {
    message: Message & { is_note?: boolean };
}

function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function DeliveryIcon({ status }: { status: DeliveryStatus | null }) {
    switch (status) {
        case 'sending':  return <Clock size={11} className="text-white/50" />;
        case 'sent':     return <Check size={11} className="text-white/70" />;
        case 'delivered':return <CheckCheck size={11} className="text-white/70" />;
        case 'read':     return <CheckCheck size={11} className="text-[#93C5FD]" />;
        case 'failed':   return <X size={11} className="text-red-300" />;
        default:         return <Clock size={11} className="text-white/50" />;
    }
}

function SenderLabel({ senderType, name }: { senderType: SenderType; name: string | null }) {
    if (senderType === 'bot') {
        return (
            <div className="flex items-center justify-end gap-1 mb-0.5 px-1">
                <Bot size={10} className="text-violet-400" />
                <span className="text-[11px] text-violet-400 font-medium">Bot</span>
            </div>
        );
    }
    if (senderType === 'human' && name) {
        return (
            <div className="flex items-center justify-end gap-1 mb-0.5 px-1">
                <User size={10} className="text-[#9CA3AF]" />
                <span className="text-[11px] text-[#9CA3AF]">{name}</span>
            </div>
        );
    }
    if (name) {
        return <p className="text-[11px] text-[#9CA3AF] text-right mb-0.5 px-1">{name}</p>;
    }
    return null;
}

// Outbound bubble color: bot → violet, human → indigo
function outboundBg(senderType: SenderType): string {
    return senderType === 'bot' ? 'bg-[#7C3AED]' : 'bg-[#818CF8]';
}

function MessageContent({ message }: { message: Message & { is_note?: boolean } }) {
    const isOutbound = message.direction === 'outbound';
    const iconColor = isOutbound ? 'text-white/80' : 'text-[#9CA3AF]';

    switch (message.message_type) {
        case 'image':
            if (message.media_url) {
                return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={message.media_url}
                        alt="Imagen"
                        className="max-w-full rounded-xl max-h-72 object-cover cursor-pointer"
                        loading="lazy"
                    />
                );
            }
            return (
                <div className="flex items-center gap-2">
                    <ImageIcon size={16} className={iconColor} />
                    <span className="text-sm italic opacity-70">Imagen</span>
                </div>
            );

        case 'video':
            if (message.media_url) {
                return (
                    <video
                        src={message.media_url}
                        controls
                        className="max-w-full rounded-xl max-h-64"
                        preload="metadata"
                    />
                );
            }
            return (
                <div className="flex items-center gap-2">
                    <Video size={16} className={iconColor} />
                    <span className="text-sm italic opacity-70">Video</span>
                </div>
            );

        case 'audio':
            if (message.media_url) {
                return (
                    <audio
                        src={message.media_url}
                        controls
                        className="max-w-[220px] w-full h-9"
                        preload="metadata"
                    />
                );
            }
            return (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/10 w-fit">
                    <Music size={14} className={iconColor} />
                    <span className="text-sm">Audio</span>
                </div>
            );

        case 'document': {
            const filename = message.media_filename ?? 'Documento';
            if (message.media_url) {
                return (
                    <a
                        href={message.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 underline underline-offset-2 opacity-90 hover:opacity-100"
                    >
                        <FileText size={16} className={iconColor} />
                        <span className="text-sm">{filename}</span>
                    </a>
                );
            }
            return (
                <div className="flex items-center gap-2">
                    <FileText size={16} className={iconColor} />
                    <span className="text-sm">{filename}</span>
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
    const senderType: SenderType = message.sender_type ?? (isOutbound ? 'human' : 'contact');

    // ── Internal note ────────────────────────────────────────────────────────
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

    // ── Outbound (bot or human agent) ─────────────────────────────────────
    if (isOutbound) {
        return (
            <div className="flex justify-end px-4 my-0.5">
                <div className="max-w-[70%]">
                    <SenderLabel senderType={senderType} name={message.sent_by_name} />
                    <div className={`${outboundBg(senderType)} text-white rounded-2xl rounded-tr-sm px-4 py-2.5`}>
                        <MessageContent message={message} />
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-0.5 px-1">
                        <p className="text-[11px] text-[#9CA3AF]">{formatTime(message.created_at)}</p>
                        <DeliveryIcon status={message.delivery_status} />
                    </div>
                </div>
            </div>
        );
    }

    // ── Inbound (contact / customer) ──────────────────────────────────────
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
