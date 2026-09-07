// @ts-nocheck
import type {
    Contact,
    EmailCampaign,
    EmailEvent,
    ActivityLog,
    CalendarEvent,
    DailyMetrics,
    Profile,
} from '@/lib/types/database';

// ============ PROFILES ============
export const mockProfiles: Profile[] = [
    {
        id: 'p1',
        full_name: 'Juan Pérez',
        email: 'juan@aikon.com',
        avatar_url: null,
        role: 'admin',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
    },
    {
        id: 'p2',
        full_name: 'María García',
        email: 'maria@aikon.com',
        avatar_url: null,
        role: 'manager',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
    },
    {
        id: 'p3',
        full_name: 'Carlos López',
        email: 'carlos@aikon.com',
        avatar_url: null,
        role: 'agent',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
    },
];

// ============ CONTACTS ============
const colombianNames = [
    ['Andrés', 'Rodríguez'], ['Valentina', 'Martínez'], ['Santiago', 'López'],
    ['Isabella', 'González'], ['Sebastián', 'Hernández'], ['Camila', 'Díaz'],
    ['Mateo', 'Torres'], ['Sofía', 'Ramírez'], ['Daniel', 'Flores'], ['Mariana', 'Vargas'],
    ['Nicolás', 'Morales'], ['Gabriela', 'Jiménez'], ['Alejandro', 'Rojas'],
    ['Laura', 'Castro'], ['Diego', 'Ortiz'], ['Ana', 'Muñoz'], ['Felipe', 'Ruiz'],
    ['Juliana', 'Sánchez'], ['David', 'Romero'], ['Natalia', 'Navarro'],
    ['Tomás', 'Gutiérrez'], ['Paula', 'Peña'], ['Miguel', 'Acosta'],
    ['Carolina', 'Medina'], ['Juan Pablo', 'Herrera'], ['Andrea', 'Aguilar'],
    ['Simón', 'Mendoza'], ['Daniela', 'Pardo'], ['Esteban', 'Reyes'],
    ['Lucia', 'Ríos'], ['Rafael', 'Cruz'], ['Manuela', 'Vega'],
    ['Cristian', 'Ospina'], ['Catalina', 'Suárez'], ['Jorge', 'Prieto'],
    ['Sara', 'Molina'], ['Iván', 'Castaño'], ['Tatiana', 'Duarte'],
    ['Andrés Felipe', 'Quintero'], ['María José', 'Delgado'], ['Carlos Andrés', 'Pineda'],
    ['Diana', 'Cárdenas'], ['Fernando', 'Leal'], ['Paola', 'Montoya'],
    ['Ricardo', 'Barrera'], ['Ángela', 'Salazar'], ['Mauricio', 'Bernal'],
    ['Claudia', 'Escobar'], ['Gustavo', 'Valencia'], ['Lina', 'Arango'],
];

const companies = [
    'TechCorp Colombia', 'InnovaGroup', 'Digital Solutions SAS', 'Rappi Partners',
    'Grupo Éxito Digital', 'Bancolombia Tech', 'Nutresa Labs', 'EPM Digital',
    'Sura Ventures', 'Celsia Innovation', 'Terpel Soluciones', 'Carvajal TI',
    'Corona Digital', 'Argos Innovación', 'Postobón Tech', 'Alkosto IT',
    'Davivienda Labs', 'Colpatria Digital', 'Avianca Tech', 'Colombia Fintech',
];

const cities = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Manizales'];
const phases = ['nuevo', 'contactado', 'interesado', 'en_negociacion', 'reunion_agendada', 'propuesta_enviada', 'cerrado_ganado', 'cerrado_perdido'] as const;
const sources = ['csv', 'whatsapp', 'web', 'manual'] as const;
const tagOptions = ['enterprise', 'startup', 'pyme', 'caliente', 'referido', 'linkedin', 'evento', 'prioridad'];

export const mockContacts: Contact[] = colombianNames.map(([first, last], i) => ({
    id: `c${i + 1}`,
    first_name: first,
    last_name: last,
    email: `${first.toLowerCase().replace(/\s/g, '')}@${companies[i % companies.length].toLowerCase().replace(/\s/g, '')}.com`,
    phone: `+57 3${Math.floor(100000000 + Math.random() * 900000000)}`,
    company: companies[i % companies.length],
    job_title: ['CEO', 'CTO', 'CMO', 'VP Comercial', 'Director de IT', 'Gerente General', 'Director Marketing'][i % 7],
    city: cities[i % cities.length],
    source: sources[i % sources.length],
    phase: phases[i % phases.length],
    instantly_lead_id: i < 30 ? `il_${i}` : null,
    chatwoot_contact_id: i < 20 ? `cw_${i}` : null,
    tags: [tagOptions[i % tagOptions.length], tagOptions[(i + 3) % tagOptions.length]],
    notes: i % 3 === 0 ? 'Contacto interesado en automatización de email marketing.' : null,
    assigned_to: mockProfiles[i % mockProfiles.length].id,
    custom_fields: {},
    lead_score: Math.floor(Math.random() * 100),
    last_contacted_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
}));

