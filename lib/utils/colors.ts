import type { ContactPhase, CalendarEventType } from '@/lib/types/database';

export const PHASE_COLORS: Record<ContactPhase, { text: string; bg: string; dot: string }> = {
    nuevo: { text: '#818CF8', bg: '#EEF0FF', dot: '#818CF8' },
    contactado: { text: '#FBBF24', bg: '#FFFBEB', dot: '#FBBF24' },
    interesado: { text: '#34D399', bg: '#ECFDF5', dot: '#34D399' },
    en_negociacion: { text: '#A78BFA', bg: '#F5F3FF', dot: '#A78BFA' },
    reunion_agendada: { text: '#F9A8D4', bg: '#FDF2F8', dot: '#F9A8D4' },
    propuesta_enviada: { text: '#F97316', bg: '#FFF7ED', dot: '#F97316' },
    cerrado_ganado: { text: '#10B981', bg: '#D1FAE5', dot: '#10B981' },
    cerrado_perdido: { text: '#F87171', bg: '#FEF2F2', dot: '#F87171' },
};

export const EVENT_TYPE_COLORS: Record<CalendarEventType, { text: string; bg: string }> = {
    meeting: { text: '#818CF8', bg: '#EEF0FF' },
    follow_up: { text: '#34D399', bg: '#ECFDF5' },
    call: { text: '#FBBF24', bg: '#FFFBEB' },
    demo: { text: '#F9A8D4', bg: '#FDF2F8' },
    task: { text: '#A78BFA', bg: '#F5F3FF' },
};

export const CHANNEL_COLORS: Record<string, { text: string; bg: string }> = {
    email: { text: '#818CF8', bg: '#EEF0FF' },
    whatsapp: { text: '#34D399', bg: '#ECFDF5' },
    system: { text: '#9CA3AF', bg: '#F3F4F6' },
    manual: { text: '#FBBF24', bg: '#FFFBEB' },
};
