'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Edit2, Check, X, ExternalLink, Globe, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import type {
    RestaurantTable,
    RestaurantSchedule,
    RestaurantEvent,
    RestaurantMenu,
    DayOfWeek,
} from '@/lib/types/database';

// ---- Tab type ----
type Tab = 'mesas' | 'horarios' | 'eventos' | 'menus';

// ---- Shared label/input classes ----
const labelClass = 'block text-[12px] font-semibold text-[#6B7280] mb-1';
const inputClass =
    'w-full px-3 py-2 text-[13px] border border-[#E8E8EC] rounded-[10px] outline-none focus:border-[#818CF8] transition-colors bg-white';

// ============================================================
// MESAS TAB
// ============================================================

type TableFormState = {
    name: string;
    capacity: string;
    location: string;
    is_active: boolean;
};

function MesasTab({ tables: initialTables }: { tables: RestaurantTable[] }) {
    const router = useRouter();
    const [tables, setTables] = useState(initialTables);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<TableFormState>({
        name: '',
        capacity: '4',
        location: '',
        is_active: true,
    });
    const [loading, setLoading] = useState(false);

    function openNew() {
        setForm({ name: '', capacity: '4', location: '', is_active: true });
        setEditingId(null);
        setShowForm(true);
    }

    function openEdit(table: RestaurantTable) {
        setForm({
            name: table.name,
            capacity: String(table.capacity),
            location: table.location ?? '',
            is_active: table.is_active,
        });
        setEditingId(table.id);
        setShowForm(true);
    }

    async function handleSave() {
        if (!form.name.trim()) {
            toast.error('El nombre es requerido');
            return;
        }
        setLoading(true);
        try {
            const payload = {
                name: form.name.trim(),
                capacity: Number(form.capacity),
                location: form.location.trim() || null,
                is_active: form.is_active,
            };

            if (editingId) {
                const res = await fetch(`/api/restaurant/tables/${editingId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error();
                toast.success('Mesa actualizada');
            } else {
                const res = await fetch('/api/restaurant/tables', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error();
                toast.success('Mesa creada');
            }
            setShowForm(false);
            router.refresh();
        } catch {
            toast.error('Error al guardar la mesa');
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Eliminar esta mesa?')) return;
        try {
            const res = await fetch(`/api/restaurant/tables/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            setTables((prev) => prev.filter((t) => t.id !== id));
            toast.success('Mesa eliminada');
        } catch {
            toast.error('Error al eliminar la mesa');
        }
    }

    return (
        <div>
            <div className="flex justify-end mb-4">
                <Button
                    onClick={openNew}
                    className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
                >
                    <Plus size={15} />
                    Nueva mesa
                </Button>
            </div>

            {showForm && (
                <div className="bg-[#F8F8FA] rounded-xl border border-[#E8E8EC] p-4 mb-4">
                    <h4 className="text-[13px] font-semibold text-[#1A1A2E] mb-3">
                        {editingId ? 'Editar mesa' : 'Nueva mesa'}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <div>
                            <label className={labelClass}>Nombre *</label>
                            <input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Mesa 1, Terraza A..."
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Capacidad</label>
                            <input
                                type="number"
                                min={1}
                                value={form.capacity}
                                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Zona / Ubicacion</label>
                            <input
                                value={form.location}
                                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                                placeholder="Interior, Terraza..."
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                                className="w-4 h-4 accent-[#818CF8]"
                            />
                            <span className="text-[12px] text-[#6B7280]">Activa</span>
                        </label>
                        <div className="ml-auto flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowForm(false)}
                                className="rounded-[10px] border-[#E8E8EC] text-[#6B7280]"
                            >
                                <X size={14} />
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={loading}
                                className="rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white gap-1"
                            >
                                <Check size={14} />
                                Guardar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-[#E8E8EC] overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-[#E8E8EC] bg-[#F8F8FA]">
                            <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">Nombre</th>
                            <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">Capacidad</th>
                            <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Ubicacion</th>
                            <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">Estado</th>
                            <th className="px-4 py-3 w-20" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                        {tables.map((t) => (
                            <tr key={t.id} className="hover:bg-[#F8F8FA] transition-colors">
                                <td className="px-4 py-3 text-[13px] font-medium text-[#1A1A2E]">{t.name}</td>
                                <td className="px-4 py-3 text-[13px] text-[#6B7280]">{t.capacity} pers.</td>
                                <td className="px-4 py-3 text-[12px] text-[#9CA3AF] hidden sm:table-cell">{t.location ?? '—'}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {t.is_active ? 'Activa' : 'Inactiva'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                                            <Edit2 size={13} />
                                        </button>
                                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#EF4444] transition-colors">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {tables.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-[13px] text-[#9CA3AF]">
                        No hay mesas configuradas
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// HORARIOS TAB
// ============================================================

const DAY_NAMES: Record<DayOfWeek, string> = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miercoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sabado',
};

function HorariosTab({ schedules: initialSchedules }: { schedules: RestaurantSchedule[] }) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);

    // Build a map dayOfWeek → schedule (or null)
    const days: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];
    const scheduleMap = new Map(initialSchedules.map((s) => [s.day_of_week, s]));

    const [localSchedules, setLocalSchedules] = useState<
        Record<DayOfWeek, { open_time: string; close_time: string; is_closed: boolean }>
    >(
        Object.fromEntries(
            days.map((d) => [
                d,
                {
                    open_time: scheduleMap.get(d)?.open_time ?? '12:00',
                    close_time: scheduleMap.get(d)?.close_time ?? '22:00',
                    // is_closed = !is_active (if no schedule exists, default to open)
                    is_closed: scheduleMap.has(d) ? !scheduleMap.get(d)!.is_active : false,
                },
            ])
        ) as Record<DayOfWeek, { open_time: string; close_time: string; is_closed: boolean }>
    );

    function update(day: DayOfWeek, field: string, value: string | boolean) {
        setLocalSchedules((prev) => ({
            ...prev,
            [day]: { ...prev[day], [field]: value },
        }));
    }

    async function handleSaveAll() {
        setSaving(true);
        try {
            await Promise.all(
                days.map(async (day) => {
                    const existing = scheduleMap.get(day);
                    const body = {
                        day_of_week: day,
                        open_time: localSchedules[day].open_time,
                        close_time: localSchedules[day].close_time,
                        is_active: !localSchedules[day].is_closed,
                    };
                    if (existing) {
                        await fetch(`/api/restaurant/schedules/${existing.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                        });
                    } else {
                        await fetch('/api/restaurant/schedules', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                        });
                    }
                })
            );
            toast.success('Horarios guardados');
            router.refresh();
        } catch {
            toast.error('Error al guardar los horarios');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div>
            <div className="bg-white rounded-2xl border border-[#E8E8EC] overflow-hidden mb-4">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-[#E8E8EC] bg-[#F8F8FA]">
                            <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3 w-32">Dia</th>
                            <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">Abre</th>
                            <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">Cierra</th>
                            <th className="text-left text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-4 py-3">Cerrado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                        {days.map((day) => {
                            const s = localSchedules[day];
                            return (
                                <tr key={day} className={s.is_closed ? 'opacity-50' : ''}>
                                    <td className="px-4 py-3 text-[13px] font-medium text-[#1A1A2E]">
                                        {DAY_NAMES[day]}
                                    </td>
                                    <td className="px-4 py-3">
                                        <input
                                            type="time"
                                            value={s.open_time}
                                            disabled={s.is_closed}
                                            onChange={(e) => update(day, 'open_time', e.target.value)}
                                            className="px-2 py-1.5 text-[13px] border border-[#E8E8EC] rounded-lg outline-none focus:border-[#818CF8] disabled:bg-[#F3F4F6] disabled:cursor-not-allowed"
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <input
                                            type="time"
                                            value={s.close_time}
                                            disabled={s.is_closed}
                                            onChange={(e) => update(day, 'close_time', e.target.value)}
                                            className="px-2 py-1.5 text-[13px] border border-[#E8E8EC] rounded-lg outline-none focus:border-[#818CF8] disabled:bg-[#F3F4F6] disabled:cursor-not-allowed"
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={s.is_closed}
                                            onChange={(e) => update(day, 'is_closed', e.target.checked)}
                                            className="w-4 h-4 accent-[#EF4444]"
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-end">
                <Button
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
                >
                    <Check size={15} />
                    {saving ? 'Guardando...' : 'Guardar horarios'}
                </Button>
            </div>
        </div>
    );
}

// ============================================================
// EVENTOS TAB
// ============================================================

type EventFormState = {
    name: string;
    description: string;
    event_date: string;
    start_time: string;
    end_time: string;
    max_guests: string;
    price: string;
    is_active: boolean;
};

function EventosTab({ events: initialEvents }: { events: RestaurantEvent[] }) {
    const router = useRouter();
    const [events, setEvents] = useState(initialEvents);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<EventFormState>({
        name: '',
        description: '',
        event_date: '',
        start_time: '',
        end_time: '',
        max_guests: '',
        price: '',
        is_active: true,
    });
    const [loading, setLoading] = useState(false);

    function openNew() {
        setForm({ name: '', description: '', event_date: '', start_time: '', end_time: '', max_guests: '', price: '', is_active: true });
        setEditingId(null);
        setShowForm(true);
    }

    function openEdit(ev: RestaurantEvent) {
        setForm({
            name: ev.name,
            description: ev.description ?? '',
            event_date: ev.event_date,
            start_time: ev.start_time ?? '',
            end_time: ev.end_time ?? '',
            max_guests: ev.max_guests !== null ? String(ev.max_guests) : '',
            price: ev.price !== null ? String(ev.price) : '',
            is_active: ev.is_active,
        });
        setEditingId(ev.id);
        setShowForm(true);
    }

    async function handleSave() {
        if (!form.name.trim() || !form.event_date) {
            toast.error('Nombre y fecha son requeridos');
            return;
        }
        setLoading(true);
        try {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                event_date: form.event_date,
                start_time: form.start_time || null,
                end_time: form.end_time || null,
                max_guests: form.max_guests ? Number(form.max_guests) : null,
                price: form.price ? Number(form.price) : null,
                is_active: form.is_active,
            };

            if (editingId) {
                await fetch(`/api/restaurant/events/${editingId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                toast.success('Evento actualizado');
            } else {
                await fetch('/api/restaurant/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                toast.success('Evento creado');
            }
            setShowForm(false);
            router.refresh();
        } catch {
            toast.error('Error al guardar el evento');
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Eliminar este evento?')) return;
        try {
            await fetch(`/api/restaurant/events/${id}`, { method: 'DELETE' });
            setEvents((prev) => prev.filter((e) => e.id !== id));
            toast.success('Evento eliminado');
        } catch {
            toast.error('Error al eliminar el evento');
        }
    }

    return (
        <div>
            <div className="flex justify-end mb-4">
                <Button onClick={openNew} className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white">
                    <Plus size={15} /> Nuevo evento
                </Button>
            </div>

            {showForm && (
                <div className="bg-[#F8F8FA] rounded-xl border border-[#E8E8EC] p-4 mb-4">
                    <h4 className="text-[13px] font-semibold text-[#1A1A2E] mb-3">
                        {editingId ? 'Editar evento' : 'Nuevo evento'}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div className="sm:col-span-2">
                            <label className={labelClass}>Nombre *</label>
                            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Cena de Año Nuevo..." className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Fecha *</label>
                            <input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Capacidad maxima</label>
                            <input type="number" min={1} value={form.max_guests} onChange={(e) => setForm((f) => ({ ...f, max_guests: e.target.value }))} placeholder="50" className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Hora inicio</label>
                            <input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Hora fin</label>
                            <input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Precio por persona</label>
                            <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.00" className={inputClass} />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelClass}>Descripcion</label>
                            <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputClass + ' resize-none'} />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-[#818CF8]" />
                            <span className="text-[12px] text-[#6B7280]">Activo</span>
                        </label>
                        <div className="ml-auto flex gap-2">
                            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-[10px] border-[#E8E8EC] text-[#6B7280]"><X size={14} /></Button>
                            <Button onClick={handleSave} disabled={loading} className="rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white gap-1"><Check size={14} />Guardar</Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {events.map((ev) => (
                    <div key={ev.id} className="bg-white rounded-xl border border-[#E8E8EC] p-4 flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[13px] font-semibold text-[#1A1A2E]">{ev.name}</p>
                            <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                                {ev.event_date} {ev.start_time && `· ${ev.start_time.slice(0, 5)}`}
                                {ev.max_guests && ` · Max ${ev.max_guests} pers.`}
                            </p>
                            {ev.description && <p className="text-[12px] text-[#6B7280] mt-1">{ev.description}</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => openEdit(ev)} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"><Edit2 size={13} /></button>
                            <button onClick={() => handleDelete(ev.id)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#EF4444] transition-colors"><Trash2 size={13} /></button>
                        </div>
                    </div>
                ))}
                {events.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-[13px] text-[#9CA3AF] bg-white rounded-2xl border border-[#E8E8EC]">
                        No hay eventos configurados
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// MENUS TAB
// ============================================================

type MenuFormState = {
    name: string;
    menu_url: string;
    is_default: boolean;
};

function MenusTab({ menus: initialMenus }: { menus: RestaurantMenu[] }) {
    const router = useRouter();
    const [menus, setMenus] = useState(initialMenus);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<MenuFormState>({ name: '', menu_url: '', is_default: false });
    const [loading, setLoading] = useState(false);

    function openNew() {
        setForm({ name: '', menu_url: '', is_default: false });
        setEditingId(null);
        setShowForm(true);
    }

    function openEdit(m: RestaurantMenu) {
        setForm({ name: m.name, menu_url: m.menu_url ?? '', is_default: m.is_default });
        setEditingId(m.id);
        setShowForm(true);
    }

    async function handleSave() {
        if (!form.name.trim()) {
            toast.error('El nombre es requerido');
            return;
        }
        setLoading(true);
        try {
            const payload = { name: form.name.trim(), menu_url: form.menu_url.trim() || null };
            if (editingId) {
                await fetch(`/api/restaurant/menus/${editingId}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
                });
                toast.success('Menu actualizado');
            } else {
                await fetch('/api/restaurant/menus', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
                });
                toast.success('Menu creado');
            }
            setShowForm(false);
            router.refresh();
        } catch {
            toast.error('Error al guardar el menu');
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Eliminar este menu?')) return;
        try {
            await fetch(`/api/restaurant/menus/${id}`, { method: 'DELETE' });
            setMenus((prev) => prev.filter((m) => m.id !== id));
            toast.success('Menu eliminado');
        } catch {
            toast.error('Error al eliminar el menu');
        }
    }

    return (
        <div>
            <div className="flex justify-end mb-4">
                <Button onClick={openNew} className="gap-2 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white">
                    <Plus size={15} /> Nuevo menu
                </Button>
            </div>

            {showForm && (
                <div className="bg-[#F8F8FA] rounded-xl border border-[#E8E8EC] p-4 mb-4">
                    <h4 className="text-[13px] font-semibold text-[#1A1A2E] mb-3">{editingId ? 'Editar menu' : 'Nuevo menu'}</h4>
                    <div className="grid grid-cols-1 gap-3 mb-3">
                        <div>
                            <label className={labelClass}>Nombre *</label>
                            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Menu almuerzo, Menu degustacion..." className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>URL del menu (PDF o imagen)</label>
                            <input value={form.menu_url} onChange={(e) => setForm((f) => ({ ...f, menu_url: e.target.value }))} placeholder="https://..." type="url" className={inputClass} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-[10px] border-[#E8E8EC] text-[#6B7280]"><X size={14} /></Button>
                        <Button onClick={handleSave} disabled={loading} className="rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white gap-1"><Check size={14} />Guardar</Button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {menus.map((m) => (
                    <div key={m.id} className="bg-white rounded-xl border border-[#E8E8EC] p-4 flex items-center justify-between gap-4">
                        <div>
                            <p className="text-[13px] font-semibold text-[#1A1A2E]">{m.name}</p>
                            {m.menu_url && (
                                <a href={m.menu_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#818CF8] hover:underline mt-0.5">
                                    Ver menu <ExternalLink size={10} />
                                </a>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"><Edit2 size={13} /></button>
                            <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#EF4444] transition-colors"><Trash2 size={13} /></button>
                        </div>
                    </div>
                ))}
                {menus.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-[13px] text-[#9CA3AF] bg-white rounded-2xl border border-[#E8E8EC]">
                        No hay menus configurados
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// BOOKING LINK BANNER
// ============================================================

function BookingLinkBanner({ slug }: { slug: string }) {
    const [copied, setCopied] = useState(false);
    const bookingUrl = typeof window !== 'undefined' ? `${window.location.origin}/${slug}` : `/${slug}`;

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(bookingUrl);
            setCopied(true);
            toast.success('¡Copiado!');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('No se pudo copiar el link');
        }
    }

    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] p-4 mb-6 flex items-center gap-4 shadow-sm">
            {/* Icon */}
            <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #818CF8 0%, #6366F1 100%)' }}>
                <Globe size={18} className="text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide mb-0.5">
                    Pagina de reservas publica
                </p>
                <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-medium text-[#6366F1] hover:underline truncate block"
                >
                    {bookingUrl}
                </a>
                <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                    Comparte este link con tus clientes para que reserven en linea
                </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-medium border border-[#E8E8EC] text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
                >
                    <Copy size={13} />
                    {copied ? '¡Copiado!' : 'Copiar link'}
                </button>
                <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-medium bg-[#818CF8] hover:bg-[#6366F1] text-white transition-colors"
                >
                    <ExternalLink size={13} />
                    Ver pagina
                </a>
            </div>
        </div>
    );
}

// ============================================================
// MAIN
// ============================================================

export function RestaurantSettingsClient({
    initialTables,
    initialSchedules,
    initialEvents,
    initialMenus,
    slug,
}: {
    initialTables: RestaurantTable[];
    initialSchedules: RestaurantSchedule[];
    initialEvents: RestaurantEvent[];
    initialMenus: RestaurantMenu[];
    slug: string;
}) {
    const [tab, setTab] = useState<Tab>('mesas');

    const tabs: { key: Tab; label: string }[] = [
        { key: 'mesas', label: 'Mesas' },
        { key: 'horarios', label: 'Horarios' },
        { key: 'eventos', label: 'Eventos' },
        { key: 'menus', label: 'Menus' },
    ];

    return (
        <>
            <PageHeader
                title="Configuracion del Restaurante"
                description="Gestiona mesas, horarios, eventos y menus"
            />

            {/* Booking link banner */}
            {slug && <BookingLinkBanner slug={slug} />}

            {/* Tab bar */}
            <div className="flex gap-1 bg-[#F3F4F6] rounded-[12px] p-1 mb-6 w-fit">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-4 py-2 rounded-[10px] text-[13px] font-medium transition-all ${
                            tab === t.key
                                ? 'bg-white text-[#1A1A2E] shadow-sm'
                                : 'text-[#6B7280] hover:text-[#1A1A2E]'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'mesas' && <MesasTab tables={initialTables} />}
            {tab === 'horarios' && <HorariosTab schedules={initialSchedules} />}
            {tab === 'eventos' && <EventosTab events={initialEvents} />}
            {tab === 'menus' && <MenusTab menus={initialMenus} />}
        </>
    );
}
