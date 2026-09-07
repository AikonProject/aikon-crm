// @ts-nocheck
'use client';

import { useState } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
    type DragStartEvent,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import { PhaseBadge } from '@/components/contacts/phase-badge';
import { PHASE_ORDER, PHASE_LABELS } from '@/lib/utils/constants';
import { PHASE_COLORS } from '@/lib/utils/colors';
import { mockContacts, mockProfiles } from '@/lib/mock-data';
import { getInitials, formatSmartDate } from '@/lib/utils/format';
import type { Contact, ContactPhase } from '@/lib/types/database';

// Kanban Card
function KanbanCard({ contact, isDragging }: { contact: Contact; isDragging?: boolean }) {
    const assignee = mockProfiles.find((p) => p.id === contact.assigned_to);
    const colors = PHASE_COLORS[contact.phase ?? 'nuevo'];

    return (
        <div
            className={`bg-white rounded-xl border border-[#E8E8EC] p-4 cursor-grab active:cursor-grabbing transition-shadow ${isDragging ? 'shadow-lg ring-2 ring-[#818CF8]/20' : 'shadow-sm hover:shadow-md'
                }`}
            style={{ borderLeft: `3px solid ${colors.dot}` }}
        >
            <div className="flex items-start justify-between mb-2">
                <h4 className="text-[14px] font-semibold text-[#1A1A2E]">
                    {contact.first_name} {contact.last_name}
                </h4>
                {assignee && (
                    <div className="w-6 h-6 rounded-full bg-[#EEF0FF] flex items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-semibold text-[#818CF8]">
                            {getInitials(assignee.full_name)}
                        </span>
                    </div>
                )}
            </div>
            {contact.company && (
                <p className="text-[12px] text-[#6B7280] mb-2">{contact.company}</p>
            )}
            <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                    {(contact.tags ?? []).slice(0, 2).map((tag) => {
                        const label = typeof tag === 'string' ? tag : tag.name;
                        return (
                            <span
                                key={label}
                                className="px-1.5 py-0.5 bg-[#F3F4F6] text-[#9CA3AF] text-[10px] font-medium rounded-full"
                            >
                                {label}
                            </span>
                        );
                    })}
                </div>
                {contact.last_contacted_at && (
                    <span className="text-[10px] text-[#9CA3AF]">
                        {formatSmartDate(contact.last_contacted_at)}
                    </span>
                )}
            </div>
        </div>
    );
}

// Sortable wrapper
function SortableCard({ contact }: { contact: Contact }) {
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
            <KanbanCard contact={contact} />
        </div>
    );
}

// Kanban Column
function KanbanColumn({
    phase,
    contacts,
}: {
    phase: ContactPhase;
    contacts: Contact[];
}) {
    const colors = PHASE_COLORS[phase];

    return (
        <div className="flex-shrink-0 w-[280px]">
            <div className="flex items-center gap-2 mb-3 px-1">
                <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: colors.dot }}
                />
                <h3 className="text-[13px] font-semibold text-[#1A1A2E]">
                    {PHASE_LABELS[phase]}
                </h3>
                <span className="text-[12px] text-[#9CA3AF] font-medium">
                    {contacts.length}
                </span>
            </div>
            <div className="bg-[#F3F4F6]/50 rounded-2xl p-2.5 min-h-[400px] space-y-2.5">
                <SortableContext
                    items={contacts.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {contacts.map((contact) => (
                        <SortableCard key={contact.id} contact={contact} />
                    ))}
                </SortableContext>
                {contacts.length === 0 && (
                    <div className="flex items-center justify-center h-[100px] text-[13px] text-[#9CA3AF]">
                        Sin contactos
                    </div>
                )}
            </div>
        </div>
    );
}

export default function PipelinePage() {
    const [contacts, setContacts] = useState(mockContacts);
    const [activeContact, setActiveContact] = useState<Contact | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        })
    );

    const contactsByPhase = PHASE_ORDER.reduce((acc, phase) => {
        acc[phase] = contacts.filter((c) => (c.phase ?? 'nuevo') === phase);
        return acc;
    }, {} as Record<ContactPhase, Contact[]>);

    function handleDragStart(event: DragStartEvent) {
        const contact = contacts.find((c) => c.id === event.active.id);
        setActiveContact(contact || null);
    }

    function handleDragEnd(event: DragEndEvent) {
        setActiveContact(null);
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // Find target phase by locating which column the "over" item is in
        const overContactId = over.id as string;
        const overContact = contacts.find((c) => c.id === overContactId);
        if (!overContact) return;

        setContacts((prev) =>
            prev.map((c) =>
                c.id === active.id ? { ...c, phase: overContact.phase } : c
            )
        );
    }

    return (
        <>
            <Breadcrumb />
            <PageHeader
                title="Pipeline"
                description="Arrastra y suelta los contactos entre fases"
            />

            <div className="overflow-x-auto pb-4 -mx-2">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex gap-4 px-2 min-w-max">
                        {PHASE_ORDER.map((phase) => (
                            <KanbanColumn
                                key={phase}
                                phase={phase}
                                contacts={contactsByPhase[phase]}
                            />
                        ))}
                    </div>
                    <DragOverlay>
                        {activeContact ? (
                            <div className="w-[280px]">
                                <KanbanCard contact={activeContact} isDragging />
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </div>
        </>
    );
}
