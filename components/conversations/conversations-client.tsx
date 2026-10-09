'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
    X,
    PanelRight,
    StickyNote,
    UserCheck,
    Tag,
    CalendarCheck,
    Pencil as PencilIcon,
    Plus,
    Eye,
    EyeOff,
    RotateCcw,
    Clock,
    Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getInitials } from '@/lib/utils/format';
import { useSupabaseClient } from '@/lib/supabase/client';
import { useSidebar } from '@/components/layout/sidebar-provider';
import { useHasModule, useTenantId } from '@/components/providers/tenant-provider';
import { ConversationListItem } from '@/components/conversations/conversation-list-item';
import { MessageBubble } from '@/components/conversations/message-bubble';
import { ContactAppointments } from '@/components/appointments/contact-appointments';
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

// ── Common emojis for picker ───────────────────────────────────────────────────
const COMMON_EMOJIS = [
    '😀','😂','😍','🥰','😎','🤔','😅','😭','🙏','👍',
    '👎','❤️','🔥','✅','⭐','🎉','💪','😊','🤝','👋',
    '😁','🥳','😢','😡','💯','🚀','💡','📌','⚠️','✨',
    '🌟','💬','📞','📧','🏠','🍕','☕','🎂','🎁','💰',
    '📊','📈','🔍','✏️','📝','🔔','💎','🌈','🦋','🐝',
    '🌺','🍀','💐','🌙','☀️','⛅','🌊',
];

/** How long we wait for n8n to confirm a sent message before warning the agent. */
const CONFIRM_TIMEOUT_MS = 45_000;
const SHOW_NOTES_KEY = 'aikon.chat.showNotesAndActions';

type ActivityItem = {
    id: string;
    activity_type: string;
    description: string | null;
    performed_by_name: string | null;
    channel: string | null;
    created_at: string;
};

/** A message the agent sent that n8n hasn't confirmed yet. */
type PendingMessage = Message & {
    pending_state: 'sending' | 'unconfirmed' | 'failed';
    pending_error?: string;
};

type Panel = 'templates' | 'canned' | 'emoji' | null;

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

function ActivityChip({ item }: { item: ActivityItem }) {
    const isAi = item.channel === 'n8n' || item.performed_by_name === 'IA';
    const time = new Date(item.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    return (
        <div className="flex justify-center my-1.5 px-4">
            <div className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] max-w-[85%]',
                isAi ? 'bg-violet-50 text-violet-700' : 'bg-[#F3F4F6] text-[#6B7280]'
            )}>
                {isAi ? <Bot size={11} className="flex-shrink-0" /> : <Zap size={11} className="flex-shrink-0" />}
                <span className="truncate">
                    <span className="font-medium">{item.performed_by_name ?? 'Sistema'}</span>
                    {' · '}{item.description ?? item.activity_type.replace(/_/g, ' ')}
                </span>
                <span className="opacity-60 flex-shrink-0">{time}</span>
            </div>
        </div>
    );
}

function isSameDay(a: string, b: string) {
    return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Returns the value if it's an array, otherwise an empty array (e.g. an API error object). */
function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}

