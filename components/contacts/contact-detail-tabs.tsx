'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    MessageCircle,
    UtensilsCrossed,
    FileText,
    Clock,
    ArrowRightLeft,
    UserPlus,
    Pencil as PencilIcon,
    Mail,
    Send,
    StickyNote,
    MessageSquare,
    CheckCheck,
    Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FunnelStageBadge } from '@/components/contacts/funnel-stage-badge';
import { formatSmartDate, formatDate } from '@/lib/utils/format';
import { createClient } from '@/lib/supabase/client';
import { MessageBubble } from '@/components/conversations/message-bubble';
import type {
    ConversationRow,
    ReservationRow,
    NoteRow,
    ActivityRow,
} from '@/app/(dashboard)/contacts/[id]/page';
import type { FunnelStage, Message } from '@/lib/types/database';

// Types mirrored from parent page
type ContactDetail = {
    id: string;
    nombre: string;
    email: string | null;
    wa_id: string | null;
    source: string;
    lead_score: number;
    last_contacted_at: string | null;
    created_at: string;
    funnel_stage_id: string | null;
    assigned_to: string | null;
    funnel_stage: { id: string; name: string; color: string | null; position: number } | null;
    contact_tags: { tag: { id: string; name: string; color: string | null } | null }[];
    contact_field_values: {
        field_key: string;
        value: string | null;
    }[];
};

interface ContactDetailTabsProps {
    contact: ContactDetail;
    conversations: ConversationRow[];
    reservations: ReservationRow[];
    notes: NoteRow[];
    activity: ActivityRow[];
    stages: FunnelStage[];
    contactId: string;
}

type TabKey = 'info' | 'conversations' | 'reservations' | 'notes' | 'activity';

const TABS: { key: TabKey; label: string }[] = [
    { key: 'info', label: 'Información' },
    { key: 'conversations', label: 'Conversaciones' },
    { key: 'reservations', label: 'Reservas' },
    { key: 'notes', label: 'Notas' },
    { key: 'activity', label: 'Actividad' },
];

