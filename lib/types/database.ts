// ============================================================
// Core tenant / user types
// ============================================================

export type SuperAdmin = {
    id: string;
    clerk_user_id: string;
    email: string;
    name: string;
    is_active: boolean;
    created_at: string;
};

export type Tenant = {
    id: string;
    clerk_org_id: string | null;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string | null;
    plan: 'starter' | 'professional' | 'enterprise';
    is_active: boolean;
    max_agents: number | null;
    max_contacts: number | null;
    created_at: string;
    updated_at: string;
};

export type UserRole = 'owner' | 'admin' | 'agent' | 'viewer';

export type User = {
    id: string;
    clerk_user_id: string;
    tenant_id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    phone: string | null;
    role: UserRole;
    is_active: boolean;
    last_seen_at: string | null;
    created_at: string;
    updated_at: string;
};

export type TenantCredentials = {
    id: string;
    tenant_id: string;
    waba_id: string | null;
    phone_number_id: string | null;
    meta_access_token: string | null;
    meta_webhook_verify_token: string | null;
    n8n_base_url: string | null;
    n8n_webhook_secret: string | null;
    n8n_send_message_webhook: string | null;
    n8n_bot_webhook: string | null;
    google_calendar_id: string | null;
    google_service_account_json: string | null;
    created_at: string;
    updated_at: string;
};

// ============================================================
// Funnel / CRM types
// ============================================================

export type FunnelStage = {
    id: string;
    tenant_id: string;
    name: string;
    slug: string | null;
    color: string | null;
    position: number;
    is_won: boolean;
    is_lost: boolean;
    is_default: boolean;
    created_at: string;
    // NO updated_at in schema
};

export type Tag = {
    id: string;
    tenant_id: string;
    name: string;
    color: string | null;
    created_at: string;
};

export type CustomFieldType =
    | 'text'
    | 'number'
    | 'date'
    | 'boolean'
    | 'select'
    | 'url';

export type CustomField = {
    id: string;
    tenant_id: string;
    field_key: string;
    label: string;
    field_type: CustomFieldType;
    options: unknown | null; // jsonb
    is_required: boolean;
    position: number;
    created_at: string;
    // NO updated_at in schema
};

// ============================================================
// Contact types
// ============================================================

export type ContactSource =
    | 'whatsapp'
    | 'web'
    | 'manual'
    | 'csv'
    | 'n8n';

export type Contact = {
    id: string;
    tenant_id: string;
    nombre: string;
    job_title: string | null;
    email: string | null;
    wa_id: string | null;
    avatar_url: string | null;
    funnel_stage_id: string | null;
    assigned_to: string | null; // User.id
    source: ContactSource;
    lead_score: number;
    is_blocked: boolean;
    ai_active: boolean; // When true, the AI bot (n8n) responds; false = agent has manual control
    last_contacted_at: string | null;
    last_incoming_at: string | null;
    created_at: string;
    updated_at: string;
    // Joined fields
    funnel_stage?: FunnelStage | null;
    assigned_user?: User | null;
    tags?: Tag[] | string[];
};

export type ContactFieldValue = {
    contact_id: string;
    tenant_id: string;
    field_key: string;
    value: string | null;
    updated_at: string;
    // Composite PK: contact_id + field_key, NO id column
    // Joined
    custom_field?: CustomField | null;
};

export type ContactTag = {
    // Composite PK: contact_id + tag_id, NO id column
    contact_id: string;
    tag_id: string;
    created_at: string;
    // Joined
    tag?: Tag | null;
};

export type ContactNote = {
    id: string;
    tenant_id: string;
    contact_id: string;
    content: string;
    created_by: string | null; // User.id — was user_id in old schema
    created_at: string;
    // Joined
    user?: User | null;
};

// ============================================================
// Messaging types
// ============================================================

export type MessageTemplate = {
    id: string;
    tenant_id: string;
    name: string;
    language: string;
    category: string | null;
    status: 'APPROVED' | 'PENDING' | 'REJECTED';
    components: unknown | null; // jsonb
    meta_id: string | null;
    created_at: string;
    updated_at: string;
};

export type ConversationStatus = 'open' | 'resolved' | 'pending' | 'snoozed';
export type ConversationChannel = 'whatsapp' | 'web' | 'email';

export type Conversation = {
    id: string;
    tenant_id: string;
    contact_id: string;
    channel: ConversationChannel;
    status: ConversationStatus;
    assigned_to: string | null; // User.id
    last_message: string | null;
    last_message_at: string | null;
    unread_count: number;
    ai_enabled: boolean;
    window_expires_at: string | null;
    created_at: string;
    updated_at: string;
    // Joined
    contact?: Contact | null;
    assigned_user?: User | null;
    messages?: Message[];
};