// ============ CAMPAIGNS ============
export const mockCampaigns: EmailCampaign[] = [
    {
        id: 'camp1',
        name: 'Outreach Q1 - Automatización IA',
        instantly_campaign_id: 'inst_001',
        status: 'active',
        sequence_steps: 5,
        total_leads: 500,
        start_date: '2024-12-01',
        created_at: '2024-12-01T00:00:00Z',
    },
    {
        id: 'camp2',
        name: 'Re-engagement - Leads Fríos',
        instantly_campaign_id: 'inst_002',
        status: 'active',
        sequence_steps: 3,
        total_leads: 250,
        start_date: '2025-01-15',
        created_at: '2025-01-15T00:00:00Z',
    },
];

// ============ EMAIL EVENTS ============
const eventTypes = ['sent', 'opened', 'clicked', 'replied', 'bounced'] as const;
export const mockEmailEvents: EmailEvent[] = Array.from({ length: 200 }, (_, i) => ({
    id: `ee${i + 1}`,
    contact_id: mockContacts[i % mockContacts.length].id,
    campaign_id: mockCampaigns[i % mockCampaigns.length].id,
    event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
    email_account: 'outreach@aikon.com',
    subject: `Automatización de ${['ventas', 'marketing', 'soporte', 'RRHH', 'finanzas'][i % 5]} con IA`,
    body_preview: 'Hola, quería compartir cómo podemos ayudarte...',
    sequence_step: (i % 5) + 1,
    variant_used: i % 2 === 0 ? 'A' : 'B',
    raw_payload: null,
    created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
}));

// ============ ACTIVITY LOG ============
const actTypes = ['email_sent', 'email_opened', 'email_replied', 'wa_message_received', 'wa_message_sent', 'phase_changed', 'meeting_scheduled', 'contact_created'] as const;
const actChannels = ['email', 'email', 'email', 'whatsapp', 'whatsapp', 'system', 'system', 'system'] as const;
const actDescriptions = [
    'Email enviado: "Automatización con IA"',
    'Email abierto por el contacto',
    'Contacto respondió al email',
    'Mensaje de WhatsApp recibido',
    'Mensaje de WhatsApp enviado',
    'Fase cambiada a Interesado',
    'Reunión agendada para el viernes',
    'Nuevo contacto creado desde CSV',
];

export const mockActivities: ActivityLog[] = Array.from({ length: 100 }, (_, i) => {
    const typeIdx = i % actTypes.length;
    return {
        id: `act${i + 1}`,
        contact_id: mockContacts[i % mockContacts.length].id,
        channel: actChannels[typeIdx],
        activity_type: actTypes[typeIdx],
        description: actDescriptions[typeIdx],
        metadata: null,
        created_at: new Date(Date.now() - i * 30 * 60 * 1000).toISOString(), // Every 30 min
    };
});

// ============ CALENDAR EVENTS ============
const calEventTypes = ['meeting', 'follow_up', 'call', 'demo', 'task'] as const;
export const mockCalendarEvents: CalendarEvent[] = Array.from({ length: 20 }, (_, i) => {
    const start = new Date();
    start.setDate(start.getDate() + Math.floor(Math.random() * 30) - 5);
    start.setHours(9 + (i % 8), 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);

    return {
        id: `cal${i + 1}`,
        title: [
            'Demo producto IA', 'Follow-up propuesta', 'Llamada de descubrimiento',
            'Reunión de cierre', 'Revisar presupuesto', 'Onboarding cliente',
            'Revisión de métricas', 'Planificación campaña', 'Call técnica',
            'Presentación ejecutiva',
        ][i % 10],
        description: 'Reunión con el equipo del cliente para revisar necesidades.',
        location: i % 2 === 0 ? 'Google Meet' : 'Zoom',
        contact_id: mockContacts[i % mockContacts.length].id,
        assigned_to: mockProfiles[i % mockProfiles.length].id,
        event_type: calEventTypes[i % calEventTypes.length],
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: i < 5 ? 'completed' : 'scheduled',
        color: null,
        created_at: new Date().toISOString(),
    };
});

// ============ DAILY METRICS ============
export const mockDailyMetrics: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return {
        id: `dm${i + 1}`,
        date: d.toISOString().split('T')[0],
        campaign_id: null,
        emails_sent: Math.floor(40 + Math.random() * 60),
        emails_opened: Math.floor(15 + Math.random() * 30),
        emails_replied: Math.floor(2 + Math.random() * 10),
        emails_bounced: Math.floor(Math.random() * 5),
        wa_messages_received: Math.floor(10 + Math.random() * 30),
        wa_messages_sent: Math.floor(5 + Math.random() * 20),
        new_leads: Math.floor(5 + Math.random() * 20),
        leads_interested: Math.floor(1 + Math.random() * 8),
        meetings_booked: Math.floor(Math.random() * 4),
        created_at: d.toISOString(),
    };
});
