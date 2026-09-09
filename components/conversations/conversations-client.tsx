'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
    Search,
    MessageCircle,
    Bot,
    User,
    Send,
    Paperclip,
    Smile,
    FileText,
    MessageSquare,
    CheckCheck,
    ChevronRight,
    X,
    PanelRight,
    StickyNote,
    UserCheck,
    Tag,
    CalendarCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils/format';
import { createClient } from '@/lib/supabase/client';
import { useSidebar } from '@/components/layout/sidebar-provider';
import { ConversationListItem } from '@/components/conversations/conversation-list-item';
import { MessageBubble } from '@/components/conversations/message-bubble';
import type { Conversation, Message, MessageTemplate, CannedResponse, ConversationStatus } from '@/lib/types/database';

type StatusFilter = 'all' | ConversationStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'open', label: 'Abiertos' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'resolved', label: 'Resueltos' },
];

const STATUS_LABELS: Record<string, string> = {
    open: 'Abierto',
    pending: 'Pendiente',
    resolved: 'Resuelto',
    snoozed: 'En espera',
};

const STATUS_COLORS: Record<string, string> = {
    open: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    resolved: 'bg-[#F3F4F6] text-[#6B7280]',
    snoozed: 'bg-blue-100 text-blue-700',
};

function DateSeparator({ date }: { date: string }) {
    const d = new Date(date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    let label: string;
    if (diffDays === 0) label = 'Hoy';
    else if (diffDays === 1) label = 'Ayer';
    else label = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <div className="flex items-center gap-3 px-4 my-3">
            <div className="flex-1 h-px bg-[#E8E8EC]" />
            <span className="text-[11px] text-[#9CA3AF] font-medium capitalize">{label}</span>
            <div className="flex-1 h-px bg-[#E8E8EC]" />
        </div>
    );
}

function isSameDay(a: string, b: string) {
    return new Date(a).toDateString() === new Date(b).toDateString();
}

interface ConversationsClientProps {
    initialConversations: Conversation[];
}