export function ContactDetailTabs({
    contact,
    conversations,
    reservations,
    notes: initialNotes,
    activity,
    stages,
    contactId,
}: ContactDetailTabsProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('info');
    const [notes, setNotes] = useState(initialNotes);
    const [noteText, setNoteText] = useState('');
    const [noteLoading, setNoteLoading] = useState(false);
    const router = useRouter();

    async function addNote() {
        if (!noteText.trim()) return;
        setNoteLoading(true);
        try {
            const res = await fetch(`/api/contacts/${contactId}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: noteText.trim() }),
            });
            if (res.ok) {
                const { note } = await res.json();
                setNotes((prev) => [note, ...prev]);
                setNoteText('');
                router.refresh();
            }
        } finally {
            setNoteLoading(false);
        }
    }

    return (
        <div>
            {/* Tab bar */}
            <div className="flex items-center gap-0.5 border-b border-[#E8E8EC] mb-6 overflow-x-auto">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2.5 text-[14px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                            activeTab === tab.key
                                ? 'border-[#818CF8] text-[#818CF8]'
                                : 'border-transparent text-[#9CA3AF] hover:text-[#6B7280]'
                        }`}
                    >
                        {tab.label}
                        {tab.key === 'reservations' && reservations.length > 0 && (
                            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#EEF0FF] text-[#818CF8] text-[10px] font-bold">
                                {reservations.length}
                            </span>
                        )}
                        {tab.key === 'conversations' && conversations.length > 0 && (
                            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#EEF0FF] text-[#818CF8] text-[10px] font-bold">
                                {conversations.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab: Información */}
            {activeTab === 'info' && (
                <InfoTab contact={contact} stages={stages} contactId={contactId} />
            )}

            {/* Tab: Conversaciones */}
            {activeTab === 'conversations' && (
                <ConversationsTab conversations={conversations} />
            )}

            {/* Tab: Reservas */}
            {activeTab === 'reservations' && (
                <ReservationsTab reservations={reservations} />
            )}

            {/* Tab: Notas */}
            {activeTab === 'notes' && (
                <NotesTab
                    notes={notes}
                    noteText={noteText}
                    noteLoading={noteLoading}
                    onNoteTextChange={setNoteText}
                    onAddNote={addNote}
                />
            )}

            {/* Tab: Actividad */}
            {activeTab === 'activity' && <ActivityTab activity={activity} />}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Tab: Información
// ---------------------------------------------------------------------------
function InfoTab({
    contact,
    stages,
    contactId,
}: {
    contact: ContactDetail;
    stages: FunnelStage[];
    contactId: string;
}) {
    const [selectedStageId, setSelectedStageId] = useState(contact.funnel_stage_id ?? '');
    const [saving, setSaving] = useState(false);
    const router = useRouter();
    const tags = contact.contact_tags
        .map((ct) => ct.tag)
        .filter(Boolean) as { id: string; name: string; color: string | null }[];
    const customFields = contact.contact_field_values.filter((cfv) => !!cfv.value);

    const sourceLabels: Record<string, string> = {
        manual: 'Manual',
        whatsapp: 'WhatsApp',
        web: 'Web',
        csv: 'CSV',
        api: 'API',
        referral: 'Referido',
    };

    async function changeStage(stageId: string) {
        setSelectedStageId(stageId);
        setSaving(true);
        try {
            await fetch(`/api/contacts/${contactId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ funnel_stage_id: stageId || null }),
            });
            router.refresh();
        } finally {
            setSaving(false);
        }
    }

    const currentStage = stages.find((s) => s.id === selectedStageId);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Fields */}
            <div className="lg:col-span-3 space-y-5">
                {/* Contact fields */}
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-4">
                        Datos del contacto
                    </h3>
                    <dl className="space-y-3">
                        {[
                            ['Nombre', contact.nombre],
                            ['Email', contact.email],
                            ['Teléfono / WhatsApp', contact.wa_id],
                            ['Fuente', sourceLabels[contact.source] ?? contact.source],
                            ['Lead score', `${contact.lead_score} / 100`],
                            ['Creado', formatDate(contact.created_at, 'dd MMM yyyy')],
                        ].map(([label, value]) => (
                            <div key={label as string} className="flex justify-between gap-4">
                                <dt className="text-[13px] text-[#9CA3AF] flex-shrink-0">{label}</dt>
                                <dd className="text-[13px] text-[#1A1A2E] font-medium text-right">
                                    {value || '—'}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>

                {/* Custom fields */}
                {customFields.length > 0 && (
                    <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                        <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-4">
                            Campos personalizados
                        </h3>
                        <dl className="space-y-3">
                            {customFields.map((cfv) => (
                                <div key={cfv.field_key} className="flex justify-between gap-4">
                                    <dt className="text-[13px] text-[#9CA3AF] flex-shrink-0">
                                        {cfv.field_key}
                                    </dt>
                                    <dd className="text-[13px] text-[#1A1A2E] font-medium text-right">
                                        {cfv.value ?? '—'}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                )}
            </div>

            {/* Right: Stage selector + Tags + Assigned */}
            <div className="lg:col-span-2 space-y-5">
                {/* Funnel stage */}
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-3">
                        Etapa del funnel
                    </h3>
                    {currentStage && (
                        <div className="mb-3">
                            <FunnelStageBadge
                                name={currentStage.name}
                                color={currentStage.color}
                            />
                        </div>
                    )}
                    <select
                        value={selectedStageId}
                        onChange={(e) => changeStage(e.target.value)}
                        disabled={saving}
                        className="w-full px-3 py-2.5 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all appearance-none cursor-pointer disabled:opacity-60"
                    >
                        <option value="">Sin etapa</option>
                        {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                    {saving && (
                        <p className="text-[12px] text-[#9CA3AF] mt-1.5">Guardando...</p>
                    )}
                </div>

                {/* Tags */}
                <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                    <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-3">Tags</h3>
                    {tags.length === 0 ? (
                        <p className="text-[13px] text-[#D1D5DB]">Sin tags asignados.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                                <TagPill key={tag.id} name={tag.name} color={tag.color} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Assigned to */}
                {contact.assigned_to && (
                    <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
                        <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-3">
                            Asignado a
                        </h3>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#EEF0FF] flex items-center justify-center flex-shrink-0">
                                <span className="text-[12px] font-semibold text-[#818CF8]">
                                    —
                                </span>
                            </div>
                            <span className="text-[14px] font-medium text-[#1A1A2E]">
                                {contact.assigned_to}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Tab: Conversaciones — inline chat
// ---------------------------------------------------------------------------
const CONV_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    open: { bg: '#ECFDF5', text: '#10B981', label: 'Abierta' },
    pending: { bg: '#FFFBEB', text: '#F59E0B', label: 'Pendiente' },
    snoozed: { bg: '#EFF6FF', text: '#3B82F6', label: 'Pospuesta' },
    resolved: { bg: '#F3F4F6', text: '#6B7280', label: 'Resuelta' },
};

function isSameDay(a: string, b: string) {
    return new Date(a).toDateString() === new Date(b).toDateString();
}

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

function ConversationsTab({ conversations }: { conversations: ConversationRow[] }) {
    const supabase = createClient();
    const [selectedId, setSelectedId] = useState<string>(conversations[0]?.id ?? '');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [inputText, setInputText] = useState('');
    const [isNoteMode, setIsNoteMode] = useState(false);
    const [sending, setSending] = useState(false);
    const [convStatuses, setConvStatuses] = useState<Record<string, string>>(
        Object.fromEntries(conversations.map((c) => [c.id, c.status]))
    );
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const msgSubRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const selectedConv = conversations.find((c) => c.id === selectedId) ?? conversations[0];

    // Fetch messages
    const fetchMessages = useCallback(async (convId: string) => {
        if (!convId) return;
        setLoadingMessages(true);
        try {
            const res = await fetch(`/api/conversations/${convId}/messages`);
            if (res.ok) setMessages(await res.json());
        } finally {
            setLoadingMessages(false);
        }
    }, []);

    useEffect(() => {
        if (selectedId) fetchMessages(selectedId);
    }, [selectedId, fetchMessages]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Realtime subscription
    useEffect(() => {
        if (!selectedId) return;
        if (msgSubRef.current) supabase.removeChannel(msgSubRef.current);

        const ch = supabase
            .channel(`contact-chat:${selectedId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'messages',
                filter: `conversation_id=eq.${selectedId}`,
            }, (payload) => {
                const newMsg = payload.new as Message;
                setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
            })
            .subscribe();

        msgSubRef.current = ch;
        return () => { supabase.removeChannel(ch); };
    }, [selectedId, supabase]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [inputText]);

    const handleSend = async () => {
        if (!inputText.trim() || !selectedId || sending) return;
        const text = inputText.trim();
        setInputText('');
        setSending(true);

        const optimistic: Message = {
            id: `opt-${Date.now()}`,
            tenant_id: '',
            contact_id: selectedConv?.id ?? '',
            conversation_id: selectedId,
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
        setMessages((prev) => [...prev, optimistic]);

        try {
            const res = await fetch(`/api/conversations/${selectedId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text, content_type: 'text', sent_by_name: 'Agente', is_note: isNoteMode }),
            });
            if (res.ok) {
                const saved = await res.json();
                setMessages((prev) => prev.map((m) => m.id === optimistic.id ? (saved as Message) : m));
            } else {
                setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
            }
        } catch {
            setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        } finally {
            setSending(false);
        }
    };

    const handleResolve = async () => {
        if (!selectedId) return;
        await supabase.from('conversations').update({ status: 'resolved' }).eq('id', selectedId);
        setConvStatuses((prev) => ({ ...prev, [selectedId]: 'resolved' }));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    if (conversations.length === 0) {
        return (
            <EmptySection
                icon={<MessageCircle size={22} className="text-[#818CF8]" />}
                title="Sin conversaciones"
                description="Este contacto no tiene conversaciones registradas aún."
            />
        );
    }

    const currentStatus = convStatuses[selectedId] ?? selectedConv?.status ?? 'open';
    const statusStyle = CONV_STATUS_STYLES[currentStatus] ?? CONV_STATUS_STYLES.resolved;

    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden flex flex-col" style={{ height: '520px' }}>
            {/* Conversation selector (if multiple) */}
            {conversations.length > 1 && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#E8E8EC] overflow-x-auto flex-shrink-0">
                    {conversations.map((conv) => {
                        const s = CONV_STATUS_STYLES[convStatuses[conv.id] ?? conv.status] ?? CONV_STATUS_STYLES.resolved;
                        return (
                            <button
                                key={conv.id}
                                onClick={() => setSelectedId(conv.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                                    conv.id === selectedId
                                        ? 'bg-[#EEF0FF] text-[#4F46E5]'
                                        : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E8E8EC]'
                                }`}
                            >
                                <MessageCircle size={12} />
                                <span className="capitalize">{conv.channel.replace('_', ' ')}</span>
                                <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: s.text }}
                                />
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E8EC] flex-shrink-0 bg-[#FAFAFE]">
                <div className="flex items-center gap-2">
                    <MessageCircle size={15} className="text-[#818CF8]" />
                    <span className="text-[13px] font-semibold text-[#1A1A2E] capitalize">
                        {selectedConv?.channel.replace('_', ' ')}
                    </span>
                    <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                    >
                        {statusStyle.label}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {currentStatus !== 'resolved' && (
                        <button
                            onClick={handleResolve}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                        >
                            <CheckCheck size={13} />
                            Resolver
                        </button>
                    )}
                    <Link
                        href={`/conversations?id=${selectedId}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
                    >
                        <Bot size={13} />
                        Ver en Conversaciones
                    </Link>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-3 bg-[#F8F8FA]">
                {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="w-5 h-5 border-2 border-[#818CF8] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-8">
                        <MessageSquare size={28} className="text-[#E8E8EC] mb-2" />
                        <p className="text-[13px] text-[#9CA3AF]">Sin mensajes aún.</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const prev = messages[idx - 1];
                        const showDate = !prev || !isSameDay(prev.created_at, msg.created_at);
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

            {/* Input */}
            <div className="bg-white border-t border-[#E8E8EC] px-3 py-2.5 flex-shrink-0">
                {isNoteMode && (
                    <div className="flex items-center gap-1.5 mb-1.5 px-1">
                        <StickyNote size={12} className="text-amber-500" />
                        <span className="text-[11px] text-amber-600 font-medium">Modo nota interna</span>
                    </div>
                )}
                <div className={`flex items-end gap-2 rounded-xl border px-3 py-2 transition-colors ${
                    isNoteMode ? 'border-amber-300 bg-amber-50' : 'border-[#E8E8EC] bg-white'
                }`}>
                    <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        placeholder={isNoteMode ? 'Escribe una nota interna...' : 'Escribe un mensaje...'}
                        className="flex-1 resize-none bg-transparent text-[13px] text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none min-h-[32px] max-h-[100px] py-1"
                        style={{ height: '32px' }}
                    />
                    <button
                        onClick={() => setIsNoteMode((v) => !v)}
                        className={`transition-colors p-1 rounded flex-shrink-0 ${
                            isNoteMode ? 'text-amber-500 bg-amber-100' : 'text-[#9CA3AF] hover:text-amber-500'
                        }`}
                        title={isNoteMode ? 'Cambiar a mensaje' : 'Nota interna'}
                    >
                        <StickyNote size={16} />
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={!inputText.trim() || sending}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                            inputText.trim() && !sending
                                ? 'bg-[#818CF8] hover:bg-[#6366F1] text-white'
                                : 'bg-[#F3F4F6] text-[#C4C4CE] cursor-not-allowed'
                        }`}
                    >
                        <Send size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Tab: Reservas
// ---------------------------------------------------------------------------
const RESERVATION_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: '#FFFBEB', text: '#F59E0B', label: 'Pendiente' },
    confirmed: { bg: '#EFF6FF', text: '#3B82F6', label: 'Confirmada' },
    seated: { bg: '#ECFDF5', text: '#10B981', label: 'Sentado' },
    completed: { bg: '#F3F4F6', text: '#6B7280', label: 'Completada' },
    cancelled: { bg: '#FEF2F2', text: '#EF4444', label: 'Cancelada' },
    no_show: { bg: '#FEF2F2', text: '#F97316', label: 'No show' },
};

function ReservationsTab({ reservations }: { reservations: ReservationRow[] }) {
    if (reservations.length === 0) {
        return (
            <EmptySection
                icon={<UtensilsCrossed size={22} className="text-[#818CF8]" />}
                title="Sin reservas"
                description="Este contacto aún no tiene reservas en el restaurante."
            />
        );
    }

    return (
        <>
            <div className="mb-4 flex items-center gap-2">
                <UtensilsCrossed size={16} className="text-[#818CF8]" />
                <span className="text-[14px] font-semibold text-[#1A1A2E]">
                    {reservations.length} {reservations.length === 1 ? 'visita' : 'visitas'} al
                    restaurante
                </span>
            </div>
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-[#E8E8EC]">
                                {['Fecha', 'Hora', 'Personas', 'Mesa', 'Estado'].map((h) => (
                                    <th
                                        key={h}
                                        className="text-left px-5 py-3 text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wider"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {reservations.map((r) => {
                                const style =
                                    RESERVATION_STATUS_STYLES[r.status] ??
                                    RESERVATION_STATUS_STYLES.pending;
                                return (
                                    <tr
                                        key={r.id}
                                        className="border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFE] transition-colors"
                                    >
                                        <td className="px-5 py-3.5 text-[13px] text-[#1A1A2E] font-medium">
                                            {formatDate(r.reservation_date)}
                                        </td>
                                        <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">
                                            {r.reservation_time.slice(0, 5)}
                                        </td>
                                        <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">
                                            {r.party_size}
                                        </td>
                                        <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">
                                            {r.table?.name ?? '—'}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span
                                                className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                                                style={{
                                                    backgroundColor: style.bg,
                                                    color: style.text,
                                                }}
                                            >
                                                {style.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Tab: Notas
// ---------------------------------------------------------------------------
function NotesTab({
    notes,
    noteText,
    noteLoading,
    onNoteTextChange,
    onAddNote,
}: {
    notes: NoteRow[];
    noteText: string;
    noteLoading: boolean;
    onNoteTextChange: (v: string) => void;
    onAddNote: () => void;
}) {
    return (
        <div className="space-y-5">
            {/* Add note */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5">
                <textarea
                    rows={3}
                    placeholder="Escribe una nota sobre este contacto..."
                    value={noteText}
                    onChange={(e) => onNoteTextChange(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] bg-[#F9FAFB] border border-[#E8E8EC] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] transition-all placeholder:text-[#D1D5DB] mb-3"
                />
                <div className="flex justify-end">
                    <Button
                        onClick={onAddNote}
                        disabled={noteLoading || !noteText.trim()}
                        className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
                    >
                        <Send size={14} />
                        {noteLoading ? 'Guardando...' : 'Añadir nota'}
                    </Button>
                </div>
            </div>

            {/* Notes list */}
            {notes.length === 0 ? (
                <EmptySection
                    icon={<FileText size={22} className="text-[#818CF8]" />}
                    title="Sin notas"
                    description="Añade tu primera nota sobre este contacto."
                />
            ) : (
                <div className="space-y-3">
                    {notes.map((note) => (
                        <div
                            key={note.id}
                            className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-5"
                        >
                            <p className="text-[14px] text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
                                {note.content}
                            </p>
                            <div className="flex items-center gap-3 mt-3">
                                {note.user && (
                                    <span className="text-[12px] text-[#6B7280] font-medium">
                                        {note.user.full_name}
                                    </span>
                                )}
                                <span className="text-[12px] text-[#9CA3AF]">
                                    {formatSmartDate(note.created_at)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Tab: Actividad
// ---------------------------------------------------------------------------
const ACTION_ICON_MAP: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    email_sent: { icon: Mail, color: '#818CF8', bg: '#EEF0FF' },
    email_opened: { icon: Mail, color: '#34D399', bg: '#ECFDF5' },
    email_replied: { icon: Mail, color: '#10B981', bg: '#D1FAE5' },
    wa_message_sent: { icon: MessageCircle, color: '#34D399', bg: '#ECFDF5' },
    wa_message_received: { icon: MessageCircle, color: '#34D399', bg: '#ECFDF5' },
    stage_changed: { icon: ArrowRightLeft, color: '#A78BFA', bg: '#F5F3FF' },
    phase_changed: { icon: ArrowRightLeft, color: '#A78BFA', bg: '#F5F3FF' },
    note_added: { icon: PencilIcon, color: '#FBBF24', bg: '#FFFBEB' },
    reservation_created: { icon: UtensilsCrossed, color: '#F97316', bg: '#FFF7ED' },
    contact_created: { icon: UserPlus, color: '#818CF8', bg: '#EEF0FF' },
    contact_updated: { icon: FileText, color: '#9CA3AF', bg: '#F3F4F6' },
};

function ActivityTab({ activity }: { activity: ActivityRow[] }) {
    if (activity.length === 0) {
        return (
            <EmptySection
                icon={<Clock size={22} className="text-[#818CF8]" />}
                title="Sin actividad"
                description="No hay actividad registrada para este contacto aún."
            />
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6">
            <div className="space-y-0">
                {activity.map((item, idx) => {
                    const key = item.activity_type ?? 'contact_updated';
                    const config = ACTION_ICON_MAP[key] ?? ACTION_ICON_MAP.contact_updated;
                    const Icon = config.icon;
                    return (
                        <div key={item.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                                <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: config.bg }}
                                >
                                    <Icon size={15} style={{ color: config.color }} />
                                </div>
                                {idx < activity.length - 1 && (
                                    <div className="w-px flex-1 bg-[#E8E8EC] min-h-[20px] my-1" />
                                )}
                            </div>
                            <div className="pb-5 min-w-0">
                                <p className="text-[13px] text-[#1A1A2E] leading-relaxed">
                                    {item.description ?? key.replace(/_/g, ' ')}
                                </p>
                                <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                                    {formatSmartDate(item.created_at)}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function TagPill({ name, color }: { name: string; color: string | null }) {
    const hex = color ?? '#9CA3AF';
    let r = 156, g = 163, b = 175;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    return (
        <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium"
            style={{ backgroundColor: `rgba(${r},${g},${b},0.12)`, color: hex }}
        >
            {name}
        </span>
    );
}

function EmptySection({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center bg-white rounded-2xl border border-[#E8E8EC] shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF0FF] flex items-center justify-center mb-4">
                {icon}
            </div>
            <p className="text-[15px] font-semibold text-[#1A1A2E] mb-1">{title}</p>
            <p className="text-[13px] text-[#9CA3AF] max-w-xs">{description}</p>
        </div>
    );
}