export type MessageType =
    | 'text'
    | 'image'
    | 'audio'
    | 'video'
    | 'document'
    | 'template'
    | 'note'
    | 'sticker'
    | 'location'
    | 'reaction';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type SenderType = 'contact' | 'bot' | 'human';

export type Message = {
    id: string;
    tenant_id: string;
    conversation_id: string;
    contact_id: string;
    direction: MessageDirection;
    message_type: MessageType;
    content: string | null;
    media_url: string | null;
    media_mime_type: string | null;
    media_filename: string | null;
    template_name: string | null;
    template_vars: unknown | null; // jsonb
    wa_message_id: string | null;
    status: MessageStatus;
    delivery_status: DeliveryStatus | null; // WhatsApp delivery receipt, updated by n8n
    sender_type: SenderType; // contact = customer, bot = n8n AI, human = CRM agent
    is_note: boolean;
    sent_by: string | null; // User.id for outbound
    sent_by_name: string | null;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
};

export type CannedResponse = {
    id: string;
    tenant_id: string;
    title: string;
    content: string;
    shortcut: string | null;
    created_by: string | null; // User.id
    created_at: string;
    updated_at: string;
};

// ============================================================
// n8n / AI types
// ============================================================

export type N8nChatHistory = {
    id: string;
    session_id: string;
    message: unknown; // jsonb
    time_stamp: string;
};

// ============================================================
// Campaign types
// ============================================================

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'completed' | 'cancelled';

export type Campaign = {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    template_id: string | null; // → message_templates
    template_name: string | null;
    template_variables: unknown | null; // jsonb
    segment_filters: unknown | null; // jsonb
    total_contacts: number;
    status: CampaignStatus;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    sent_count: number;
    delivered_count: number;
    read_count: number;
    replied_count: number;
    failed_count: number;
    created_by: string | null; // User.id
    created_at: string;
    updated_at: string;
    // Joined
    template?: MessageTemplate | null;
};

export type CampaignMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed';

export type CampaignMessage = {
    id: string;
    tenant_id: string;
    campaign_id: string;
    contact_id: string;
    status: CampaignMessageStatus;
    wa_message_id: string | null;
    error_code: string | null;
    error_message: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    read_at: string | null;
    replied_at: string | null;
    created_at: string;
    // Joined
    contact?: Contact | null;
};

// ============================================================
// AI actions types
// ============================================================

export type AiAction = {
    id: string;
    tenant_id: string;
    conversation_id: string | null;
    contact_id: string | null;
    action_type: string;
    tool_name: string | null;
    status: 'pending' | 'completed' | 'failed';
    summary: string | null;
    details: unknown | null; // jsonb
    reasoning: string | null;
    stage_before: string | null;
    stage_after: string | null;
    data_captured: unknown | null; // jsonb
    created_at: string;
};

// ============================================================
// Activity log
// ============================================================

export type ActivityLog = {
    id: string;
    tenant_id: string;
    contact_id: string | null;
    activity_type: string;
    channel: 'whatsapp' | 'email' | 'system' | 'manual' | 'n8n' | null;
    description: string | null;
    metadata: unknown | null; // jsonb
    performed_by: string | null; // User.id
    performed_by_name: string | null;
    created_at: string;
    // Joined
    contact?: Contact | null;
    user?: User | null;
};

// ============================================================
// Appointment types
// ============================================================

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export type Appointment = {
    id: string;
    tenant_id: string;
    contact_id: string | null;
    assigned_to: string | null; // User.id
    title: string;
    description: string | null;
    location: string | null;
    start_time: string;
    end_time: string;
    timezone: string | null;
    status: AppointmentStatus;
    google_event_id: string | null;
    google_calendar_id: string | null;
    google_meet_link: string | null;
    created_by: string | null;
    reminder_sent: boolean;
    created_at: string;
    updated_at: string;
    // Joined
    contact?: Contact | null;
    assigned_user?: User | null;
};

// ============================================================
// Service / Deal types
// ============================================================

export type Service = {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string | null;
    duration_minutes: number | null;
    is_active: boolean;
    position: number;
    created_at: string;
    updated_at: string;
};

export type DealStatus = 'pending' | 'paid' | 'completed' | 'cancelled';

export type Deal = {
    id: string;
    tenant_id: string;
    contact_id: string;
    service_id: string | null;
    name: string;
    description: string | null;
    price: number | null;
    currency: string | null;
    quantity: number;
    status: DealStatus;
    sold_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    // Joined
    contact?: Contact | null;
    service?: Service | null;
};

