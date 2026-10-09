'use client';

import { APP_TIME_ZONE } from '@/lib/utils/format';
import { FileText, Music, Video, Image as ImageIcon, Clock, Check, CheckCheck, X, Bot, User } from 'lucide-react';
import type { Message, DeliveryStatus, SenderType } from '@/lib/types/database';

interface MessageBubbleProps {
    message: Message & { is_note?: boolean };
}

function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: APP_TIME_ZONE });
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

// Outbound bubble color: bot → violet, human → indigo-600
function outboundBg(senderType: SenderType): string {
    return senderType === 'bot' ? 'bg-[#7C3AED]' : 'bg-[#4F46E5]';
}

function MessageContent({ message }: { message: Message & { is_note?: boolean } }) {
    const isOutbound = message.direction === 'outbound';
    const iconColor = isOutbound ? 'text-white/80' : 'text-[#9CA3AF]';

    switch (message.content_type) {
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

        case 'template': {
            // Template with a media header: show the file above the text
            const url = message.media_url;
            const isVideo = !!url && /\.(mp4|3gp)(\?|$)/i.test(url);
            const isPdf = !!url && /\.pdf(\?|$)/i.test(url);
            return (
                <div className="space-y-2">
                    {url && (isVideo ? (
                        <video src={url} controls className="max-w-full rounded-xl max-h-64" preload="metadata" />
                    ) : isPdf ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline underline-offset-2 opacity-90">
                            <FileText size={16} className={iconColor} /><span className="text-sm">Documento</span>
                        </a>
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="Imagen" className="max-w-full rounded-xl max-h-72 object-cover" loading="lazy" />
                    ))}
                    <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
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
        const isAiNote = senderType === 'bot';
        return (
            <div className="flex justify-center my-1 px-4">
                <div className={isAiNote
                    ? 'bg-violet-50 border border-violet-200 text-violet-900 rounded-xl px-4 py-2 max-w-[80%] text-center'
                    : 'bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2 max-w-[80%] text-center'}>
                    <p className={`text-xs font-semibold mb-0.5 flex items-center justify-center gap-1 ${isAiNote ? 'text-violet-600' : 'text-amber-600'}`}>
                        {isAiNote ? <><Bot size={11} /> Nota de la IA</> : <>Nota interna{message.sent_by_name ? ` · ${message.sent_by_name}` : ''}</>}
                    </p>
                    <p className="text-sm italic whitespace-pre-wrap break-words">{message.content}</p>
                    <p className={`text-[11px] mt-1 ${isAiNote ? 'text-violet-400' : 'text-amber-500'}`}>{formatTime(message.created_at)}</p>
                </div>
            </div>
        );
    }

    // ── Outbound (bot or human agent) ─────────────────────────────────────
    if (isOutbound) {
        const failed = message.delivery_status === 'failed' || message.status === 'failed';
        return (
            <div className="flex justify-end px-4 my-0.5">
                <div className="max-w-[70%]">
                    <SenderLabel senderType={senderType} name={message.sent_by_name} />
                    <div className={`${outboundBg(senderType)} text-white rounded-2xl rounded-tr-sm px-4 py-2.5 ${failed ? 'ring-2 ring-red-300' : ''}`}>
                        {message.template_name && (
                            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/70 mb-1">
                                <FileText size={10} /> Plantilla · {message.template_name}
                            </p>
                        )}
                        <MessageContent message={message} />
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-0.5 px-1">
                        <p className="text-[11px] text-[#9CA3AF]">{formatTime(message.created_at)}</p>
                        <DeliveryIcon status={failed ? 'failed' : message.delivery_status} />
                    </div>
                    {failed && (
                        <p className="text-[11px] text-red-500 text-right px-1">
                            No entregado{message.error_message ? `: ${message.error_message}` : ''}
                        </p>
                    )}
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
