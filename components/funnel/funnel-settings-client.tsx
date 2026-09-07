'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    GripVertical,
    Plus,
    Trash2,
    ChevronLeft,
    Check,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import type { FunnelStage } from '@/lib/types/database';

const PRESET_COLORS = [
    '#818CF8', '#6366F1', '#60A5FA', '#34D399', '#FBBF24',
    '#F97316', '#EF4444', '#F9A8D4', '#A78BFA', '#22C55E',
];

// ---- Color Picker Popover ----

function ColorDot({
    color,
    onChange,
}: {
    color: string;
    onChange: (c: string) => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-6 h-6 rounded-full border-2 border-white shadow-sm ring-1 ring-[#E8E8EC] transition-transform hover:scale-110"
                style={{ backgroundColor: color }}
                title="Cambiar color"
            />
            {open && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpen(false)}
                    />
                    <div className="absolute left-0 top-8 z-20 bg-white rounded-xl border border-[#E8E8EC] shadow-lg p-3">
                        <div className="grid grid-cols-5 gap-2">
                            {PRESET_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => {
                                        onChange(c);
                                        setOpen(false);
                                    }}
                                    className="w-6 h-6 rounded-full transition-transform hover:scale-110 relative"
                                    style={{ backgroundColor: c }}
                                >
                                    {c === color && (
                                        <Check
                                            size={12}
                                            className="absolute inset-0 m-auto text-white"
                                            strokeWidth={3}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => onChange(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer border border-[#E8E8EC]"
                                title="Color personalizado"
                            />
                            <span className="text-[11px] text-[#9CA3AF]">Personalizado</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ---- Sortable Stage Row ----

type StageDraft = FunnelStage & { is_won?: boolean; is_lost?: boolean };

function SortableStageRow({
    stage,
    onUpdate,
    onDelete,
}: {
    stage: StageDraft;
    onUpdate: (id: string, changes: Partial<StageDraft>) => void;
    onDelete: (id: string) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: stage.id });

    const [editing, setEditing] = useState(false);
    const [nameValue, setNameValue] = useState(stage.name);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    function commitName() {
        const trimmed = nameValue.trim();
        if (trimmed && trimmed !== stage.name) {
            onUpdate(stage.id, { name: trimmed });
        } else {
            setNameValue(stage.name);
        }
        setEditing(false);
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 px-4 py-3 bg-white rounded-xl border transition-shadow ${
                isDragging ? 'shadow-lg border-[#818CF8]/30' : 'border-[#E8E8EC] hover:border-[#D1D5DB]'
            }`}
        >
            {/* Drag Handle */}
            <button
                {...attributes}
                {...listeners}
                className="text-[#D1D5DB] hover:text-[#9CA3AF] cursor-grab active:cursor-grabbing flex-shrink-0"
                tabIndex={-1}
            >
                <GripVertical size={16} />
            </button>

            {/* Color */}
            <ColorDot
                color={stage.color ?? '#818CF8'}
                onChange={(c) => onUpdate(stage.id, { color: c })}
            />

            {/* Name */}
            <div className="flex-1 min-w-0">
                {editing ? (
                    <input
                        autoFocus
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitName();
                            if (e.key === 'Escape') {
                                setNameValue(stage.name);
                                setEditing(false);
                            }
                        }}
                        className="w-full text-[13px] font-medium text-[#1A1A2E] border border-[#818CF8] rounded-lg px-2 py-1 outline-none"
                    />
                ) : (
                    <button
                        onClick={() => setEditing(true)}
                        className="text-[13px] font-medium text-[#1A1A2E] hover:text-[#6366F1] transition-colors text-left w-full truncate"
                    >
                        {stage.name}
                    </button>
                )}
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={stage.is_won ?? false}
                        onChange={(e) => onUpdate(stage.id, { is_won: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#22C55E]"
                    />
                    <span className="text-[11px] text-[#22C55E] font-medium">Ganado</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={stage.is_lost ?? false}
                        onChange={(e) => onUpdate(stage.id, { is_lost: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#EF4444]"
                    />
                    <span className="text-[11px] text-[#EF4444] font-medium">Perdido</span>
                </label>
            </div>

            {/* Delete */}
            <button
                onClick={() => onDelete(stage.id)}
                className="text-[#D1D5DB] hover:text-[#EF4444] transition-colors flex-shrink-0"
                title="Eliminar etapa"
            >
                <Trash2 size={15} />
            </button>
        </div>
    );
}

// ---- Main Client ----

export function FunnelSettingsClient({
    initialStages,
}: {
    initialStages: FunnelStage[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [stages, setStages] = useState<StageDraft[]>(initialStages as StageDraft[]);
    const [saving, setSaving] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    // ---------- Handlers ----------

    async function handleUpdate(id: string, changes: Partial<StageDraft>) {
        // Optimistic local update
        setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)));
        try {
            const res = await fetch(`/api/funnel-stages/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(changes),
            });
            if (!res.ok) throw new Error();
            startTransition(() => { router.refresh(); });
        } catch {
            toast.error('Error al actualizar la etapa');
            startTransition(() => { router.refresh(); });
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Eliminar esta etapa? Los contactos quedarán sin etapa asignada.')) return;
        setStages((prev) => prev.filter((s) => s.id !== id));
        try {
            const res = await fetch(`/api/funnel-stages/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            toast.success('Etapa eliminada');
            startTransition(() => { router.refresh(); });
        } catch {
            toast.error('Error al eliminar la etapa');
            startTransition(() => { router.refresh(); });
        }
    }

    async function handleAdd() {
        setSaving(true);
        try {
            const res = await fetch('/api/funnel-stages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Nueva etapa', color: '#818CF8' }),
            });
            if (!res.ok) throw new Error();
            const created = await res.json() as StageDraft;
            // Add to local state so it appears immediately (router.refresh doesn't reset useState)
            setStages((prev) => [...prev, created]);
            toast.success('Etapa creada');
        } catch {
            toast.error('Error al crear la etapa');
        } finally {
            setSaving(false);
        }
    }

    async function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = stages.findIndex((s) => s.id === active.id);
        const newIndex = stages.findIndex((s) => s.id === over.id);
        const reordered = arrayMove(stages, oldIndex, newIndex);

        setStages(reordered);

        // Persist all positions
        try {
            await Promise.all(
                reordered.map((stage, index) =>
                    fetch(`/api/funnel-stages/${stage.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ position: index }),
                    })
                )
            );
            startTransition(() => { router.refresh(); });
        } catch {
            toast.error('Error al reordenar las etapas');
            startTransition(() => { router.refresh(); });
        }
    }

    return (
        <>
            <PageHeader
                title="Gestionar etapas del Funnel"
                description="Arrastra para reordenar. Haz clic en el nombre para editarlo."
            >
                <Link href="/funnel">
                    <Button
                        variant="outline"
                        className="gap-2 rounded-[10px] border-[#E8E8EC] text-[#6B7280] hover:bg-[#F9FAFB]"
                    >
                        <ChevronLeft size={15} />
                        Volver al Funnel
                    </Button>
                </Link>
                <Button
                    onClick={handleAdd}
                    disabled={saving || isPending}
                    className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
                >
                    <Plus size={15} />
                    Nueva etapa
                </Button>
            </PageHeader>

            <div className="max-w-2xl">
                {/* Header labels */}
                <div className="flex items-center gap-3 px-4 mb-2 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">
                    <span className="w-4" />
                    <span className="w-6" />
                    <span className="flex-1">Nombre</span>
                    <span>Ganado / Perdido</span>
                    <span className="w-4" />
                </div>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={stages.map((s) => s.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-2">
                            {stages.map((stage) => (
                                <SortableStageRow
                                    key={stage.id}
                                    stage={stage}
                                    onUpdate={handleUpdate}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {stages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <p className="text-[13px] text-[#9CA3AF]">
                            No hay etapas configuradas.
                        </p>
                        <Button
                            onClick={handleAdd}
                            className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
                        >
                            <Plus size={15} />
                            Crear primera etapa
                        </Button>
                    </div>
                )}

                {/* Legend */}
                <div className="mt-6 p-4 bg-[#F8F8FA] rounded-xl border border-[#E8E8EC] text-[12px] text-[#6B7280]">
                    <p className="font-medium text-[#1A1A2E] mb-1">Atajos de teclado</p>
                    <ul className="space-y-1">
                        <li><kbd className="bg-white border border-[#E8E8EC] rounded px-1 text-[11px]">Enter</kbd> — guardar nombre</li>
                        <li><kbd className="bg-white border border-[#E8E8EC] rounded px-1 text-[11px]">Esc</kbd> — cancelar edicion</li>
                    </ul>
                </div>
            </div>
        </>
    );
}