// ============================================================
// Restaurant-specific types
// ============================================================

export type RestaurantTable = {
    id: string;
    tenant_id: string;
    name: string;
    capacity: number;
    location: string | null;
    is_active: boolean;
    position: number;
    created_at: string;
    updated_at: string;
};

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type RestaurantSchedule = {
    id: string;
    tenant_id: string;
    day_of_week: DayOfWeek;
    shift_name: string | null;
    open_time: string; // time HH:MM
    close_time: string; // time HH:MM
    max_capacity: number | null;
    slot_duration_minutes: number | null;
    is_active: boolean;
    created_at: string;
    // NO updated_at in schema
};

export type RestaurantEventType = 'event' | 'celebration' | 'special_menu' | 'holiday' | 'private';

export type RestaurantEvent = {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    event_date: string; // date YYYY-MM-DD
    start_time: string | null; // time HH:MM
    end_time: string | null; // time HH:MM
    price: number | null;
    currency: string | null;
    max_guests: number | null;
    image_url: string | null;
    is_active: boolean;
    event_type: RestaurantEventType | null;
    created_at: string;
    updated_at: string;
};

export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
export type ReservationSource = 'manual' | 'whatsapp' | 'web' | 'phone' | 'n8n';

export type Reservation = {
    id: string;
    tenant_id: string;
    contact_id: string | null;
    table_id: string | null; // → restaurant_tables
    event_id: string | null; // → restaurant_events
    assigned_to: string | null; // → users
    guest_name: string;
    guest_phone: string | null;
    guest_email: string | null;
    reservation_date: string; // YYYY-MM-DD
    reservation_time: string; // HH:MM
    party_size: number;
    duration_minutes: number | null;
    status: ReservationStatus;
    special_requests: string | null;
    occasion: string | null;
    internal_notes: string | null;
    confirmation_code: string | null;
    source: ReservationSource;
    reminder_sent: boolean;
    created_at: string;
    updated_at: string;
    // Joined
    contact?: Contact | null;
    table?: RestaurantTable | null;
    event?: RestaurantEvent | null;
};

export type RestaurantMenu = {
    id: string;
    tenant_id: string;
    name: string;
    menu_url: string | null;
    is_active: boolean;
    is_default: boolean;
    created_at: string;
    updated_at: string;
};

// ============================================================
// Insert / Update helper types
// ============================================================

// Remove joined/computed fields so Insert/Update only contain DB columns
type WithoutJoins<T> = Omit<T,
    | 'funnel_stage' | 'assigned_user' | 'tags' | 'contact' | 'user' | 'messages'
    | 'template' | 'service' | 'table' | 'event' | 'custom_field'
>;

// ============================================================
// Supabase Database type — maps table names to Row/Insert/Update
// Each table entry MUST include `Relationships` to satisfy GenericTable.
// ============================================================

