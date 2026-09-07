import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Phone, Mail as MailIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { FunnelStageBadge } from '@/components/contacts/funnel-stage-badge';
import { ContactDetailTabs } from '@/components/contacts/contact-detail-tabs';
import { EditContactButton } from '@/components/contacts/edit-contact-button';
import { getInitials } from '@/lib/utils/format';
import type { FunnelStage } from '@/lib/types/database';

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------
async function getContactData(id: string) {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [contactRes, conversationsRes, reservationsRes, notesRes, activityRes, stagesRes] =
        await Promise.all([
            (supabase
                .from('contacts')
                .select(
                    `
          id, nombre, email, wa_id, job_title, source, lead_score,
          last_contacted_at, created_at, funnel_stage_id, assigned_to,
          funnel_stage:funnel_stages ( id, name, color, position ),
          contact_tags ( tag:tags ( id, name, color ) ),
          contact_field_values (
            field_key, value
          )
          `
                )
                .eq('id', id)
                .eq('tenant_id', TENANT_ID)
                .single() as unknown) as Promise<{ data: ContactDetail | null; error: unknown }>,

            supabase
                .from('conversations')
                .select('id, channel, status, last_message_at, unread_count, assigned_to, created_at')
                .eq('contact_id', id)
                .eq('tenant_id', TENANT_ID)
                .order('last_message_at', { ascending: false })
                .limit(20),

            supabase
                .from('reservations')
                .select(
                    'id, reservation_date, reservation_time, party_size, status, source, created_at, table:restaurant_tables ( id, name )'
                )
                .eq('contact_id', id)
                .eq('tenant_id', TENANT_ID)
                .order('reservation_date', { ascending: false })
                .limit(50),

            supabase
                .from('contact_notes')
                .select('id, content, created_at, user:users!contact_notes_created_by_fkey ( id, full_name )')
                .eq('contact_id', id)
                .order('created_at', { ascending: false })
                .limit(30),

            supabase
                .from('activity_log')
                .select('id, description, activity_type, created_at')
                .eq('contact_id', id)
                .eq('tenant_id', TENANT_ID)
                .order('created_at', { ascending: false })
                .limit(40),

            supabase
                .from('funnel_stages')
                .select('id, name, color, position')
                .eq('tenant_id', TENANT_ID)
                .order('position', { ascending: true }),
        ]);

    if (contactRes.error || !contactRes.data) return null;

    return {
        contact: contactRes.data as ContactDetail,
        conversations: (conversationsRes.data ?? []) as ConversationRow[],
        reservations: (reservationsRes.data ?? []) as ReservationRow[],
        notes: (notesRes.data ?? []) as NoteRow[],
        activity: (activityRes.data ?? []) as ActivityRow[],
        stages: (stagesRes.data ?? []) as FunnelStage[],
    };
}

// Inline types for joined rows
type ContactDetail = {
    id: string;
    nombre: string;
    email: string | null;
    wa_id: string | null;
    job_title: string | null;
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

export type ConversationRow = {
    id: string;
    channel: string;
    status: string;
    last_message_at: string | null;
    unread_count: number;
    assigned_to: string | null;
    created_at: string;
};

export type ReservationRow = {
    id: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    status: string;
    source: string;
    created_at: string;
    table: { id: string; name: string } | null;
};

export type NoteRow = {
    id: string;
    content: string;
    created_at: string;
    user: { id: string; full_name: string } | null;
};

export type ActivityRow = {
    id: string;
    description: string | null;
    activity_type: string | null;
    created_at: string;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function ContactDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const data = await getContactData(id);

    if (!data) notFound();

    const { contact, conversations, reservations, notes, activity, stages } = data;
    const fullName = contact.nombre;
    const initials = getInitials(fullName);
    const tags = contact.contact_tags
        .map((ct) => ct.tag)
        .filter(Boolean) as { id: string; name: string; color: string | null }[];

    return (
        <>
            <Breadcrumb />

            {/* Back button */}
            <Link
                href="/contacts"
                className="inline-flex items-center gap-1.5 text-[13px] text-[#9CA3AF] hover:text-[#6B7280] mb-4 transition-colors"
            >
                <ArrowLeft size={14} /> Volver a contactos
            </Link>

            {/* Header card */}
            <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm p-6 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                    {/* Avatar */}
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#818CF8] to-[#A78BFA] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xl font-bold">{initials}</span>
                    </div>

                    {/* Name + stage */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                            <h1 className="text-[22px] font-bold text-[#1A1A2E] leading-tight">
                                {fullName}
                            </h1>
                            {contact.funnel_stage && (
                                <FunnelStageBadge
                                    name={contact.funnel_stage.name}
                                    color={contact.funnel_stage.color}
                                />
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                            {contact.wa_id && (
                                <span className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
                                    <Phone size={13} className="text-[#9CA3AF]" />
                                    {contact.wa_id}
                                </span>
                            )}
                            {contact.email && (
                                <span className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
                                    <MailIcon size={13} className="text-[#9CA3AF]" />
                                    {contact.email}
                                </span>
                            )}
                        </div>

                        {/* Tags */}
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {tags.map((tag) => (
                                    <TagPill key={tag.id} name={tag.name} color={tag.color} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {contact.wa_id && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 rounded-[10px] border-[#E8E8EC] text-[#6B7280]"
                            >
                                <Phone size={14} /> Llamar
                            </Button>
                        )}
                        {contact.email && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 rounded-[10px] border-[#E8E8EC] text-[#6B7280]"
                            >
                                <MailIcon size={14} /> Email
                            </Button>
                        )}
                        <EditContactButton
                            contact={{
                                id: contact.id,
                                nombre: contact.nombre,
                                email: contact.email,
                                wa_id: contact.wa_id,
                                job_title: contact.job_title,
                                source: contact.source,
                                funnel_stage_id: contact.funnel_stage_id,
                                lead_score: contact.lead_score,
                            }}
                            stages={stages}
                        />
                    </div>
                </div>
            </div>

            {/* Tab content (client component) */}
            <ContactDetailTabs
                contact={contact}
                conversations={conversations}
                reservations={reservations}
                notes={notes}
                activity={activity}
                stages={stages}
                contactId={id}
            />
        </>
    );
}

// ---------------------------------------------------------------------------
// Tag pill (server-renderable)
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
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{ backgroundColor: `rgba(${r},${g},${b},0.12)`, color: hex }}
        >
            {name}
        </span>
    );
}
