'use client';

import { Mail, MessageCircle, ArrowRightLeft, UserPlus, CalendarPlus, FileText, Pencil } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import type { ActivityLog } from '@/lib/types/database';
import { mockContacts } from '@/lib/mock-data';

const activityIcons: Record<string, { icon: typeof Mail; color: string; bg: string }> = {
    email_sent: { icon: Mail, color: '#818CF8', bg: '#EEF0FF' },
    email_opened: { icon: Mail, color: '#34D399', bg: '#ECFDF5' },
    email_replied: { icon: Mail, color: '#10B981', bg: '#D1FAE5' },
    email_bounced: { icon: Mail, color: '#F87171', bg: '#FEF2F2' },
    wa_message_sent: { icon: MessageCircle, color: '#34D399', bg: '#ECFDF5' },
    wa_message_received: { icon: MessageCircle, color: '#34D399', bg: '#ECFDF5' },
    phase_changed: { icon: ArrowRightLeft, color: '#A78BFA', bg: '#F5F3FF' },
    note_added: { icon: Pencil, color: '#FBBF24', bg: '#FFFBEB' },
    meeting_scheduled: { icon: CalendarPlus, color: '#F9A8D4', bg: '#FDF2F8' },
    contact_created: { icon: UserPlus, color: '#818CF8', bg: '#EEF0FF' },
    contact_updated: { icon: FileText, color: '#9CA3AF', bg: '#F3F4F6' },
};

interface ActivityFeedProps {
    activities: ActivityLog[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
    return (
        <div className="crm-card p-6">
            <h3 className="text-[15px] font-semibold text-[#1A1A2E] mb-4">
                Actividad Reciente
            </h3>
            <div className="space-y-1">
                {activities.slice(0, 10).map((activity) => {
                    const config = activityIcons[activity.activity_type ?? 'contact_updated'] || activityIcons.contact_updated;
                    const Icon = config.icon;
                    const contact = mockContacts.find((c) => c.id === activity.contact_id);

                    return (
                        <div
                            key={activity.id}
                            className="flex items-start gap-3 py-3 border-b border-[#F3F4F6] last:border-0"
                        >
                            <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: config.bg }}
                            >
                                <Icon size={15} style={{ color: config.color }} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] text-[#1A1A2E] leading-snug">
                                    {activity.description}
                                </p>
                                {contact && (
                                    <p className="text-[12px] text-[#9CA3AF] mt-0.5">
                                        {(contact as unknown as { nombre?: string }).nombre ?? ''}
                                    </p>
                                )}
                            </div>
                            <span className="text-[11px] text-[#9CA3AF] flex-shrink-0 whitespace-nowrap mt-0.5">
                                {formatRelativeTime(activity.created_at)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