export type Database = {
    public: {
        Tables: {
            super_admins: {
                Row: SuperAdmin;
                Insert: Partial<WithoutJoins<SuperAdmin>> & Pick<SuperAdmin, 'email' | 'name'>;
                Update: Partial<WithoutJoins<SuperAdmin>>;
                Relationships: never[];
            };
            tenants: {
                Row: Tenant;
                Insert: Partial<WithoutJoins<Tenant>> & Pick<Tenant, 'name' | 'slug'>;
                Update: Partial<WithoutJoins<Tenant>>;
                Relationships: never[];
            };
            users: {
                Row: User;
                Insert: Partial<WithoutJoins<User>> & Pick<User, 'clerk_user_id' | 'tenant_id' | 'full_name' | 'email' | 'role'>;
                Update: Partial<WithoutJoins<User>>;
                Relationships: never[];
            };
            tenant_credentials: {
                Row: TenantCredentials;
                Insert: Partial<WithoutJoins<TenantCredentials>> & Pick<TenantCredentials, 'tenant_id'>;
                Update: Partial<WithoutJoins<TenantCredentials>>;
                Relationships: never[];
            };
            funnel_stages: {
                Row: FunnelStage;
                Insert: Partial<WithoutJoins<FunnelStage>> & Pick<FunnelStage, 'tenant_id' | 'name'>;
                Update: Partial<WithoutJoins<FunnelStage>>;
                Relationships: never[];
            };
            tags: {
                Row: Tag;
                Insert: Partial<WithoutJoins<Tag>> & Pick<Tag, 'tenant_id' | 'name'>;
                Update: Partial<WithoutJoins<Tag>>;
                Relationships: never[];
            };
            custom_fields: {
                Row: CustomField;
                Insert: Partial<WithoutJoins<CustomField>> & Pick<CustomField, 'tenant_id' | 'field_key' | 'label' | 'field_type'>;
                Update: Partial<WithoutJoins<CustomField>>;
                Relationships: never[];
            };
            contacts: {
                Row: Contact;
                Insert: Partial<WithoutJoins<Contact>> & Pick<Contact, 'tenant_id' | 'nombre'>;
                Update: Partial<WithoutJoins<Contact>>;
                Relationships: never[];
            };
            contact_field_values: {
                Row: ContactFieldValue;
                Insert: Partial<WithoutJoins<ContactFieldValue>> & Pick<ContactFieldValue, 'contact_id' | 'tenant_id' | 'field_key'>;
                Update: Partial<WithoutJoins<ContactFieldValue>>;
                Relationships: never[];
            };
            contact_tags: {
                Row: ContactTag;
                Insert: Partial<WithoutJoins<ContactTag>> & Pick<ContactTag, 'contact_id' | 'tag_id'>;
                Update: Partial<WithoutJoins<ContactTag>>;
                Relationships: never[];
            };
            contact_notes: {
                Row: ContactNote;
                Insert: Partial<WithoutJoins<ContactNote>> & Pick<ContactNote, 'tenant_id' | 'contact_id' | 'content'>;
                Update: Partial<WithoutJoins<ContactNote>>;
                Relationships: never[];
            };
            message_templates: {
                Row: MessageTemplate;
                Insert: Partial<WithoutJoins<MessageTemplate>> & Pick<MessageTemplate, 'tenant_id' | 'name' | 'language'>;
                Update: Partial<WithoutJoins<MessageTemplate>>;
                Relationships: never[];
            };
            conversations: {
                Row: Conversation;
                Insert: Partial<WithoutJoins<Conversation>> & Pick<Conversation, 'tenant_id' | 'contact_id' | 'channel'>;
                Update: Partial<WithoutJoins<Conversation>>;
                Relationships: never[];
            };
            messages: {
                Row: Message;
                Insert: Partial<WithoutJoins<Message>> & Pick<Message, 'tenant_id' | 'conversation_id' | 'contact_id' | 'direction' | 'message_type'>;
                Update: Partial<WithoutJoins<Message>>;
                Relationships: never[];
            };
            canned_responses: {
                Row: CannedResponse;
                Insert: Partial<WithoutJoins<CannedResponse>> & Pick<CannedResponse, 'tenant_id' | 'title' | 'content'>;
                Update: Partial<WithoutJoins<CannedResponse>>;
                Relationships: never[];
            };
            n8n_chat_histories: {
                Row: N8nChatHistory;
                Insert: Partial<WithoutJoins<N8nChatHistory>> & Pick<N8nChatHistory, 'session_id' | 'message'>;
                Update: Partial<WithoutJoins<N8nChatHistory>>;
                Relationships: never[];
            };
            campaigns: {
                Row: Campaign;
                Insert: Partial<WithoutJoins<Campaign>> & Pick<Campaign, 'tenant_id' | 'name'>;
                Update: Partial<WithoutJoins<Campaign>>;
                Relationships: never[];
            };
            campaign_messages: {
                Row: CampaignMessage;
                Insert: Partial<WithoutJoins<CampaignMessage>> & Pick<CampaignMessage, 'tenant_id' | 'campaign_id' | 'contact_id'>;
                Update: Partial<WithoutJoins<CampaignMessage>>;
                Relationships: never[];
            };
            ai_actions: {
                Row: AiAction;
                Insert: Partial<WithoutJoins<AiAction>> & Pick<AiAction, 'tenant_id' | 'action_type'>;
                Update: Partial<WithoutJoins<AiAction>>;
                Relationships: never[];
            };
            activity_log: {
                Row: ActivityLog;
                Insert: Partial<WithoutJoins<ActivityLog>> & Pick<ActivityLog, 'tenant_id' | 'activity_type'>;
                Update: Partial<WithoutJoins<ActivityLog>>;
                Relationships: never[];
            };
            appointments: {
                Row: Appointment;
                Insert: Partial<WithoutJoins<Appointment>> & Pick<Appointment, 'tenant_id' | 'title' | 'start_time' | 'end_time'>;
                Update: Partial<WithoutJoins<Appointment>>;
                Relationships: never[];
            };
            services: {
                Row: Service;
                Insert: Partial<WithoutJoins<Service>> & Pick<Service, 'tenant_id' | 'name'>;
                Update: Partial<WithoutJoins<Service>>;
                Relationships: never[];
            };
            deals: {
                Row: Deal;
                Insert: Partial<WithoutJoins<Deal>> & Pick<Deal, 'tenant_id' | 'contact_id' | 'name'>;
                Update: Partial<WithoutJoins<Deal>>;
                Relationships: never[];
            };
            restaurant_tables: {
                Row: RestaurantTable;
                Insert: Partial<WithoutJoins<RestaurantTable>> & Pick<RestaurantTable, 'tenant_id' | 'name'>;
                Update: Partial<WithoutJoins<RestaurantTable>>;
                Relationships: never[];
            };
            restaurant_schedules: {
                Row: RestaurantSchedule;
                Insert: Partial<WithoutJoins<RestaurantSchedule>> & Pick<RestaurantSchedule, 'tenant_id' | 'day_of_week'>;
                Update: Partial<WithoutJoins<RestaurantSchedule>>;
                Relationships: never[];
            };
            restaurant_events: {
                Row: RestaurantEvent;
                Insert: Partial<WithoutJoins<RestaurantEvent>> & Pick<RestaurantEvent, 'tenant_id' | 'name' | 'event_date'>;
                Update: Partial<WithoutJoins<RestaurantEvent>>;
                Relationships: never[];
            };
            reservations: {
                Row: Reservation;
                Insert: Partial<WithoutJoins<Reservation>> & Pick<Reservation, 'tenant_id' | 'guest_name' | 'reservation_date' | 'reservation_time' | 'party_size'>;
                Update: Partial<WithoutJoins<Reservation>>;
                Relationships: never[];
            };
            restaurant_menus: {
                Row: RestaurantMenu;
                Insert: Partial<WithoutJoins<RestaurantMenu>> & Pick<RestaurantMenu, 'tenant_id' | 'name'>;
                Update: Partial<WithoutJoins<RestaurantMenu>>;
                Relationships: never[];
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
    };
};

// ============================================================
// Legacy / deprecated type aliases — kept for mock-data.ts compatibility.
// Do NOT use in new code.
// ============================================================

/** @deprecated Use User instead */
export type Profile = {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    role: 'admin' | 'manager' | 'agent';
    created_at: string;
    updated_at: string;
};

/** @deprecated Use FunnelStage.name instead */
export type ContactPhase =
    | 'nuevo'
    | 'contactado'
    | 'interesado'
    | 'en_negociacion'
    | 'reunion_agendada'
    | 'propuesta_enviada'
    | 'cerrado_ganado'
    | 'cerrado_perdido';

/** @deprecated Use Campaign instead */
export type EmailCampaign = {
    id: string;
    name: string;
    instantly_campaign_id: string | null;
    status: 'draft' | 'active' | 'paused' | 'completed';
    sequence_steps: number;
    total_leads: number;
    start_date: string | null;
    created_at: string;
};

/** @deprecated */
export type EmailEventType =
    | 'sent'
    | 'opened'
    | 'clicked'
    | 'replied'
    | 'bounced'
    | 'unsubscribed';

/** @deprecated Use Message instead */
export type EmailEvent = {
    id: string;
    contact_id: string;
    campaign_id: string;
    event_type: EmailEventType;
    email_account: string | null;
    subject: string | null;
    body_preview: string | null;
    sequence_step: number | null;
    variant_used: string | null;
    raw_payload: Record<string, unknown> | null;
    created_at: string;
};

/** @deprecated Use Appointment instead */
export type CalendarEventType = 'meeting' | 'follow_up' | 'call' | 'demo' | 'task';

/** @deprecated Use Appointment instead */
export type CalendarEvent = {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    contact_id: string | null;
    assigned_to: string | null;
    event_type: CalendarEventType;
    start_time: string;
    end_time: string;
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
    color: string | null;
    created_at: string;
};

/** @deprecated */
export type DailyMetrics = {
    id: string;
    date: string;
    campaign_id: string | null;
    emails_sent: number;
    emails_opened: number;
    emails_replied: number;
    emails_bounced: number;
    wa_messages_received: number;
    wa_messages_sent: number;
    new_leads: number;
    leads_interested: number;
    meetings_booked: number;
    created_at: string;
};

/** @deprecated Use CampaignMessageStatus instead */
export type CampaignChannel = 'whatsapp' | 'email' | 'sms';

/** @deprecated Use AiAction instead */
export type AiActionTrigger = 'inbound_message' | 'contact_created' | 'stage_changed' | 'scheduled' | 'manual';
export type AiActionStatus = 'active' | 'inactive';
