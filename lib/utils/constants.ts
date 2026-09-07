import type {
    ConversationStatus,
    ReservationStatus,
    ContactPhase,
} from '@/lib/types/database';

// ============================================================
// Conversation constants
// ============================================================

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
    open: 'Abierta',
    resolved: 'Resuelta',
    pending: 'Pendiente',
    snoozed: 'Pospuesta',
};

export const CONVERSATION_STATUS_COLORS: Record<ConversationStatus, string> = {
    open: '#22C55E',
    resolved: '#6B7280',
    pending: '#F59E0B',
    snoozed: '#818CF8',
};

// ============================================================
// Message constants
// ============================================================

export const MESSAGE_TYPE_LABELS: Record<string, string> = {
    text: 'Texto',
    image: 'Imagen',
    audio: 'Audio',
    video: 'Video',
    document: 'Documento',
    template: 'Plantilla',
    note: 'Nota',
    sticker: 'Sticker',
    location: 'Ubicación',
    reaction: 'Reacción',
};

// ============================================================
// Reservation constants
// ============================================================

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    seated: 'En mesa',
    completed: 'Completada',
    cancelled: 'Cancelada',
    no_show: 'No se presentó',
};

export const RESERVATION_STATUS_COLORS: Record<ReservationStatus, string> = {
    pending: '#F59E0B',
    confirmed: '#22C55E',
    seated: '#818CF8',
    completed: '#6B7280',
    cancelled: '#EF4444',
    no_show: '#F97316',
};

export const RESERVATION_SOURCE_LABELS: Record<string, string> = {
    phone: 'Teléfono',
    whatsapp: 'WhatsApp',
    web: 'Web',
    manual: 'Manual',
    n8n: 'Automatización',
};

export const RESERVATION_OCCASION_LABELS: Record<string, string> = {
    birthday: 'Cumpleaños',
    anniversary: 'Aniversario',
    business: 'Negocio',
    celebration: 'Celebración',
    other: 'Otro',
};

// ============================================================
// Funnel stage defaults
// ============================================================

export const DEFAULT_FUNNEL_STAGES = [
    { name: 'Nuevo', color: '#818CF8', position: 0 },
    { name: 'Contactado', color: '#60A5FA', position: 1 },
    { name: 'Interesado', color: '#34D399', position: 2 },
    { name: 'En negociación', color: '#FBBF24', position: 3 },
    { name: 'Propuesta enviada', color: '#F97316', position: 4 },
    { name: 'Cerrado ganado', color: '#22C55E', position: 5 },
    { name: 'Cerrado perdido', color: '#EF4444', position: 6 },
] as const;

// ============================================================
// Contact source labels
// ============================================================

export const SOURCE_LABELS: Record<string, string> = {
    manual: 'Manual',
    whatsapp: 'WhatsApp',
    web: 'Web',
    csv: 'CSV',
    n8n: 'Automatización',
};

// ============================================================
// Legacy funnel phase constants — kept for backwards compatibility.
// ============================================================

/** @deprecated Use DEFAULT_FUNNEL_STAGES instead */
export const PHASE_LABELS: Record<ContactPhase, string> = {
    nuevo: 'Nuevo',
    contactado: 'Contactado',
    interesado: 'Interesado',
    en_negociacion: 'En Negociación',
    reunion_agendada: 'Reunión Agendada',
    propuesta_enviada: 'Propuesta Enviada',
    cerrado_ganado: 'Cerrado Ganado',
    cerrado_perdido: 'Cerrado Perdido',
};

/** @deprecated Use DEFAULT_FUNNEL_STAGES instead */
export const PHASE_ORDER: ContactPhase[] = [
    'nuevo',
    'contactado',
    'interesado',
    'en_negociacion',
    'reunion_agendada',
    'propuesta_enviada',
    'cerrado_ganado',
    'cerrado_perdido',
];

/** @deprecated */
export const EVENT_TYPE_LABELS: Record<string, string> = {
    meeting: 'Reunión',
    follow_up: 'Seguimiento',
    call: 'Llamada',
    demo: 'Demo',
    task: 'Tarea',
};

// ============================================================
// Activity labels
// ============================================================

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
    contact_created: 'Contacto creado',
    contact_updated: 'Contacto actualizado',
    stage_changed: 'Etapa cambiada',
    note_added: 'Nota agregada',
    message_sent: 'Mensaje enviado',
    message_received: 'Mensaje recibido',
    reservation_created: 'Reserva creada',
    reservation_confirmed: 'Reserva confirmada',
    reservation_cancelled: 'Reserva cancelada',
    campaign_sent: 'Campaña enviada',
    appointment_scheduled: 'Cita agendada',
};
