'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
    useDroppable,
    type DragStartEvent,
    type DragEndEvent,
    type DragOverEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    Settings,
    LayoutGrid,
    List,
    Plus,
    Phone,
    DollarSign,
    X,
    Loader2,
    Search,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { FunnelStageBadge } from '@/components/contacts/funnel-stage-badge';
import { formatSmartDate } from '@/lib/utils/format';
import type { FunnelStage } from '@/lib/types/database';
import type { DealRow } from '@/app/(dashboard)/funnel/page';

type ContactRow = {
    id: string;
    nombre: string;
    wa_id: string | null;
    last_contacted_at: string | null;
    funnel_stage_id: string | null;
    contact_tags: { tag: { id: string; name: string; color: string | null } | null }[];
};

function formatCurrency(value: number, currency = 'MXN'): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

// ---- Contact Card ----

function ContactCard({
    contact,
    color,
    isDragging,
    dealValue,
}: {
    contact: ContactRow;
    color: string;
    isDragging?: boolean;
    dealValue?: number;
}) {
    const tags = contact.contact_tags
        .map((ct) => ct.tag)
        .filter(Boolean)
        .slice(0, 2);

    const initials = contact.nombre.slice(0, 2).toUpperCase();

    return (
        <Link
            href={`/contacts/${contact.id}`}
            onClick={(e) => {
                // Prevent navigation when being dragged
                if (isDragging) e.preventDefault();
            }}
        >
            <div
                className={`bg-white rounded-xl border border-[#E8E8EC] p-4 transition-shadow cursor-grab active:cursor-grabbing ${
                    isDragging
                        ? 'shadow-lg ring-2 ring-[#818CF8]/20 opacity-90'
                        : 'shadow-sm hover:shadow-md'
                }`}
                style={{ borderLeft: `3px solid ${color}` }}
            >
                <div className="flex items-start gap-3">
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-semibold"
                        style={{ backgroundColor: color }}
                    >
                        {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[#1A1A2E] truncate">
                            {contact.nombre}
                        </p>
                        {contact.wa_id && (
                            <div className="flex items-center gap-1 mt-0.5">
                                <Phone size={10} className="text-[#9CA3AF] flex-shrink-0" />
                                <span className="text-[11px] text-[#9CA3AF] truncate">{contact.wa_id}</span>
                            </div>
                        )}
                    </div>
                </div>

                {(tags.length > 0 || contact.last_contacted_at || (dealValue && dealValue > 0)) && (
                    <div className="flex items-center justify-between mt-2.5 gap-2">
                        <div className="flex flex-wrap gap-1 items-center">
                            {tags.map((tag) => tag && (
                                <span
                                    key={tag.id}
                                    className="px-1.5 py-0.5 bg-[#F3F4F6] text-[#6B7280] text-[10px] font-medium rounded-full"
                                >
                                    {tag.name}
                                </span>
                            ))}
                            {dealValue != null && dealValue > 0 && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-full">
                                    <DollarSign size={9} />
                                    {formatCurrency(dealValue)}
                                </span>
                            )}
                        </div>
                        {contact.last_contacted_at && (
                            <span className="text-[10px] text-[#9CA3AF] flex-shrink-0">
                                {formatSmartDate(contact.last_contacted_at)}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </Link>
    );
}

// ---- Sortable Card ----

function SortableContactCard({
    contact,
    color,
    dealValue,
}: {
    contact: ContactRow;
    color: string;
    dealValue?: number;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: contact.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <ContactCard contact={contact} color={color} dealValue={dealValue} />
        </div>
    );
}

// ---- Droppable Column ----

function KanbanColumn({
    stage,
    contacts,
    dealValueByContact,
    totalDealValue,
}: {
    stage: FunnelStage;
    contacts: ContactRow[];
    dealValueByContact: Record<string, number>;
    totalDealValue: number;
}) {
    const color = stage.color ?? '#818CF8';
    const { setNodeRef } = useDroppable({ id: `col-${stage.id}` });

    return (
        <div className="flex-shrink-0 w-[280px]">
            {/* Column Header */}
            <div className="flex items-center gap-2 mb-1 px-1">
                <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                />
                <h3 className="text-[13px] font-semibold text-[#1A1A2E] truncate flex-1">
                    {stage.name}
                </h3>
                <span className="text-[11px] text-[#9CA3AF] font-medium bg-[#F3F4F6] px-1.5 py-0.5 rounded-full">
                    {contacts.length}
                </span>
            </div>
            {totalDealValue > 0 && (
                <p className="text-[11px] text-emerald-600 font-semibold px-1 mb-2">
                    {formatCurrency(totalDealValue)}
                </p>
            )}

            {/* Cards area */}
            <div
                ref={setNodeRef}
                className="bg-[#F3F4F6]/50 rounded-2xl p-2.5 min-h-[400px] space-y-2.5"
                style={{ borderTop: `2px solid ${color}20` }}
            >
                <SortableContext
                    items={contacts.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {contacts.map((contact) => (
                        <SortableContactCard
                            key={contact.id}
                            contact={contact}
                            color={color}
                            dealValue={dealValueByContact[contact.id]}
                        />
                    ))}
                </SortableContext>

                {contacts.length === 0 && (
                    <div className="flex items-center justify-center h-[80px]">
                        <p className="text-[12px] text-[#9CA3AF]">Sin contactos</p>
                    </div>
                )}

                {/* Quick add */}
                <Link href={`/contacts?stage=${stage.id}`}>
                    <button className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#E5E7EB]/50 transition-colors mt-1">
                        <Plus size={12} />
                        Agregar contacto
                    </button>
                </Link>
            </div>
        </div>
    );
}

// ---- Lista View ----

function ListView({
    contacts,
    stages,
}: {
    contacts: ContactRow[];
    stages: FunnelStage[];
}) {
    const stageMap = new Map(stages.map((s) => [s.id, s]));

    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-[#E8E8EC] bg-[#F8F8FA]">
                        <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">
                            Contacto
                        </th>
                        <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                            Teléfono
                        </th>
                        <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">
                            Etapa
                        </th>
                        <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                            Último contacto
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                    {contacts.map((c) => {
                        const stage = c.funnel_stage_id ? stageMap.get(c.funnel_stage_id) : undefined;
                        return (
                            <tr key={c.id} className="hover:bg-[#F8F8FA] transition-colors">
                                <td className="px-4 py-3">
                                    <Link href={`/contacts/${c.id}`} className="flex items-center gap-2.5">
                                        <div
                                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                                            style={{ backgroundColor: stage?.color ?? '#9CA3AF' }}
                                        >
                                            {c.nombre.slice(0, 2).toUpperCase()}
                                        </div>
                                        <span className="text-[13px] font-medium text-[#1A1A2E]">
                                            {c.nombre}
                                        </span>
                                    </Link>
                                </td>
                                <td className="px-4 py-3 text-[12px] text-[#6B7280] hidden sm:table-cell">
                                    {c.wa_id ?? '-'}
                                </td>
                                <td className="px-4 py-3">
                                    {stage ? (
                                        <FunnelStageBadge name={stage.name} color={stage.color} size="sm" />
                                    ) : (
                                        <span className="text-[12px] text-[#9CA3AF]">Sin etapa</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-[12px] text-[#9CA3AF] hidden md:table-cell">
                                    {c.last_contacted_at ? formatSmartDate(c.last_contacted_at) : '-'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {contacts.length === 0 && (
                <div className="flex items-center justify-center py-16 text-[13px] text-[#9CA3AF]">
                    No hay contactos
                </div>
            )}
        </div>
    );
}

// ---- Main Page ----

export function FunnelPageClient({
    stages,
    contacts: initialContacts,
    deals: initialDeals = [],
}: {
    stages: FunnelStage[];
    contacts: ContactRow[];
    deals?: DealRow[];
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
    const [activeContact, setActiveContact] = useState<ContactRow | null>(null);
    const [view, setView] = useState<'kanban' | 'list'>('kanban');
    const [showNewDeal, setShowNewDeal] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Compute deal values by contact and by stage
    const dealValueByContact = useMemo(() => {
        const map: Record<string, number> = {};
        for (const deal of initialDeals) {
            const cId = deal.contact_id;
            map[cId] = (map[cId] || 0) + (deal.price ?? 0);
        }
        return map;
    }, [initialDeals]);

    const dealValueByStage = useMemo(() => {
        const map: Record<string, number> = {};
        for (const deal of initialDeals) {
            const stageId = deal.contact?.funnel_stage_id;
            if (stageId) {
                map[stageId] = (map[stageId] || 0) + (deal.price ?? 0);
            }
        }
        return map;
    }, [initialDeals]);

    const contactsByStage = stages.reduce<Record<string, ContactRow[]>>((acc, stage) => {
        acc[stage.id] = contacts.filter((c) => c.funnel_stage_id === stage.id);
        return acc;
    }, {});

    // Contacts with no stage
    const unstagedContacts = contacts.filter(
        (c) => !c.funnel_stage_id || !stages.find((s) => s.id === c.funnel_stage_id)
    );

    function handleDragStart(event: DragStartEvent) {
        const contact = contacts.find((c) => c.id === event.active.id);
        setActiveContact(contact ?? null);
    }

    function handleDragOver(event: DragOverEvent) {
        const { over } = event;
        if (!over) return;

        const overId = String(over.id);
        // If over a column droppable
        if (overId.startsWith('col-')) {
            const targetStageId = overId.replace('col-', '');
            const draggingId = String(event.active.id);
            const dragging = contacts.find((c) => c.id === draggingId);
            if (!dragging || dragging.funnel_stage_id === targetStageId) return;

            setContacts((prev) =>
                prev.map((c) =>
                    c.id === draggingId ? { ...c, funnel_stage_id: targetStageId } : c
                )
            );
        } else {
            // Over a card — find its stage
            const overContact = contacts.find((c) => c.id === overId);
            if (!overContact) return;
            const draggingId = String(event.active.id);
            const dragging = contacts.find((c) => c.id === draggingId);
            if (!dragging || dragging.funnel_stage_id === overContact.funnel_stage_id) return;

            setContacts((prev) =>
                prev.map((c) =>
                    c.id === draggingId
                        ? { ...c, funnel_stage_id: overContact.funnel_stage_id }
                        : c
                )
            );
        }
    }

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            setActiveContact(null);

            if (!over) return;

            const contactId = String(active.id);
            const overId = String(over.id);

            let targetStageId: string | null = null;
            if (overId.startsWith('col-')) {
                targetStageId = overId.replace('col-', '');
            } else {
                const overContact = contacts.find((c) => c.id === overId);
                targetStageId = overContact?.funnel_stage_id ?? null;
            }

            // Persist to DB
            startTransition(async () => {
                try {
                    const res = await fetch(`/api/contacts/${contactId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ funnel_stage_id: targetStageId }),
                    });
                    if (!res.ok) throw new Error('Failed to update');
                    router.refresh();
                } catch {
                    toast.error('Error al mover el contacto');
                    // Revert optimistic update
                    setContacts(initialContacts);
                }
            });
        },
        [contacts, initialContacts, router, startTransition]
    );

    const activeColor = activeContact?.funnel_stage_id
        ? (stages.find((s) => s.id === activeContact.funnel_stage_id)?.color ?? '#818CF8')
        : '#818CF8';

    return (
        <>
            <PageHeader
                title="Funnel"
                description="Arrastra contactos entre etapas"
            >
                <Button
                    onClick={() => setShowNewDeal(true)}
                    className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
                >
                    <DollarSign size={15} />
                    Nuevo Deal
                </Button>
                <Link href="/funnel/settings">
                    <Button
                        variant="outline"
                        className="gap-2 rounded-[10px] border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]"
                    >
                        <Settings size={15} />
                        Gestionar etapas
                    </Button>
                </Link>

                {/* View toggle */}
                <div className="flex items-center gap-1 bg-[#F3F4F6] rounded-[10px] p-1">
                    <button
                        onClick={() => setView('kanban')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                            view === 'kanban'
                                ? 'bg-white text-[#1A1A2E] shadow-sm'
                                : 'text-[#6B7280] hover:text-[#1A1A2E]'
                        }`}
                    >
                        <LayoutGrid size={14} />
                        Kanban
                    </button>
                    <button
                        onClick={() => setView('list')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                            view === 'list'
                                ? 'bg-white text-[#1A1A2E] shadow-sm'
                                : 'text-[#6B7280] hover:text-[#1A1A2E]'
                        }`}
                    >
                        <List size={14} />
                        Lista
                    </button>
                </div>
            </PageHeader>

            {view === 'list' ? (
                <ListView contacts={contacts} stages={stages} />
            ) : (
                <div className="overflow-x-auto pb-4 -mx-2">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="flex gap-4 px-2 min-w-max">
                            {stages.map((stage) => (
                                <KanbanColumn
                                    key={stage.id}
                                    stage={stage}
                                    contacts={contactsByStage[stage.id] ?? []}
                                    dealValueByContact={dealValueByContact}
                                    totalDealValue={dealValueByStage[stage.id] ?? 0}
                                />
                            ))}

                            {/* Unstaged column */}
                            {unstagedContacts.length > 0 && (
                                <div className="flex-shrink-0 w-[280px]">
                                    <div className="flex items-center gap-2 mb-3 px-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-[#D1D5DB]" />
                                        <h3 className="text-[13px] font-semibold text-[#6B7280]">
                                            Sin etapa
                                        </h3>
                                        <span className="text-[11px] text-[#9CA3AF] font-medium bg-[#F3F4F6] px-1.5 py-0.5 rounded-full">
                                            {unstagedContacts.length}
                                        </span>
                                    </div>
                                    <div className="bg-[#F3F4F6]/50 rounded-2xl p-2.5 min-h-[400px] space-y-2.5">
                                        {unstagedContacts.map((c) => (
                                            <ContactCard key={c.id} contact={c} color="#D1D5DB" />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <DragOverlay>
                            {activeContact ? (
                                <div className="w-[280px] rotate-1 scale-105">
                                    <ContactCard
                                        contact={activeContact}
                                        color={activeColor}
                                        isDragging
                                    />
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>
            )}

            {showNewDeal && (
                <NewDealDialog
                    contacts={contacts}
                    onClose={() => setShowNewDeal(false)}
                    onCreated={() => {
                        setShowNewDeal(false);
                        router.refresh();
                    }}
                />
            )}
        </>
    );
}

// ---- New Deal Dialog ----

function NewDealDialog({
    contacts,
    onClose,
    onCreated,
}: {
    contacts: ContactRow[];
    onClose: () => void;
    onCreated: () => void;
}) {
    const [contactSearch, setContactSearch] = useState('');
    const [selectedContactId, setSelectedContactId] = useState('');
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [currency, setCurrency] = useState('MXN');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    const filteredContacts = contactSearch.trim()
        ? contacts.filter((c) => c.nombre.toLowerCase().includes(contactSearch.toLowerCase())).slice(0, 8)
        : [];

    async function handleSubmit() {
        if (!selectedContactId || !name) return;
        setSaving(true);
        try {
            const res = await fetch('/api/deals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contact_id: selectedContactId,
                    name,
                    price: price ? parseFloat(price) : null,
                    currency,
                    description: description || null,
                }),
            });
            if (res.ok) {
                toast.success('Deal creado');
                onCreated();
            } else {
                toast.error('Error al crear deal');
            }
        } catch {
            toast.error('Error de conexión');
        }
        setSaving(false);
    }

    const selectedContact = contacts.find((c) => c.id === selectedContactId);

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]">
                    <h2 className="text-[16px] font-semibold text-[#1A1A2E]">Nuevo Deal</h2>
                    <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]"><X size={18} /></button>
                </div>
                <div className="p-6 space-y-4">
                    {/* Contact search */}
                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Contacto</label>
                        {selectedContact ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-[#F9FAFB] rounded-xl border border-[#E8E8EC]">
                                <span className="text-[13px] text-[#1A1A2E] flex-1">{selectedContact.nombre}</span>
                                <button onClick={() => { setSelectedContactId(''); setContactSearch(''); }} className="text-[#9CA3AF] hover:text-[#6B7280]">
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                                <input
                                    type="text"
                                    value={contactSearch}
                                    onChange={(e) => setContactSearch(e.target.value)}
                                    placeholder="Buscar contacto..."
                                    className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20"
                                />
                                {filteredContacts.length > 0 && (
                                    <div className="absolute z-10 mt-1 w-full bg-white border border-[#E8E8EC] rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                        {filteredContacts.map((c) => (
                                            <button
                                                key={c.id}
                                                onClick={() => { setSelectedContactId(c.id); setContactSearch(''); }}
                                                className="w-full text-left px-3 py-2 text-[13px] text-[#1A1A2E] hover:bg-[#F9FAFB] transition-colors"
                                            >
                                                {c.nombre}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Nombre del deal</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: Paquete Premium"
                            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20"
                        />
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Valor</label>
                            <input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="0"
                                className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20"
                            />
                        </div>
                        <div className="w-24">
                            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Moneda</label>
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20"
                            >
                                <option value="MXN">MXN</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="COP">COP</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">Descripción (opcional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 resize-none"
                        />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-[#E8E8EC] flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} className="rounded-xl border-[#E8E8EC] text-[#6B7280]">Cancelar</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={saving || !selectedContactId || !name}
                        className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                        Crear Deal
                    </Button>
                </div>
            </div>
        </div>
    );
}