export default function ConversationsClient({ initialConversations }: ConversationsClientProps) {
    const supabase = createClient();
    const { collapsed } = useSidebar();

    // State
    const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
    const [filteredConversations, setFilteredConversations] = useState<Conversation[]>(initialConversations);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [search, setSearch] = useState('');
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingConvs, setLoadingConvs] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [inputText, setInputText] = useState('');
    const [isNoteMode, setIsNoteMode] = useState(false);
    const [showRightPanel, setShowRightPanel] = useState(true);
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showCanned, setShowCanned] = useState(false);
    const [sending, setSending] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const convSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const msgSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    // Skip the initial fetch on mount — data already loaded server-side
    const isMountedRef = useRef(false);

    const activeConversation = conversations.find((c) => c.id === activeConvId) ?? null;
    const activeContact = activeConversation?.contact ?? null;
    const contactName = activeContact?.nombre ?? '';

    // ── Fetch conversations (only when status filter changes after mount) ───
    const fetchConversations = useCallback(async () => {
        setLoadingConvs(true);
        try {
            const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
            const res = await fetch(`/api/conversations${params}`);
            if (res.ok) {
                const data = await res.json();
                setConversations(data);
            }
        } finally {
            setLoadingConvs(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        // On first mount skip the fetch — initialConversations from server is sufficient
        if (!isMountedRef.current) {
            isMountedRef.current = true;
            return;
        }
        fetchConversations();
    }, [fetchConversations]);

    // ── Filter conversations by search ──────────────────────────────────────
    useEffect(() => {
        if (!search.trim()) {
            setFilteredConversations(conversations);
            return;
        }
        const q = search.toLowerCase();
        setFilteredConversations(
            conversations.filter((c) => {
                const name = (c.contact?.nombre ?? '').toLowerCase();
                const phone = (c.contact?.wa_id ?? '').toLowerCase();
                return name.includes(q) || phone.includes(q);
            })
        );
    }, [conversations, search]);

    // ── Fetch messages when conversation changes ────────────────────────────
    const fetchMessages = useCallback(async (convId: string) => {
        setLoadingMessages(true);
        try {
            const res = await fetch(`/api/conversations/${convId}/messages`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
            }
        } finally {
            setLoadingMessages(false);
        }
    }, []);

    useEffect(() => {
        if (!activeConvId) {
            setMessages([]);
            return;
        }
        fetchMessages(activeConvId);

        // Update unread_count to 0 in local state
        setConversations((prev) =>
            prev.map((c) => (c.id === activeConvId ? { ...c, unread_count: 0 } : c))
        );
    }, [activeConvId, fetchMessages]);

    // ── Auto-scroll to bottom ───────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Realtime: subscribe to messages ────────────────────────────────────
    useEffect(() => {
        if (!activeConvId) return;

        // Clean up previous subscription
        if (msgSubscriptionRef.current) {
            supabase.removeChannel(msgSubscriptionRef.current);
        }

        const channel = supabase
            .channel(`messages:${activeConvId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${activeConvId}`,
                },
                (payload) => {
                    const newMsg = payload.new as Message;
                    setMessages((prev) => {
                        // Avoid duplicates (optimistic updates)
                        if (prev.some((m) => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                }
            )
            .subscribe();

        msgSubscriptionRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeConvId, supabase]);

    // ── Realtime: subscribe to conversations table ─────────────────────────
    useEffect(() => {
        if (convSubscriptionRef.current) {
            supabase.removeChannel(convSubscriptionRef.current);
        }

        const channel = supabase
            .channel('conversations-list')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'conversations',
                },
                () => {
                    // Refresh the list on any conversation change
                    fetchConversations();
                }
            )
            .subscribe();

        convSubscriptionRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, fetchConversations]);

    // ── Fetch templates and canned responses ───────────────────────────────
    useEffect(() => {
        async function fetchMeta() {
            const supabaseClient = createClient();
            const [tRes, cRes] = await Promise.all([
                supabaseClient.from('message_templates').select('*').eq('is_active', true).limit(20),
                fetch('/api/settings/canned-responses').then((r) => r.json()),
            ]);
            if (tRes.data) setTemplates(tRes.data as MessageTemplate[]);
            const cannedData = cRes?.responses ?? cRes ?? [];
            if (Array.isArray(cannedData)) setCannedResponses(cannedData as CannedResponse[]);
        }
        fetchMeta();
    }, []);

    // ── Auto-resize textarea ───────────────────────────────────────────────
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [inputText]);

    // ── Send message ───────────────────────────────────────────────────────
    const handleSend = async () => {
        if (!inputText.trim() || !activeConvId || !activeConversation || sending) return;

        const text = inputText.trim();
        setInputText('');
        setSending(true);

        // Optimistic update
        const optimisticMsg: Message = {
            id: `optimistic-${Date.now()}`,
            tenant_id: '',
            contact_id: activeConversation.contact_id,
            conversation_id: activeConvId,
            content: text,
            content_type: 'text',
            direction: 'outbound',
            status: 'pending',
            delivery_status: 'sending',
            sender_type: 'human',
            sent_by: null,
            sent_by_name: 'Agente',
            is_note: isNoteMode,
            media_url: null,
            media_mime_type: null,
            media_filename: null,
            template_name: null,
            template_vars: null,
            wa_message_id: null,
            error_code: null,
            error_message: null,
            created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimisticMsg]);

        try {
            const res = await fetch(`/api/conversations/${activeConvId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: text,
                    content_type: 'text',
                    sent_by_name: 'Agente',
                    is_note: isNoteMode,
                }),
            });

            if (res.ok) {
                const saved = await res.json();
                // Replace optimistic message
                setMessages((prev) =>
                    prev.map((m) => (m.id === optimisticMsg.id ? (saved as Message) : m))
                );
                // Update last_message_at in conversation list
                setConversations((prev) =>
                    prev.map((c) =>
                        c.id === activeConvId
                            ? { ...c, last_message_at: (saved as Message).created_at }
                            : c
                    )
                );
            } else {
                // Remove optimistic message on failure
                setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
            }
        } catch {
            setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── Toggle AI ──────────────────────────────────────────────────────────
    const handleAiToggle = async () => {
        if (!activeConvId || !activeConversation) return;
        const newValue = !activeConversation.ai_enabled;

        // Optimistic
        setConversations((prev) =>
            prev.map((c) => (c.id === activeConvId ? { ...c, ai_enabled: newValue } : c))
        );

        await fetch(`/api/conversations/${activeConvId}/ai-toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ai_enabled: newValue }),
        });
    };

    // ── Resolve conversation ───────────────────────────────────────────────
    const handleResolve = async () => {
        if (!activeConvId) return;
        const { error } = await supabase
            .from('conversations')
            .update({ status: 'resolved' })
            .eq('id', activeConvId);

        if (!error) {
            setConversations((prev) =>
                prev.map((c) => (c.id === activeConvId ? { ...c, status: 'resolved' } : c))
            );
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div
            className={`fixed inset-0 flex bg-[#F8F8FA] transition-all duration-300 ${collapsed ? "lg:left-[72px]" : "lg:left-[260px]"}`}
            style={{ top: 0, bottom: 0 }}
        >
            {/* ── LEFT PANEL: Conversation list ────────────────────────────── */}
            <div className="w-[360px] flex-shrink-0 bg-white border-r border-[#E8E8EC] flex flex-col h-full">
                {/* Header */}
                <div className="px-4 pt-5 pb-3 border-b border-[#E8E8EC]">
                    <h1 className="text-[18px] font-bold text-[#1A1A2E] mb-3">Conversaciones</h1>
                    {/* Filter tabs */}
                    <div className="flex items-center gap-1 mb-3">
                        {STATUS_FILTERS.map((f) => (
                            <button
                                key={f.key}
                                onClick={() => setStatusFilter(f.key)}
                                className={cn(
                                    'px-3 py-1 rounded-full text-[12px] font-medium transition-all',
                                    statusFilter === f.key
                                        ? 'bg-[#1A1A2E] text-white'
                                        : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E8E8EC]'
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    {/* Search */}
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar conversación..."
                            className="w-full pl-9 pr-4 py-2 text-[13px] bg-[#F3F4F6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 transition-all"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                    {loadingConvs ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="w-6 h-6 border-2 border-[#818CF8] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : filteredConversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                            <MessageCircle size={40} className="text-[#E8E8EC] mb-3" />
                            <p className="text-[14px] font-medium text-[#9CA3AF]">Sin conversaciones</p>
                            <p className="text-[12px] text-[#C4C4CE] mt-1">No hay conversaciones que coincidan</p>
                        </div>
                    ) : (
                        filteredConversations.map((conv) => (
                            <ConversationListItem
                                key={conv.id}
                                conversation={conv}
                                isActive={conv.id === activeConvId}
                                onClick={() => setActiveConvId(conv.id)}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* ── CENTER PANEL: Chat area ──────────────────────────────────── */}
            <div className="flex-1 flex flex-col h-full min-w-0">
                {!activeConversation ? (
                    /* Empty state */
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <div className="w-20 h-20 rounded-2xl bg-[#F3F4FF] flex items-center justify-center mb-4">
                            <MessageCircle size={40} className="text-[#818CF8]" />
                        </div>
                        <h2 className="text-[18px] font-bold text-[#1A1A2E] mb-2">Selecciona una conversación</h2>
                        <p className="text-[14px] text-[#9CA3AF] max-w-xs">
                            Elige una conversación de la lista para comenzar a chatear
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Chat header */}
                        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-[#E8E8EC] flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center flex-shrink-0">
                                    <span className="text-white text-[12px] font-semibold">{getInitials(contactName)}</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[15px] font-semibold text-[#1A1A2E]">{contactName}</span>
                                        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', STATUS_COLORS[activeConversation.status])}>
                                            {STATUS_LABELS[activeConversation.status] ?? activeConversation.status}
                                        </span>
                                    </div>
                                    <p className="text-[12px] text-[#9CA3AF]">
                                        {activeContact?.wa_id ?? ''}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* AI Toggle */}
                                <button
                                    onClick={handleAiToggle}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all',
                                        activeConversation.ai_enabled
                                            ? 'bg-[#EEF0FF] text-[#4F46E5] hover:bg-[#E0E2FF]'
                                            : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                                    )}
                                    title={activeConversation.ai_enabled ? 'IA activa — click para tomar control' : 'Humano en control — click para ceder a IA'}
                                >
                                    {activeConversation.ai_enabled ? (
                                        <>
                                            <Bot size={14} />
                                            Ceder a IA
                                        </>
                                    ) : (
                                        <>
                                            <User size={14} />
                                            Tomar control
                                        </>
                                    )}
                                </button>

                                {/* Resolve */}
                                {activeConversation.status !== 'resolved' && (
                                    <button
                                        onClick={handleResolve}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                                    >
                                        <CheckCheck size={14} />
                                        Resolver
                                    </button>
                                )}

                                {/* Toggle right panel */}
                                <button
                                    onClick={() => setShowRightPanel((v) => !v)}
                                    className={cn(
                                        'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                                        showRightPanel ? 'bg-[#F3F4FF] text-[#818CF8]' : 'text-[#9CA3AF] hover:bg-[#F3F4F6]'
                                    )}
                                    title="Toggle panel de contacto"
                                >
                                    <PanelRight size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Messages area */}
                        <div className="flex-1 overflow-y-auto py-4 bg-[#F8F8FA]">
                            {loadingMessages ? (
                                <div className="flex items-center justify-center h-32">
                                    <div className="w-6 h-6 border-2 border-[#818CF8] border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                                    <MessageSquare size={32} className="text-[#E8E8EC] mb-3" />
                                    <p className="text-[13px] text-[#9CA3AF]">Sin mensajes aún. Sé el primero en escribir.</p>
                                </div>
                            ) : (
                                messages.map((msg, idx) => {
                                    const prevMsg = messages[idx - 1];
                                    const showDate = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);
                                    return (
                                        <div key={msg.id}>
                                            {showDate && <DateSeparator date={msg.created_at} />}
                                            <MessageBubble message={msg} />
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input area */}
                        <div className="bg-white border-t border-[#E8E8EC] p-4 flex-shrink-0">
                            {isNoteMode && (
                                <div className="flex items-center gap-2 mb-2 px-2">
                                    <StickyNote size={13} className="text-amber-500" />
                                    <span className="text-[12px] text-amber-600 font-medium">Modo nota interna</span>
                                </div>
                            )}
                            <div className={cn(
                                'flex items-end gap-2 rounded-xl border px-3 py-2 transition-colors',
                                isNoteMode
                                    ? 'border-amber-300 bg-amber-50'
                                    : 'border-[#E8E8EC] bg-white'
                            )}>
                                {/* Emoji */}
                                <button className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors p-1" title="Emoji">
                                    <Smile size={20} />
                                </button>
                                {/* Attach */}
                                <button className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors p-1" title="Adjuntar archivo">
                                    <Paperclip size={20} />
                                </button>

                                {/* Textarea */}
                                <textarea
                                    ref={textareaRef}
                                    value={inputText}
                                    onChange={(e) => {
                                    const val = e.target.value;
                                    setInputText(val);
                                    // Auto-open canned responses when user types // at start
                                    if (val === '//') {
                                        setShowCanned(true);
                                        setShowTemplates(false);
                                    } else if (!val.startsWith('//')) {
                                        // Close canned if user clears the //
                                        if (val === '') setShowCanned(false);
                                    }
                                }}
                                    onKeyDown={handleKeyDown}
                                    rows={1}
                                    placeholder={isNoteMode ? 'Escribe una nota interna...' : 'Escribe un mensaje...'}
                                    className="flex-1 resize-none bg-transparent text-[14px] text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none min-h-[36px] max-h-[120px] py-1.5"
                                    style={{ height: '36px' }}
                                />

                                {/* Templates */}
                                <div className="relative">
                                    <button
                                        onClick={() => { setShowTemplates((v) => !v); setShowCanned(false); }}
                                        className="text-[#9CA3AF] hover:text-[#818CF8] transition-colors p-1"
                                        title="Plantillas"
                                    >
                                        <FileText size={18} />
                                    </button>
                                    {showTemplates && templates.length > 0 && (
                                        <div className="absolute bottom-10 right-0 w-72 bg-white border border-[#E8E8EC] rounded-xl shadow-lg z-20 overflow-hidden">
                                            <div className="px-3 py-2 border-b border-[#E8E8EC] flex items-center justify-between">
                                                <span className="text-[12px] font-semibold text-[#1A1A2E]">Plantillas</span>
                                                <button onClick={() => setShowTemplates(false)}><X size={14} className="text-[#9CA3AF]" /></button>
                                            </div>
                                            <div className="max-h-52 overflow-y-auto">
                                                {templates.map((t) => {
                                                    const body = (t.components as Array<{ type: string; text?: string }> | null)
                                                        ?.find((c) => c.type === 'BODY')?.text ?? '';
                                                    return (
                                                        <button
                                                            key={t.id}
                                                            onClick={() => {
                                                                setInputText(body);
                                                                setShowTemplates(false);
                                                                textareaRef.current?.focus();
                                                            }}
                                                            className="w-full text-left px-3 py-2.5 hover:bg-[#F9FAFB] transition-colors border-b border-[#F3F4F6] last:border-0"
                                                        >
                                                            <p className="text-[12px] font-semibold text-[#1A1A2E]">{t.name}</p>
                                                            <p className="text-[11px] text-[#9CA3AF] truncate">{body}</p>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Quick replies */}
                                <div className="relative">
                                    <button
                                        onClick={() => { setShowCanned((v) => !v); setShowTemplates(false); }}
                                        className="text-[#9CA3AF] hover:text-[#818CF8] transition-colors p-1"
                                        title="Respuestas rápidas"
                                    >
                                        <MessageSquare size={18} />
                                    </button>
                                    {showCanned && cannedResponses.length > 0 && (
                                        <div className="absolute bottom-10 right-0 w-72 bg-white border border-[#E8E8EC] rounded-xl shadow-lg z-20 overflow-hidden">
                                            <div className="px-3 py-2 border-b border-[#E8E8EC] flex items-center justify-between">
                                                <span className="text-[12px] font-semibold text-[#1A1A2E]">Respuestas rápidas</span>
                                                <button onClick={() => setShowCanned(false)}><X size={14} className="text-[#9CA3AF]" /></button>
                                            </div>
                                            <div className="max-h-52 overflow-y-auto">
                                                {cannedResponses.map((cr) => (
                                                    <button
                                                        key={cr.id}
                                                        onClick={() => {
                                                            setInputText(cr.content);
                                                            setShowCanned(false);
                                                            textareaRef.current?.focus();
                                                        }}
                                                        className="w-full text-left px-3 py-2.5 hover:bg-[#F9FAFB] transition-colors border-b border-[#F3F4F6] last:border-0"
                                                    >
                                                        <p className="text-[12px] font-semibold text-[#818CF8]">/{cr.shortcut}</p>
                                                        <p className="text-[11px] text-[#9CA3AF] truncate">{cr.content}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Note toggle */}
                                <button
                                    onClick={() => setIsNoteMode((v) => !v)}
                                    className={cn(
                                        'transition-colors p-1 rounded',
                                        isNoteMode ? 'text-amber-500 bg-amber-100' : 'text-[#9CA3AF] hover:text-amber-500'
                                    )}
                                    title={isNoteMode ? 'Cambiar a mensaje' : 'Cambiar a nota interna'}
                                >
                                    <StickyNote size={18} />
                                </button>

                                {/* Send */}
                                <button
                                    onClick={handleSend}
                                    disabled={!inputText.trim() || sending}
                                    className={cn(
                                        'w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0',
                                        inputText.trim() && !sending
                                            ? 'bg-[#818CF8] hover:bg-[#6366F1] text-white'
                                            : 'bg-[#F3F4F6] text-[#C4C4CE] cursor-not-allowed'
                                    )}
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── RIGHT PANEL: Contact info ────────────────────────────────── */}
            {showRightPanel && activeConversation && activeContact && (
                <ContactPanel
                    contactId={activeContact.id}
                    contactName={contactName}
                    waId={activeContact.wa_id ?? null}
                    email={activeContact.email ?? null}
                    funnelStage={activeContact.funnel_stage as { name: string; color: string | null } | null | undefined}
                    onClose={() => setShowRightPanel(false)}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ContactPanel — rich ManyChat-style right panel
// ─────────────────────────────────────────────────────────────────────────────
type ContactPanelData = {
    tags: Array<{ tag: { id: string; name: string; color: string | null } | null }>;
    custom_fields: Array<{ field_key: string; value: string | null; custom_field: { label: string; field_type: string } | null }>;
    reservations: Array<{ id: string; reservation_date: string; reservation_time: string; party_size: number; status: string; occasion: string | null }>;
    notes: Array<{ id: string; content: string; created_at: string; user: { full_name: string } | null }>;
    activity: Array<{ id: string; activity_type: string; description: string | null; created_at: string; performed_by_name: string | null }>;
};

const RESERVATION_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    pending:   { bg: '#FFFBEB', text: '#D97706' },
    confirmed: { bg: '#EFF6FF', text: '#2563EB' },
    seated:    { bg: '#ECFDF5', text: '#059669' },
    completed: { bg: '#F3F4F6', text: '#6B7280' },
    cancelled: { bg: '#FEF2F2', text: '#DC2626' },
    no_show:   { bg: '#FFF7ED', text: '#EA580C' },
};

const RESERVATION_STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente', confirmed: 'Confirmada', seated: 'En mesa',
    completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió',
};

function formatSmartDateShort(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `hace ${diffD}d`;
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function ContactPanel({
    contactId,
    contactName,
    waId,
    email,
    funnelStage,
    onClose,
}: {
    contactId: string;
    contactName: string;
    waId: string | null;
    email: string | null;
    funnelStage: { name: string; color: string | null } | null | undefined;
    onClose: () => void;
}) {
    const [data, setData] = useState<ContactPanelData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        setData(null);
        fetch(`/api/contacts/${contactId}`)
            .then((r) => r.json())
            .then((d) => {
                setData({
                    tags: d.tags ?? [],
                    custom_fields: d.custom_fields ?? [],
                    reservations: d.reservations ?? [],
                    notes: d.notes ?? [],
                    activity: d.activity ?? [],
                });
            })
            .catch(() => setData({ tags: [], custom_fields: [], reservations: [], notes: [], activity: [] }))
            .finally(() => setLoading(false));
    }, [contactId]);

    const tags = data?.tags.map((ct) => ct.tag).filter(Boolean) as Array<{ id: string; name: string; color: string | null }> ?? [];

    return (
        <div className="w-[300px] flex-shrink-0 bg-white border-l border-[#E8E8EC] flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <div className="p-5 border-b border-[#E8E8EC] flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider">Contacto</span>
                    <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
                        <X size={16} />
                    </button>
                </div>
                <div className="flex flex-col items-center text-center">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center mb-3">
                        <span className="text-white text-[18px] font-bold">{getInitials(contactName)}</span>
                    </div>
                    <h3 className="text-[15px] font-bold text-[#1A1A2E]">{contactName}</h3>
                    {waId && <p className="text-[12px] text-[#9CA3AF] mt-0.5">{waId}</p>}
                    {email && <p className="text-[11px] text-[#C4C4CE] mt-0.5 truncate max-w-full">{email}</p>}
                </div>

                {/* Quick actions */}
                <div className="flex gap-2 mt-3">
                    <Link
                        href={`/contacts/${contactId}`}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-[#E8E8EC] hover:bg-[#F9FAFB] text-[11px] font-medium text-[#6B7280] transition-colors"
                    >
                        <UserCheck size={12} className="text-[#818CF8]" />
                        Perfil completo
                    </Link>
                    <Link
                        href={`/reservations`}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-[#E8E8EC] hover:bg-[#F9FAFB] text-[11px] font-medium text-[#6B7280] transition-colors"
                    >
                        <CalendarCheck size={12} className="text-[#818CF8]" />
                        Reservas
                    </Link>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-32">
                    <div className="w-5 h-5 border-2 border-[#818CF8] border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* Funnel stage */}
                    {funnelStage && (
                        <div className="px-4 py-3 border-b border-[#F3F4F6]">
                            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5">Etapa del funnel</p>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: funnelStage.color ?? '#818CF8' }} />
                                <span className="text-[12px] text-[#1A1A2E] font-medium">{funnelStage.name}</span>
                            </div>
                        </div>
                    )}

                    {/* Tags */}
                    {tags.length > 0 && (
                        <div className="px-4 py-3 border-b border-[#F3F4F6]">
                            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <Tag size={10} /> Etiquetas
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {tags.map((tag) => (
                                    <span key={tag.id} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: `${tag.color ?? '#818CF8'}20`, color: tag.color ?? '#818CF8' }}>
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Custom fields */}
                    {data && data.custom_fields.length > 0 && (
                        <div className="px-4 py-3 border-b border-[#F3F4F6]">
                            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Campos personalizados</p>
                            <dl className="space-y-1.5">
                                {data.custom_fields.map((cf) => (
                                    <div key={cf.field_key} className="flex justify-between gap-2">
                                        <dt className="text-[11px] text-[#9CA3AF] flex-shrink-0">{cf.custom_field?.label ?? cf.field_key}</dt>
                                        <dd className="text-[11px] text-[#1A1A2E] font-medium text-right truncate">{cf.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    )}

                    {/* Reservations */}
                    {data && data.reservations.length > 0 && (
                        <div className="px-4 py-3 border-b border-[#F3F4F6]">
                            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2 flex items-center gap-1">
                                <CalendarCheck size={10} /> Reservas ({data.reservations.length})
                            </p>
                            <div className="space-y-2">
                                {data.reservations.map((r) => {
                                    const sc = RESERVATION_STATUS_COLORS[r.status] ?? RESERVATION_STATUS_COLORS.pending;
                                    return (
                                        <div key={r.id} className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-medium text-[#1A1A2E] truncate">
                                                    {r.reservation_date} · {r.reservation_time.slice(0, 5)}
                                                </p>
                                                <p className="text-[10px] text-[#9CA3AF]">{r.party_size} pers. {r.occasion ? `· ${r.occasion}` : ''}</p>
                                            </div>
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: sc.bg, color: sc.text }}>
                                                {RESERVATION_STATUS_LABELS[r.status] ?? r.status}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {data && data.notes.length > 0 && (
                        <div className="px-4 py-3 border-b border-[#F3F4F6]">
                            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2 flex items-center gap-1">
                                <StickyNote size={10} /> Notas ({data.notes.length})
                            </p>
                            <div className="space-y-2">
                                {data.notes.slice(0, 3).map((note) => (
                                    <div key={note.id} className="bg-amber-50 rounded-lg px-2.5 py-2">
                                        <p className="text-[11px] text-[#1A1A2E] line-clamp-2">{note.content}</p>
                                        <p className="text-[10px] text-[#9CA3AF] mt-0.5">{formatSmartDateShort(note.created_at)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Activity */}
                    {data && data.activity.length > 0 && (
                        <div className="px-4 py-3">
                            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Actividad reciente</p>
                            <div className="space-y-2">
                                {data.activity.slice(0, 5).map((item) => (
                                    <div key={item.id} className="flex gap-2">
                                        <div className="w-1 flex-shrink-0 rounded-full bg-[#E8E8EC] self-stretch min-h-[16px]" />
                                        <div className="min-w-0">
                                            <p className="text-[11px] text-[#1A1A2E] leading-tight">{item.description ?? item.activity_type.replace(/_/g, ' ')}</p>
                                            <p className="text-[10px] text-[#9CA3AF] mt-0.5">{formatSmartDateShort(item.created_at)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {data && data.tags.length === 0 && data.custom_fields.length === 0 && data.reservations.length === 0 && data.notes.length === 0 && data.activity.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                            <p className="text-[12px] text-[#9CA3AF]">No hay más información de este contacto.</p>
                            <Link href={`/contacts/${contactId}`} className="mt-2 text-[12px] text-[#818CF8] hover:underline">
                                Ver perfil completo →
                            </Link>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