/** Template body text and its {{n}} / {{name}} placeholders. */
function templateBody(t: MessageTemplate): { text: string; vars: string[] } {
    const text = (t.components as Array<{ type: string; text?: string }> | null)
        ?.find((c) => c.type === 'BODY')?.text ?? '';
    const vars = [...new Set((text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((v) => v.replace(/[{}\s]/g, '')))];
    return { text, vars };
}

/** Canned response shortcuts are stored as "/bienvenida"; compare without the slash. */
function bareShortcut(shortcut: string | null): string {
    return (shortcut ?? '').replace(/^\/+/, '').toLowerCase();
}

async function readError(res: Response, fallback: string): Promise<string> {
    const data = await res.json().catch(() => ({}));
    return (data as { error?: string }).error || fallback;
}

interface ConversationsClientProps {
    initialConversations: Conversation[];
}

export default function ConversationsClient({ initialConversations }: ConversationsClientProps) {
    const supabase = useSupabaseClient();
    const { collapsed } = useSidebar();
    const tenantId = useTenantId();

    // State
    const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [search, setSearch] = useState('');
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [pending, setPending] = useState<PendingMessage[]>([]);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [loadingConvs, setLoadingConvs] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [inputText, setInputText] = useState('');
    const [isNoteMode, setIsNoteMode] = useState(false);
    const [showRightPanel, setShowRightPanel] = useState(true);
    const [showNotesAndActions, setShowNotesAndActions] = useState(true);
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
    const [panel, setPanel] = useState<Panel>(null);
    const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
    const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);
    const [notesVersion, setNotesVersion] = useState(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusFilterRef = useRef<StatusFilter>('all');
    const activeConvIdRef = useRef<string | null>(null);

    const activeConversation = conversations.find((c) => c.id === activeConvId) ?? null;
    const activeContact = activeConversation?.contact ?? null;
    const contactName = activeContact?.nombre ?? '';

    useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

    // Deep link: /conversations?contact=<id> opens that contact's chat
    const deepLinkDone = useRef(false);
    useEffect(() => {
        if (deepLinkDone.current) return;
        const contactId = new URLSearchParams(window.location.search).get('contact');
        if (!contactId) { deepLinkDone.current = true; return; }
        const conv = conversations.find((c) => c.contact_id === contactId);
        if (conv) {
            deepLinkDone.current = true;
            setActiveConvId(conv.id);
        }
    }, [conversations]);

    // Remembered per browser: show/hide notes and actions in the chat
    useEffect(() => {
        try {
            if (localStorage.getItem(SHOW_NOTES_KEY) === '0') setShowNotesAndActions(false);
        } catch { /* storage unavailable */ }
    }, []);
    function toggleNotesAndActions() {
        setShowNotesAndActions((v) => {
            try { localStorage.setItem(SHOW_NOTES_KEY, v ? '0' : '1'); } catch { /* ignore */ }
            return !v;
        });
    }

    // ── Conversations ──────────────────────────────────────────────────────
    // silent: realtime refreshes keep the list on screen (no spinner, no flicker)
    const fetchConversations = useCallback(async (silent = false) => {
        if (!silent) setLoadingConvs(true);
        try {
            const filter = statusFilterRef.current;
            const params = filter !== 'all' ? `?status=${filter}` : '';
            const res = await fetch(`/api/conversations${params}`);
            if (!res.ok) {
                if (!silent) toast.error(await readError(res, 'No se pudieron cargar las conversaciones'));
                return;
            }
            const data = await res.json();
            if (Array.isArray(data)) setConversations(data);
        } catch {
            if (!silent) toast.error('Error de conexión al cargar las conversaciones');
        } finally {
            if (!silent) setLoadingConvs(false);
        }
    }, []);

    const scheduleRefresh = useCallback(() => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => fetchConversations(true), 250);
    }, [fetchConversations]);

    function changeFilter(filter: StatusFilter) {
        statusFilterRef.current = filter;
        setStatusFilter(filter);
        fetchConversations();
    }

    const filteredConversations = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q
            ? conversations.filter((c) =>
                (c.contact?.nombre ?? '').toLowerCase().includes(q) ||
                (c.contact?.wa_id ?? '').toLowerCase().includes(q))
            : conversations;
        // The chat the agent is looking at is never "unread"
        return list.map((c) => (c.id === activeConvId && c.unread_count > 0 ? { ...c, unread_count: 0 } : c));
    }, [conversations, search, activeConvId]);

    // Mark the open chat as seen (debounced; used when new messages arrive while it's open)
    const markRead = useCallback((convId: string) => {
        if (readTimer.current) clearTimeout(readTimer.current);
        readTimer.current = setTimeout(() => {
            fetch(`/api/conversations/${convId}/read`, { method: 'POST' }).catch(() => { /* retried on next message */ });
        }, 400);
        setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)));
    }, []);

    // ── Open a conversation: messages + actions ────────────────────────────
    useEffect(() => {
        setPending([]);
        setSelectedTemplate(null);
        setPanel(null);
        if (!activeConvId) {
            setMessages([]);
            setActivity([]);
            return;
        }
        let cancelled = false;
        setLoadingMessages(true);
        setMessages([]);
        setActivity([]);
        Promise.all([
            fetch(`/api/conversations/${activeConvId}/messages`),   // also marks it as read
            fetch(`/api/conversations/${activeConvId}/activity`),
        ])
            .then(async ([mRes, aRes]) => {
                if (cancelled) return;
                if (!mRes.ok) {
                    toast.error(await readError(mRes, 'No se pudieron cargar los mensajes'));
                } else {
                    setMessages(asArray<Message>(await mRes.json()));
                }
                if (aRes.ok) setActivity(asArray<ActivityItem>(await aRes.json()));
            })
            .catch(() => { if (!cancelled) toast.error('Error de conexión al cargar la conversación'); })
            .finally(() => { if (!cancelled) setLoadingMessages(false); });

        setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, unread_count: 0 } : c)));
        return () => { cancelled = true; };
    }, [activeConvId]);

    // ── Auto-scroll to bottom ───────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pending, activity, showNotesAndActions]);

    // ── Realtime: messages of the open conversation (new + status updates) ─
    useEffect(() => {
        if (!activeConvId) return;
        const channel = supabase
            .channel(`messages:${activeConvId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConvId}`,
            }, (payload) => {
                const msg = payload.new as Message;
                setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
                // The confirmed copy of something the agent sent replaces its pending bubble
                if (msg.direction === 'outbound' && msg.sender_type === 'human' && !msg.is_note) {
                    setPending((prev) => {
                        const idx = prev.findIndex((p) => (p.content ?? '').trim() === (msg.content ?? '').trim());
                        return idx === -1 ? prev.slice(1) : prev.filter((_, i) => i !== idx);
                    });
                    if (msg.status === 'failed') {
                        toast.error(`WhatsApp rechazó el mensaje: ${msg.error_message ?? 'error del proveedor'}`);
                    }
                }
                if (msg.direction === 'inbound') markRead(activeConvId);
                // Notes (agent or AI) also live in the side panel
                if (msg.is_note) setNotesVersion((v) => v + 1);
            })
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConvId}`,
            }, (payload) => {
                const msg = payload.new as Message;
                setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [activeConvId, supabase, markRead]);

    // ── Realtime: actions on the open conversation's contact ──────────────
    const activeContactId = activeConversation?.contact_id ?? null;
    useEffect(() => {
        if (!activeContactId) return;
        const channel = supabase
            .channel(`activity:${activeContactId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'activity_log', filter: `contact_id=eq.${activeContactId}`,
            }, (payload) => {
                const item = payload.new as ActivityItem;
                setActivity((prev) => (prev.some((a) => a.id === item.id) ? prev : [...prev, item]));
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [activeContactId, supabase]);

    // ── Realtime: conversation list (new chats, previews, unread) ──────────
    useEffect(() => {
        const channel = supabase
            .channel('conversations-list')
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'conversations', filter: `tenant_id=eq.${tenantId}`,
            }, (payload) => {
                const row = payload.new as Partial<Conversation> | undefined;
                // Patch the row in place right away, then reconcile with the server
                if (row?.id) {
                    setConversations((prev) => prev.map((c) => (
                        c.id === row.id
                            ? {
                                ...c,
                                ...row,
                                contact: c.contact,
                                unread_count: row.id === activeConvIdRef.current ? 0 : (row.unread_count ?? c.unread_count),
                            }
                            : c
                    )));
                    if (row.id === activeConvIdRef.current && (row.unread_count ?? 0) > 0) markRead(row.id);
                }
                scheduleRefresh();
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [supabase, tenantId, scheduleRefresh, markRead]);

    // ── Templates and quick replies ─────────────────────────────────────────
    useEffect(() => {
        async function fetchMeta() {
            const [tRes, cRes] = await Promise.all([
                fetch('/api/templates').then((r) => r.json()).catch(() => null),
                fetch('/api/settings/canned-responses').then((r) => r.json()).catch(() => null),
            ]);
            const allTemplates: MessageTemplate[] = Array.isArray(tRes?.templates) ? tRes.templates : [];
            setTemplates(allTemplates.filter((t) => t.status === 'APPROVED'));
            setCannedResponses(asArray<CannedResponse>(cRes?.responses ?? cRes));
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

    // Typing "/" at the start filters quick replies by shortcut
    const slashQuery = inputText.startsWith('/') ? inputText.slice(1).toLowerCase() : null;
    const visibleCanned = useMemo(() => {
        if (slashQuery === null || panel !== 'canned') return cannedResponses;
        return cannedResponses.filter((cr) =>
            bareShortcut(cr.shortcut).startsWith(slashQuery) || cr.title.toLowerCase().includes(slashQuery));
    }, [cannedResponses, slashQuery, panel]);

    // ── Emoji insert at cursor ─────────────────────────────────────────────
    function insertEmoji(emoji: string) {
        const ta = textareaRef.current;
        if (!ta) {
            setInputText((v) => v + emoji);
            return;
        }
        const start = ta.selectionStart ?? inputText.length;
        const end = ta.selectionEnd ?? inputText.length;
        setInputText(inputText.slice(0, start) + emoji + inputText.slice(end));
        setPanel(null);
        setTimeout(() => {
            ta.focus();
            ta.setSelectionRange(start + emoji.length, start + emoji.length);
        }, 0);
    }

    // ── Pending bubbles (sent, waiting for n8n) ────────────────────────────
    function addPending(conv: Conversation, content: string, contentType: Message['content_type'] = 'text'): PendingMessage {
        const msg: PendingMessage = {
            id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            tenant_id: '',
            contact_id: conv.contact_id,
            conversation_id: conv.id,
            content,
            content_type: contentType,
            direction: 'outbound',
            status: 'pending',
            delivery_status: 'sending',
            sender_type: 'human',
            sent_by: null,
            sent_by_name: null,
            is_note: false,
            media_url: null,
            media_mime_type: null,
            media_filename: null,
            template_name: null,
            template_vars: null,
            wa_message_id: null,
            error_code: null,
            error_message: null,
            created_at: new Date().toISOString(),
            pending_state: 'sending',
        };
        setPending((prev) => [...prev, msg]);
        // n8n confirms through realtime; if it doesn't, tell the agent
        setTimeout(() => {
            setPending((prev) => prev.map((p) => (p.id === msg.id && p.pending_state === 'sending'
                ? { ...p, pending_state: 'unconfirmed' }
                : p)));
        }, CONFIRM_TIMEOUT_MS);
        return msg;
    }

    function failPending(id: string, error: string) {
        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, pending_state: 'failed', pending_error: error } : p)));
    }

    function retryPending(p: PendingMessage) {
        setPending((prev) => prev.filter((x) => x.id !== p.id));
        setInputText(p.content ?? '');
        textareaRef.current?.focus();
    }

    // ── File upload ────────────────────────────────────────────────────────
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeConvId || !activeConversation) return;

        const contentType = file.type.startsWith('image/') ? 'image'
            : file.type.startsWith('video/') ? 'video'
            : 'document';

        setSending(true);
        const toastId = toast.loading(`Subiendo ${file.name}…`);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch(`/api/conversations/${activeConvId}/attachments`, {
                method: 'POST',
                body: formData,
            });
            if (!uploadRes.ok) {
                toast.error(await readError(uploadRes, 'Error al subir el archivo'), { id: toastId });
                return;
            }
            const upload = await uploadRes.json();

            const res = await fetch(`/api/conversations/${activeConvId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: file.name,
                    content_type: contentType,
                    media_url: upload.url,
                    media_filename: file.name,
                    media_mime_type: file.type,
                    is_note: false,
                }),
            });
            if (!res.ok) {
                toast.error(await readError(res, 'No se pudo enviar el archivo'), { id: toastId });
                return;
            }
            addPending(activeConversation, file.name, contentType);
            toast.success('Archivo enviado a WhatsApp', { id: toastId });
        } catch {
            toast.error('Error de conexión al enviar el archivo', { id: toastId });
        } finally {
            setSending(false);
            if (e.target) e.target.value = '';
        }
    };

    // ── Send text message or note ──────────────────────────────────────────
    const handleSend = async () => {
        const text = inputText.trim();
        if (!text || !activeConvId || !activeConversation || sending) return;
        if (!isNoteMode && windowClosed) {
            toast.error('La ventana de 24 h está cerrada. Envía una plantilla para retomar la conversación.');
            return;
        }

        setInputText('');
        setPanel(null);
        setSending(true);

        if (isNoteMode) {
            try {
                const res = await fetch(`/api/conversations/${activeConvId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: text, is_note: true }),
                });
                if (!res.ok) {
                    toast.error(await readError(res, 'No se pudo guardar la nota'));
                    setInputText(text);
                    return;
                }
                const saved = (await res.json()) as Message;
                setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
                setNotesVersion((v) => v + 1);
                toast.success('Nota guardada');
            } catch {
                toast.error('Error de conexión al guardar la nota');
                setInputText(text);
            } finally {
                setSending(false);
            }
            return;
        }

        const optimistic = addPending(activeConversation, text);
        try {
            const res = await fetch(`/api/conversations/${activeConvId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text, content_type: 'text', is_note: false }),
            });
            if (!res.ok) {
                const error = await readError(res, 'Error al enviar el mensaje');
                failPending(optimistic.id, error);
                toast.error(error);
            }
        } catch {
            failPending(optimistic.id, 'Error de conexión');
            toast.error('Error de conexión al enviar el mensaje');
        } finally {
            setSending(false);
        }
    };

    // ── Send WhatsApp template ─────────────────────────────────────────────
    const handleSendTemplate = async () => {
        if (!selectedTemplate || !activeConvId || !activeConversation || sending) return;
        const { text, vars } = templateBody(selectedTemplate);
        const missing = vars.filter((v) => !(templateVars[v] ?? '').trim());
        if (missing.length > 0) {
            toast.error(`Completa las variables: ${missing.map((v) => `{{${v}}}`).join(', ')}`);
            return;
        }
        const rendered = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => templateVars[k] ?? m);

        setSending(true);
        const optimistic = addPending(activeConversation, rendered, 'template');
        try {
            const res = await fetch(`/api/conversations/${activeConvId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content_type: 'template',
                    template_id: selectedTemplate.id,
                    template_variables: templateVars,
                }),
            });
            if (!res.ok) {
                const error = await readError(res, 'No se pudo enviar la plantilla');
                failPending(optimistic.id, error);
                toast.error(error);
                return;
            }
            toast.success(`Plantilla "${selectedTemplate.name}" enviada a WhatsApp`);
            setSelectedTemplate(null);
            setTemplateVars({});
            setPanel(null);
        } catch {
            failPending(optimistic.id, 'Error de conexión');
            toast.error('Error de conexión al enviar la plantilla');
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // With the quick-reply list open from "/", Enter picks the first match
            if (panel === 'canned' && slashQuery !== null && visibleCanned.length > 0) {
                pickCanned(visibleCanned[0]);
                return;
            }
            handleSend();
        }
        if (e.key === 'Escape') setPanel(null);
    };

    function pickCanned(cr: CannedResponse) {
        setInputText(cr.content);
        setPanel(null);
        textareaRef.current?.focus();
    }

    // ── Toggle AI ──────────────────────────────────────────────────────────
    const handleAiToggle = async () => {
        if (!activeConvId || !activeConversation) return;
        const convId = activeConvId;
        const newValue = !activeConversation.ai_enabled;
        setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, ai_enabled: newValue } : c)));
        try {
            const res = await fetch(`/api/conversations/${convId}/ai-toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ai_enabled: newValue }),
            });
            if (!res.ok) throw new Error(await readError(res, 'No se pudo cambiar el modo de la IA'));
            toast.success(newValue ? 'La IA responderá en esta conversación' : 'Tomaste el control: la IA no responderá');
        } catch (err) {
            setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, ai_enabled: !newValue } : c)));
            toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el modo de la IA');
        }
    };

    // ── Change status (resolve / reopen) ───────────────────────────────────
    const handleStatus = async (status: ConversationStatus) => {
        if (!activeConvId) return;
        const convId = activeConvId;
        try {
            const res = await fetch(`/api/conversations/${convId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) {
                toast.error(await readError(res, 'No se pudo cambiar el estado'));
                return;
            }
            setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, status } : c)));
            toast.success(status === 'resolved' ? 'Conversación resuelta' : 'Conversación reabierta');
        } catch {
            toast.error('Error de conexión al cambiar el estado');
        }
    };

    // ── 24h WhatsApp window ────────────────────────────────────────────────
    const windowClosed = !!activeConversation?.window_expires_at
        && new Date(activeConversation.window_expires_at).getTime() < Date.now();

    // ── Timeline: messages + notes + actions, oldest first ─────────────────
    type TimelineItem =
        | { kind: 'message'; at: string; message: Message; pending?: PendingMessage }
        | { kind: 'activity'; at: string; item: ActivityItem };
    const timeline = useMemo<TimelineItem[]>(() => {
        const items: TimelineItem[] = [
            ...messages
                .filter((m) => showNotesAndActions || !m.is_note)
                .map((m) => ({ kind: 'message' as const, at: m.created_at, message: m })),
            ...(showNotesAndActions ? activity.map((a) => ({ kind: 'activity' as const, at: a.created_at, item: a })) : []),
        ];
        items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
        // Pending bubbles always go last (they haven't been saved yet)
        return [...items, ...pending.map((p) => ({ kind: 'message' as const, at: p.created_at, message: p, pending: p }))];
    }, [messages, activity, pending, showNotesAndActions]);

    const hiddenCount = showNotesAndActions ? 0 : messages.filter((m) => m.is_note).length + activity.length;
    const selectedTemplateInfo = selectedTemplate ? templateBody(selectedTemplate) : null;

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
                <div className="px-4 pt-5 pb-3 border-b border-[#E8E8EC]">
                    <h1 className="text-[18px] font-bold text-[#1A1A2E] mb-3">Conversaciones</h1>
                    <div className="flex items-center gap-1 mb-3">
                        {STATUS_FILTERS.map((f) => (
                            <button
                                key={f.key}
                                onClick={() => changeFilter(f.key)}
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
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                            id="conversation-search"
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por nombre o teléfono..."
                            className="w-full pl-9 pr-4 py-2 text-[13px] bg-[#F3F4F6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 transition-all"
                        />
                    </div>
                </div>

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
                        <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-white border-b border-[#E8E8EC] flex-shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center flex-shrink-0">
                                    <span className="text-white text-[12px] font-semibold">{getInitials(contactName)}</span>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[15px] font-semibold text-[#1A1A2E] truncate">{contactName}</span>
                                        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0', STATUS_COLORS[activeConversation.status])}>
                                            {STATUS_LABELS[activeConversation.status] ?? activeConversation.status}
                                        </span>
                                    </div>
                                    <p className="text-[12px] text-[#9CA3AF]">{activeContact?.wa_id ?? ''}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Show / hide notes and actions */}
                                <button
                                    onClick={toggleNotesAndActions}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all',
                                        showNotesAndActions ? 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E8E8EC]' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    )}
                                    title={showNotesAndActions ? 'Ver solo mensajes' : 'Mostrar notas y acciones'}
                                >
                                    {showNotesAndActions ? <EyeOff size={14} /> : <Eye size={14} />}
                                    {showNotesAndActions ? 'Solo mensajes' : `Notas y acciones${hiddenCount ? ` (${hiddenCount})` : ''}`}
                                </button>

                                {/* AI Toggle */}
                                <button
                                    onClick={handleAiToggle}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all',
                                        activeConversation.ai_enabled
                                            ? 'bg-[#EEF0FF] text-[#4F46E5] hover:bg-[#E0E2FF]'
                                            : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                                    )}
                                    title={activeConversation.ai_enabled ? 'La IA responde. Clic para tomar el control.' : 'Tú tienes el control. Clic para que responda la IA.'}
                                >
                                    {activeConversation.ai_enabled ? (
                                        <><Bot size={14} /> IA activa · Tomar control</>
                                    ) : (
                                        <><User size={14} /> Control humano · Ceder a IA</>
                                    )}
                                </button>

                                {/* Resolve / reopen */}
                                {activeConversation.status !== 'resolved' ? (
                                    <button
                                        onClick={() => handleStatus('resolved')}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                                    >
                                        <CheckCheck size={14} /> Resolver
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleStatus('open')}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E8E8EC] transition-all"
                                    >
                                        <RotateCcw size={14} /> Reabrir
                                    </button>
                                )}

                                <button
                                    onClick={() => setShowRightPanel((v) => !v)}
                                    className={cn(
                                        'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                                        showRightPanel ? 'bg-[#F3F4FF] text-[#818CF8]' : 'text-[#9CA3AF] hover:bg-[#F3F4F6]'
                                    )}
                                    title={showRightPanel ? 'Ocultar panel del contacto' : 'Mostrar panel del contacto'}
                                >
                                    <PanelRight size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Timeline */}
                        <div className="flex-1 overflow-y-auto py-4 bg-[#F8F8FA]">
                            {loadingMessages ? (
                                <div className="flex items-center justify-center h-32">
                                    <div className="w-6 h-6 border-2 border-[#818CF8] border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : timeline.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                                    <MessageSquare size={32} className="text-[#E8E8EC] mb-3" />
                                    <p className="text-[13px] text-[#9CA3AF]">Sin mensajes aún.</p>
                                </div>
                            ) : (
                                timeline.map((entry, idx) => {
                                    const prev = timeline[idx - 1];
                                    const showDate = !prev || !isSameDay(prev.at, entry.at);
                                    return (
                                        <div key={entry.kind === 'message' ? entry.message.id : `a-${entry.item.id}`}>
                                            {showDate && <DateSeparator date={entry.at} />}
                                            {entry.kind === 'activity' ? (
                                                <ActivityChip item={entry.item} />
                                            ) : entry.pending ? (
                                                <PendingBubble message={entry.pending} onRetry={() => retryPending(entry.pending!)} />
                                            ) : (
                                                <MessageBubble message={entry.message} />
                                            )}
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input area */}
                        <div className="bg-white border-t border-[#E8E8EC] p-4 flex-shrink-0">
                            {windowClosed && !isNoteMode && (
                                <div className="flex items-center justify-between gap-3 mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                                    <p className="text-[12px] text-amber-800">
                                        Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo permite enviar una <strong>plantilla aprobada</strong>.
                                    </p>
                                    <button
                                        onClick={() => setPanel('templates')}
                                        className="text-[12px] font-semibold text-amber-800 underline whitespace-nowrap"
                                    >
                                        Elegir plantilla
                                    </button>
                                </div>
                            )}
                            {isNoteMode && (
                                <div className="flex items-center gap-2 mb-2 px-2">
                                    <StickyNote size={13} className="text-amber-500" />
                                    <span className="text-[12px] text-amber-600 font-medium">Nota interna: no se envía al cliente, se guarda en el chat y en el contacto</span>
                                </div>
                            )}

                            {/* Template composer */}
                            {selectedTemplate && selectedTemplateInfo && (
                                <div className="mb-2 rounded-xl border border-[#C7D2FE] bg-[#F5F7FF] p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[12px] font-semibold text-[#4F46E5] flex items-center gap-1.5">
                                            <FileText size={13} /> Plantilla: {selectedTemplate.name}
                                        </p>
                                        <button onClick={() => { setSelectedTemplate(null); setTemplateVars({}); }} title="Cancelar">
                                            <X size={14} className="text-[#9CA3AF]" />
                                        </button>
                                    </div>
                                    {(() => {
                                        // Media header of the template (sent with the file uploaded when it was created)
                                        const h = (selectedTemplate.components as Array<{ type: string; format?: string; example?: { header_url?: string[] } }> | null)
                                            ?.find((c) => c.type === 'HEADER' && c.format && c.format !== 'TEXT');
                                        const url = h?.example?.header_url?.[0];
                                        if (!h) return null;
                                        return (
                                            <div className="mb-2 flex items-center gap-2 text-[11px] text-[#4F46E5]">
                                                {url && h.format === 'IMAGE' ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={url} alt="" className="w-12 h-12 rounded-lg object-cover border border-[#E8E8EC]" />
                                                ) : null}
                                                <span>Incluye {h.format === 'IMAGE' ? 'imagen' : h.format === 'VIDEO' ? 'video' : 'documento PDF'} en el encabezado</span>
                                            </div>
                                        );
                                    })()}
                                    <p className="text-[12px] text-[#374151] whitespace-pre-wrap mb-2">
                                        {selectedTemplateInfo.text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => templateVars[k] || m)}
                                    </p>
                                    {selectedTemplateInfo.vars.length > 0 && (
                                        <div className="grid grid-cols-2 gap-2 mb-2">
                                            {selectedTemplateInfo.vars.map((v) => (
                                                <input
                                                    key={v}
                                                    id={`template-var-${v}`}
                                                    value={templateVars[v] ?? ''}
                                                    onChange={(e) => setTemplateVars((p) => ({ ...p, [v]: e.target.value }))}
                                                    placeholder={`{{${v}}}`}
                                                    className="px-2.5 py-1.5 text-[12px] bg-white border border-[#E8E8EC] rounded-lg focus:outline-none focus:border-[#818CF8]"
                                                />
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleSendTemplate}
                                            disabled={sending}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#4F46E5] text-white hover:bg-[#4338CA] disabled:opacity-60"
                                        >
                                            <Send size={13} /> Enviar plantilla
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className={cn(
                                'flex items-end gap-2 rounded-xl border px-3 py-2 transition-colors',
                                isNoteMode ? 'border-amber-300 bg-amber-50' : 'border-[#E8E8EC] bg-white'
                            )}>
                                {/* Emoji picker */}
                                <div className="relative">
                                    <button
                                        onClick={() => setPanel((p) => (p === 'emoji' ? null : 'emoji'))}
                                        className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors p-1"
                                        title="Emoji"
                                    >
                                        <Smile size={20} />
                                    </button>
                                    {panel === 'emoji' && (
                                        <div className="absolute bottom-10 left-0 w-72 bg-white border border-[#E8E8EC] rounded-xl shadow-lg z-20 p-2">
                                            <div className="flex items-center justify-between px-1 mb-2">
                                                <span className="text-[11px] font-semibold text-[#9CA3AF]">Emojis</span>
                                                <button onClick={() => setPanel(null)}><X size={13} className="text-[#9CA3AF]" /></button>
                                            </div>
                                            <div className="grid grid-cols-10 gap-0.5">
                                                {COMMON_EMOJIS.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => insertEmoji(emoji)}
                                                        className="w-7 h-7 flex items-center justify-center text-[18px] hover:bg-[#F3F4F6] rounded-lg transition-colors"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Attach file */}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isNoteMode || windowClosed || sending}
                                    className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors p-1 disabled:opacity-40"
                                    title={windowClosed ? 'Ventana de 24 h cerrada' : 'Adjuntar archivo'}
                                >
                                    <Paperclip size={20} />
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,video/*,application/pdf,.doc,.docx"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />

                                {/* Textarea */}
                                <textarea
                                    id="chat-input"
                                    ref={textareaRef}
                                    value={inputText}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setInputText(val);
                                        // "/" at the start opens quick replies; deleting it closes them
                                        if (val.startsWith('/') && !isNoteMode) setPanel('canned');
                                        else if (panel === 'canned' && !val.startsWith('/')) setPanel(null);
                                    }}
                                    onKeyDown={handleKeyDown}
                                    rows={1}
                                    placeholder={
                                        isNoteMode ? 'Escribe una nota interna...'
                                            : windowClosed ? 'Ventana de 24 h cerrada: usa una plantilla'
                                            : 'Escribe un mensaje o "/" para respuestas rápidas...'
                                    }
                                    className="flex-1 resize-none bg-transparent text-[14px] text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none min-h-[36px] max-h-[120px] py-1.5"
                                    style={{ height: '36px' }}
                                />

                                {/* Templates */}
                                <div className="relative">
                                    <button
                                        onClick={() => setPanel((p) => (p === 'templates' ? null : 'templates'))}
                                        disabled={isNoteMode}
                                        className={cn('transition-colors p-1 disabled:opacity-40', panel === 'templates' ? 'text-[#818CF8]' : 'text-[#9CA3AF] hover:text-[#818CF8]')}
                                        title="Plantillas de WhatsApp"
                                    >
                                        <FileText size={18} />
                                    </button>
                                    {panel === 'templates' && (
                                        <div className="absolute bottom-10 right-0 w-80 bg-white border border-[#E8E8EC] rounded-xl shadow-lg z-20 overflow-hidden">
                                            <div className="px-3 py-2 border-b border-[#E8E8EC] flex items-center justify-between">
                                                <span className="text-[12px] font-semibold text-[#1A1A2E]">Plantillas aprobadas</span>
                                                <button onClick={() => setPanel(null)}><X size={14} className="text-[#9CA3AF]" /></button>
                                            </div>
                                            {templates.length === 0 ? (
                                                <div className="px-3 py-4 text-center">
                                                    <p className="text-[12px] text-[#6B7280]">No hay plantillas aprobadas por Meta.</p>
                                                    <Link href="/settings/templates" className="text-[12px] text-[#818CF8] hover:underline">
                                                        Ir a Plantillas y sincronizar
                                                    </Link>
                                                </div>
                                            ) : (
                                                <div className="max-h-60 overflow-y-auto">
                                                    {templates.map((t) => {
                                                        const { text } = templateBody(t);
                                                        return (
                                                            <button
                                                                key={t.id}
                                                                onClick={() => {
                                                                    setSelectedTemplate(t);
                                                                    setTemplateVars({});
                                                                    setPanel(null);
                                                                }}
                                                                className="w-full text-left px-3 py-2.5 hover:bg-[#F9FAFB] transition-colors border-b border-[#F3F4F6] last:border-0"
                                                            >
                                                                <p className="text-[12px] font-semibold text-[#1A1A2E]">{t.name} <span className="font-normal text-[#9CA3AF]">· {t.language}</span></p>
                                                                <p className="text-[11px] text-[#9CA3AF] line-clamp-2">{text}</p>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Quick replies */}
                                <div className="relative">
                                    <button
                                        onClick={() => setPanel((p) => (p === 'canned' ? null : 'canned'))}
                                        disabled={isNoteMode}
                                        className={cn('transition-colors p-1 disabled:opacity-40', panel === 'canned' ? 'text-[#818CF8]' : 'text-[#9CA3AF] hover:text-[#818CF8]')}
                                        title="Respuestas rápidas (escribe /)"
                                    >
                                        <MessageSquare size={18} />
                                    </button>
                                    {panel === 'canned' && (
                                        <div className="absolute bottom-10 right-0 w-80 bg-white border border-[#E8E8EC] rounded-xl shadow-lg z-20 overflow-hidden">
                                            <div className="px-3 py-2 border-b border-[#E8E8EC] flex items-center justify-between">
                                                <span className="text-[12px] font-semibold text-[#1A1A2E]">Respuestas rápidas</span>
                                                <button onClick={() => setPanel(null)}><X size={14} className="text-[#9CA3AF]" /></button>
                                            </div>
                                            {cannedResponses.length === 0 ? (
                                                <div className="px-3 py-4 text-center">
                                                    <p className="text-[12px] text-[#6B7280]">Aún no tienes respuestas rápidas.</p>
                                                    <Link href="/settings" className="text-[12px] text-[#818CF8] hover:underline">
                                                        Crear en Configuración → Respuestas rápidas
                                                    </Link>
                                                </div>
                                            ) : visibleCanned.length === 0 ? (
                                                <p className="px-3 py-4 text-center text-[12px] text-[#6B7280]">Ninguna respuesta empieza por &quot;/{slashQuery}&quot;.</p>
                                            ) : (
                                                <div className="max-h-60 overflow-y-auto">
                                                    {visibleCanned.map((cr) => (
                                                        <button
                                                            key={cr.id}
                                                            onClick={() => pickCanned(cr)}
                                                            className="w-full text-left px-3 py-2.5 hover:bg-[#F9FAFB] transition-colors border-b border-[#F3F4F6] last:border-0"
                                                        >
                                                            <p className="text-[12px] font-semibold text-[#818CF8]">
                                                                /{bareShortcut(cr.shortcut) || cr.title}
                                                                <span className="font-normal text-[#9CA3AF]"> · {cr.title}</span>
                                                            </p>
                                                            <p className="text-[11px] text-[#9CA3AF] line-clamp-2">{cr.content}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Note toggle */}
                                <button
                                    onClick={() => { setIsNoteMode((v) => !v); setPanel(null); }}
                                    className={cn(
                                        'transition-colors p-1 rounded',
                                        isNoteMode ? 'text-amber-500 bg-amber-100' : 'text-[#9CA3AF] hover:text-amber-500'
                                    )}
                                    title={isNoteMode ? 'Cambiar a mensaje' : 'Escribir nota interna'}
                                >
                                    <StickyNote size={18} />
                                </button>

                                {/* Send */}
                                <button
                                    onClick={handleSend}
                                    disabled={!inputText.trim() || sending || (!isNoteMode && windowClosed)}
                                    className={cn(
                                        'w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0',
                                        inputText.trim() && !sending && (isNoteMode || !windowClosed)
                                            ? isNoteMode ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-[#818CF8] hover:bg-[#6366F1] text-white'
                                            : 'bg-[#F3F4F6] text-[#C4C4CE] cursor-not-allowed'
                                    )}
                                    title={isNoteMode ? 'Guardar nota' : 'Enviar'}
                                >
                                    {isNoteMode ? <StickyNote size={16} /> : <Send size={16} />}
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
                    funnelStageId={(activeContact as { funnel_stage_id?: string | null }).funnel_stage_id ?? null}
                    funnelStage={activeContact.funnel_stage as { id?: string; name: string; color: string | null } | null | undefined}
                    conversationId={activeConversation.id}
                    assignedTo={activeConversation.assigned_to}
                    notesVersion={notesVersion}
                    onNoteAdded={(note) => {
                        setMessages((prev) => (prev.some((m) => m.id === note.id) ? prev : [...prev, note]));
                    }}
                    onAssign={(userId) => {
                        setConversations((prev) =>
                            prev.map((c) => c.id === activeConversation.id ? { ...c, assigned_to: userId } : c)
                        );
                    }}
                    onClose={() => setShowRightPanel(false)}
                />
            )}
        </div>
    );
}

/** A message the agent sent that WhatsApp hasn't confirmed yet. */
function PendingBubble({ message, onRetry }: { message: PendingMessage; onRetry: () => void }) {
    const state = message.pending_state;
    return (
        <div className="flex justify-end px-4 my-0.5">
            <div className="max-w-[70%]">
                <div className={cn(
                    'rounded-2xl rounded-tr-sm px-4 py-2.5 text-white',
                    state === 'failed' ? 'bg-red-500' : 'bg-[#4F46E5] opacity-70'
                )}>
                    <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                </div>
                <div className="flex items-center justify-end gap-1.5 mt-0.5 px-1 text-[11px]">
                    {state === 'sending' && (<><Clock size={11} className="text-[#9CA3AF]" /><span className="text-[#9CA3AF]">Enviando…</span></>)}
                    {state === 'unconfirmed' && (
                        <span className="text-amber-600">Sin confirmación de WhatsApp todavía. Revisa n8n si no aparece.</span>
                    )}
                    {state === 'failed' && (
                        <>
                            <span className="text-red-600">No se envió: {message.pending_error}</span>
                            <button onClick={onRetry} className="font-semibold text-red-700 underline">Reintentar</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// ContactPanel — rich ManyChat-style right panel (editable)
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
    funnelStageId,
    funnelStage,
    conversationId,
    assignedTo,
    notesVersion,
    onNoteAdded,
    onAssign,
    onClose,
}: {
    contactId: string;
    contactName: string;
    waId: string | null;
    email: string | null;
    funnelStageId: string | null;
    funnelStage: { id?: string; name: string; color: string | null } | null | undefined;
    conversationId: string;
    assignedTo: string | null;
    notesVersion: number;
    onNoteAdded: (note: Message) => void;
    onAssign: (userId: string | null) => void;
    onClose: () => void;
}) {
    const hasReservations = useHasModule('reservations');
    const hasAppointments = useHasModule('appointments');
    const [data, setData] = useState<ContactPanelData | null>(null);
    const [loading, setLoading] = useState(true);

    // Editable fields state
    const [editingField, setEditingField] = useState<string | null>(null);
    const [fieldDrafts, setFieldDrafts] = useState({
        nombre: contactName,
        wa_id: waId ?? '',
        email: email ?? '',
    });
    const [contactData, setContactData] = useState({
        nombre: contactName,
        wa_id: waId,
        email,
    });

    // Tags
    const [contactTags, setContactTags] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
    const [allTags, setAllTags] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
    const [showAddTag, setShowAddTag] = useState(false);

    // Funnel stages
    const [stages, setStages] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
    const [currentStageId, setCurrentStageId] = useState<string | null>(
        funnelStageId ?? (funnelStage as { id?: string } | null | undefined)?.id ?? null
    );

    // Team members for assignment
    const [teamMembers, setTeamMembers] = useState<Array<{ id: string; full_name: string }>>([]);
    const [currentAssignedTo, setCurrentAssignedTo] = useState<string | null>(assignedTo);

    // Reset editable state when contactId changes
    useEffect(() => {
        setFieldDrafts({ nombre: contactName, wa_id: waId ?? '', email: email ?? '' });
        setContactData({ nombre: contactName, wa_id: waId, email });
        setCurrentStageId(funnelStageId ?? (funnelStage as { id?: string } | null | undefined)?.id ?? null);
        setCurrentAssignedTo(assignedTo);
        setEditingField(null);
        setShowAddTag(false);
    }, [contactId, contactName, waId, email, funnelStageId, funnelStage, assignedTo]);

    useEffect(() => {
        setLoading(true);
        setData(null);

        Promise.all([
            fetch(`/api/contacts/${contactId}`).then((r) => r.json()),
            fetch('/api/settings/tags').then((r) => r.json()),
            fetch('/api/funnel-stages').then((r) => r.json()),
            fetch('/api/settings/team').then((r) => r.json()),
        ])
            .then(([d, tagsRes, stagesRes, teamRes]) => {
                setData({
                    tags: d.tags ?? [],
                    custom_fields: d.custom_fields ?? [],
                    reservations: d.reservations ?? [],
                    notes: d.notes ?? [],
                    activity: d.activity ?? [],
                });
                const rawTags = (d.tags ?? [])
                    .map((ct: { tag: { id: string; name: string; color: string | null } | null }) => ct.tag)
                    .filter(Boolean) as Array<{ id: string; name: string; color: string | null }>;
                setContactTags(rawTags);
                setAllTags(asArray(tagsRes?.tags ?? tagsRes));
                setStages(asArray(stagesRes?.stages ?? stagesRes));
                setTeamMembers(asArray(teamRes?.users));
            })
            .catch(() => {
                setData({ tags: [], custom_fields: [], reservations: [], notes: [], activity: [] });
            })
            .finally(() => setLoading(false));
    }, [contactId]);

    // Notes: new note in the chat (agent or AI) → refresh the panel list
    const [noteDraft, setNoteDraft] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [showAllNotes, setShowAllNotes] = useState(false);
    useEffect(() => {
        if (notesVersion === 0) return;
        let cancelled = false;
        fetch(`/api/contacts/${contactId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (cancelled || !d) return;
                setData((prev) => (prev ? { ...prev, notes: d.notes ?? [], activity: d.activity ?? prev.activity } : prev));
            })
            .catch(() => { /* the chat already shows the note */ });
        return () => { cancelled = true; };
    }, [notesVersion, contactId]);

    async function addNote() {
        const content = noteDraft.trim();
        if (!content || savingNote) return;
        setSavingNote(true);
        try {
            const res = await fetch(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, is_note: true }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || 'No se pudo guardar la nota'); return; }
            setNoteDraft('');
            setData((prev) => (prev ? {
                ...prev,
                notes: [{ id: `local-${d.id}`, content, created_at: d.created_at ?? new Date().toISOString(), user: null }, ...prev.notes],
            } : prev));
            onNoteAdded(d as Message);
            toast.success('Nota guardada');
        } catch {
            toast.error('Error de conexión al guardar la nota');
        } finally {
            setSavingNote(false);
        }
    }

    // ── Save individual field ──────────────────────────────────────────────
    async function saveField(key: string, value: string) {
        setEditingField(null);
        try {
            const res = await fetch(`/api/contacts/${contactId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value || null }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Error al guardar campo'); return; }
            setContactData((prev) => ({ ...prev, [key]: value }));
        } catch { toast.error('Error de conexión al guardar campo'); }
    }

    // ── Save funnel stage ──────────────────────────────────────────────────
    async function saveStage(stageId: string) {
        const previous = currentStageId;
        setCurrentStageId(stageId || null);
        try {
            const res = await fetch(`/api/contacts/${contactId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ funnel_stage_id: stageId || null }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setCurrentStageId(previous);
                toast.error(d.error || 'Error al cambiar etapa');
                return;
            }
            const name = stages.find((s) => s.id === stageId)?.name;
            toast.success(name ? `Etapa cambiada a ${name}` : 'Etapa eliminada');
        } catch {
            setCurrentStageId(previous);
            toast.error('Error de conexión al cambiar etapa');
        }
    }

    // ── Save agent assignment ─────────────────────────────────────────────
    async function saveAssignment(userId: string | null) {
        const previous = currentAssignedTo;
        setCurrentAssignedTo(userId);
        onAssign(userId);
        const revert = () => { setCurrentAssignedTo(previous); onAssign(previous); };
        try {
            const res = await fetch(`/api/conversations/${conversationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assigned_to: userId }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                revert();
                toast.error(d.error || 'Error al asignar agente');
                return;
            }
            const name = teamMembers.find((m) => m.id === userId)?.full_name;
            toast.success(name ? `Conversación asignada a ${name}` : 'Conversación sin asignar');
        } catch {
            revert();
            toast.error('Error de conexión al asignar agente');
        }
    }

    // ── Remove tag from contact ────────────────────────────────────────────
    async function removeTag(tagId: string) {
        const removed = contactTags.find((t) => t.id === tagId);
        setContactTags((prev) => prev.filter((t) => t.id !== tagId));
        try {
            const res = await fetch(`/api/contacts/${contactId}/tags`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag_id: tagId }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo quitar la etiqueta');
            toast.success(`Etiqueta "${removed?.name ?? ''}" quitada`);
        } catch (err) {
            if (removed) setContactTags((prev) => [...prev, removed]);
            toast.error(err instanceof Error ? err.message : 'No se pudo quitar la etiqueta');
        }
    }

    // ── Add tag to contact ────────────────────────────────────────────────
    async function addTag(tag: { id: string; name: string; color: string | null }) {
        if (contactTags.some((t) => t.id === tag.id)) {
            setShowAddTag(false);
            return;
        }
        setContactTags((prev) => [...prev, tag]);
        setShowAddTag(false);
        try {
            const res = await fetch(`/api/contacts/${contactId}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag_id: tag.id }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo agregar la etiqueta');
            toast.success(`Etiqueta "${tag.name}" agregada`);
        } catch (err) {
            setContactTags((prev) => prev.filter((t) => t.id !== tag.id));
            toast.error(err instanceof Error ? err.message : 'No se pudo agregar la etiqueta');
        }
    }

    const availableTags = allTags.filter((t) => !contactTags.some((ct) => ct.id === t.id));
    const currentStage = stages.find((s) => s.id === currentStageId) ?? funnelStage ?? null;

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
                        <span className="text-white text-[18px] font-bold">{getInitials(contactData.nombre)}</span>
                    </div>

                    {/* Editable name */}
                    <div className="group relative w-full">
                        {editingField === 'nombre' ? (
                            <input
                                autoFocus
                                value={fieldDrafts.nombre}
                                onChange={(e) => setFieldDrafts((p) => ({ ...p, nombre: e.target.value }))}
                                onBlur={() => saveField('nombre', fieldDrafts.nombre)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveField('nombre', fieldDrafts.nombre);
                                    if (e.key === 'Escape') {
                                        setFieldDrafts((p) => ({ ...p, nombre: contactData.nombre }));
                                        setEditingField(null);
                                    }
                                }}
                                className="text-[15px] font-bold text-[#1A1A2E] bg-transparent border-b border-[#818CF8] focus:outline-none w-full text-center"
                            />
                        ) : (
                            <div
                                className="flex items-center justify-center gap-1 cursor-pointer"
                                onClick={() => setEditingField('nombre')}
                            >
                                <h3 className="text-[15px] font-bold text-[#1A1A2E] hover:text-[#818CF8] transition-colors">
                                    {contactData.nombre}
                                </h3>
                                <PencilIcon size={11} className="text-[#C4C4CE] opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        )}
                    </div>

                    {/* Editable wa_id */}
                    <div className="group relative w-full mt-0.5">
                        {editingField === 'wa_id' ? (
                            <input
                                autoFocus
                                value={fieldDrafts.wa_id}
                                onChange={(e) => setFieldDrafts((p) => ({ ...p, wa_id: e.target.value }))}
                                onBlur={() => saveField('wa_id', fieldDrafts.wa_id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveField('wa_id', fieldDrafts.wa_id);
                                    if (e.key === 'Escape') {
                                        setFieldDrafts((p) => ({ ...p, wa_id: contactData.wa_id ?? '' }));
                                        setEditingField(null);
                                    }
                                }}
                                className="text-[12px] text-[#9CA3AF] bg-transparent border-b border-[#818CF8] focus:outline-none w-full text-center"
                            />
                        ) : (
                            <div
                                className="flex items-center justify-center gap-1 cursor-pointer"
                                onClick={() => setEditingField('wa_id')}
                            >
                                <p className="text-[12px] text-[#9CA3AF] hover:text-[#818CF8] transition-colors">
                                    {contactData.wa_id || <span className="italic text-[#C4C4CE]">Sin teléfono</span>}
                                </p>
                                <PencilIcon size={10} className="text-[#C4C4CE] opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        )}
                    </div>

                    {/* Editable email */}
                    <div className="group relative w-full mt-0.5">
                        {editingField === 'email' ? (
                            <input
                                autoFocus
                                value={fieldDrafts.email}
                                onChange={(e) => setFieldDrafts((p) => ({ ...p, email: e.target.value }))}
                                onBlur={() => saveField('email', fieldDrafts.email)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveField('email', fieldDrafts.email);
                                    if (e.key === 'Escape') {
                                        setFieldDrafts((p) => ({ ...p, email: contactData.email ?? '' }));
                                        setEditingField(null);
                                    }
                                }}
                                className="text-[11px] text-[#9CA3AF] bg-transparent border-b border-[#818CF8] focus:outline-none w-full text-center"
                            />
                        ) : (
                            <div
                                className="flex items-center justify-center gap-1 cursor-pointer"
                                onClick={() => setEditingField('email')}
                            >
                                <p className="text-[11px] text-[#C4C4CE] truncate max-w-full hover:text-[#818CF8] transition-colors">
                                    {contactData.email || <span className="italic">Sin email</span>}
                                </p>
                                <PencilIcon size={10} className="text-[#C4C4CE] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </div>
                        )}
                    </div>
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
                    {hasReservations && <Link
                        href={`/reservations`}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-[#E8E8EC] hover:bg-[#F9FAFB] text-[11px] font-medium text-[#6B7280] transition-colors"
                    >
                        <CalendarCheck size={12} className="text-[#818CF8]" />
                        Reservas
                    </Link>}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-32">
                    <div className="w-5 h-5 border-2 border-[#818CF8] border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* Funnel stage — editable select */}
                    <div className="px-4 py-3 border-b border-[#F3F4F6]">
                        <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5">Etapa del funnel</p>
                        {stages.length > 0 ? (
                            <select
                                value={currentStageId ?? ''}
                                onChange={(e) => saveStage(e.target.value)}
                                className="w-full text-[12px] text-[#1A1A2E] bg-[#F9FAFB] border border-[#E8E8EC] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 cursor-pointer"
                            >
                                <option value="">Sin etapa</option>
                                {stages.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        ) : currentStage ? (
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: currentStage.color ?? '#818CF8' }} />
                                <span className="text-[12px] text-[#1A1A2E] font-medium">{currentStage.name}</span>
                            </div>
                        ) : (
                            <p className="text-[12px] text-[#C4C4CE] italic">Sin etapa</p>
                        )}
                    </div>

                    {/* Agent assignment */}
                    <div className="px-4 py-3 border-b border-[#F3F4F6]">
                        <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <UserCheck size={10} /> Asignado a
                        </p>
                        <select
                            value={currentAssignedTo ?? ''}
                            onChange={(e) => saveAssignment(e.target.value || null)}
                            className="w-full text-[12px] text-[#1A1A2E] bg-[#F9FAFB] border border-[#E8E8EC] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#818CF8]/30 cursor-pointer"
                        >
                            <option value="">Sin asignar</option>
                            {teamMembers.map((m) => (
                                <option key={m.id} value={m.id}>{m.full_name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tags — editable */}
                    <div className="px-4 py-3 border-b border-[#F3F4F6]">
                        <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Tag size={10} /> Etiquetas
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {contactTags.map((tag) => (
                                <span
                                    key={tag.id}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                    style={{ backgroundColor: `${tag.color ?? '#818CF8'}20`, color: tag.color ?? '#818CF8' }}
                                >
                                    {tag.name}
                                    <button
                                        onClick={() => removeTag(tag.id)}
                                        className="hover:opacity-70 transition-opacity leading-none"
                                        title="Quitar etiqueta"
                                    >
                                        <X size={9} />
                                    </button>
                                </span>
                            ))}

                            {/* Add tag button */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowAddTag((v) => !v)}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-dashed border-[#C4C4CE] text-[#9CA3AF] hover:border-[#818CF8] hover:text-[#818CF8] transition-colors"
                                    title="Agregar etiqueta"
                                >
                                    <Plus size={9} /> Agregar
                                </button>
                                {showAddTag && (
                                    <div className="absolute top-6 left-0 z-20 w-44 bg-white border border-[#E8E8EC] rounded-xl shadow-lg overflow-hidden">
                                        <div className="px-2 py-1.5 border-b border-[#F3F4F6] flex items-center justify-between">
                                            <span className="text-[10px] font-semibold text-[#9CA3AF]">Etiquetas</span>
                                            <button onClick={() => setShowAddTag(false)}>
                                                <X size={11} className="text-[#9CA3AF]" />
                                            </button>
                                        </div>
                                        <div className="max-h-40 overflow-y-auto py-1">
                                            {availableTags.length === 0 ? (
                                                <p className="text-[11px] text-[#9CA3AF] px-3 py-2">Sin etiquetas disponibles</p>
                                            ) : (
                                                availableTags.map((tag) => (
                                                    <button
                                                        key={tag.id}
                                                        onClick={() => addTag(tag)}
                                                        className="w-full text-left px-3 py-1.5 hover:bg-[#F9FAFB] transition-colors flex items-center gap-2"
                                                    >
                                                        <div
                                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                                            style={{ backgroundColor: tag.color ?? '#818CF8' }}
                                                        />
                                                        <span className="text-[11px] text-[#1A1A2E]">{tag.name}</span>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

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

                    {/* Appointments of this contact (create / edit / delete in place) */}
                    {hasAppointments && (
                        <div className="px-4 py-3 border-b border-[#F3F4F6]">
                            <ContactAppointments
                                compact
                                contact={{ id: contactId, nombre: contactData.nombre, wa_id: contactData.wa_id, email: contactData.email }}
                            />
                        </div>
                    )}

                    {/* Notes — same notes as the chat (agent + AI) */}
                    {data && (
                        <div className="px-4 py-3 border-b border-[#F3F4F6]">
                            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2 flex items-center gap-1">
                                <StickyNote size={10} /> Notas ({data.notes.length})
                            </p>
                            <div className="flex gap-1.5 mb-2">
                                <textarea
                                    value={noteDraft}
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); }
                                    }}
                                    rows={2}
                                    placeholder="Escribe una nota interna…"
                                    className="flex-1 text-[11px] text-[#1A1A2E] bg-amber-50/60 border border-amber-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300/50 placeholder:text-[#C4C4CE]"
                                />
                                <button
                                    onClick={addNote}
                                    disabled={!noteDraft.trim() || savingNote}
                                    className="self-end px-2 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-medium disabled:opacity-40 hover:bg-amber-600 transition-colors"
                                    title="Guardar nota"
                                >
                                    {savingNote ? '…' : <Plus size={12} />}
                                </button>
                            </div>
                            {data.notes.length === 0 ? (
                                <p className="text-[11px] text-[#C4C4CE] italic">Sin notas todavía.</p>
                            ) : (
                                <div className="space-y-2">
                                    {(showAllNotes ? data.notes : data.notes.slice(0, 5)).map((note) => {
                                        const isAi = note.content.startsWith('🤖');
                                        return (
                                            <div key={note.id} className={cn('rounded-lg px-2.5 py-2', isAi ? 'bg-violet-50' : 'bg-amber-50')}>
                                                <p className="text-[11px] text-[#1A1A2E] whitespace-pre-wrap break-words">
                                                    {isAi ? note.content.replace(/^🤖\s*/, '') : note.content}
                                                </p>
                                                <p className="text-[10px] text-[#9CA3AF] mt-0.5 flex items-center gap-1">
                                                    {isAi ? <><Bot size={9} className="text-violet-500" /> IA</> : (note.user?.full_name ?? 'Agente')}
                                                    <span>· {formatSmartDateShort(note.created_at)}</span>
                                                </p>
                                            </div>
                                        );
                                    })}
                                    {data.notes.length > 5 && (
                                        <button
                                            onClick={() => setShowAllNotes((v) => !v)}
                                            className="text-[11px] text-[#818CF8] hover:underline"
                                        >
                                            {showAllNotes ? 'Ver menos' : `Ver todas (${data.notes.length})`}
                                        </button>
                                    )}
                                </div>
                            )}
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

                    {data && contactTags.length === 0 && data.custom_fields.length === 0 && data.reservations.length === 0 && data.activity.length === 0 && (
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
