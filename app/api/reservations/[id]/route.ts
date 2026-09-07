import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        const allowed = [
            'status', 'guest_name', 'guest_phone', 'guest_email',
            'reservation_date', 'reservation_time', 'party_size',
            'table_id', 'event_id', 'occasion', 'special_requests',
            'internal_notes', 'source', 'contact_id',
            'reminded_at', 'confirmed_at',
        ];

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }

        // Auto-set confirmed_at when status → confirmed
        if (body.status === 'confirmed' && !update.confirmed_at) {
            update.confirmed_at = new Date().toISOString();
        }

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('reservations')
            .update(update)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select()
            .single();

        if (error) throw error;

        // Fire n8n webhook when status → confirmed (fire-and-forget)
        if (body.status === 'confirmed') {
            void (async () => {
                try {
                    const { data: creds } = await supabase
                        .from('tenant_credentials')
                        .select('n8n_send_message_webhook')
                        .eq('tenant_id', TENANT_ID)
                        .single();

                    const webhookUrl = creds?.n8n_send_message_webhook;
                    if (!webhookUrl) return;

                    // Fetch reservation details for the webhook payload
                    // Use unknown cast to avoid Supabase join type resolution issues
                    const { data: rawRes } = await supabase
                        .from('reservations')
                        .select(`
                            guest_name,
                            guest_phone,
                            reservation_date,
                            reservation_time,
                            party_size,
                            contacts ( wa_id )
                        `)
                        .eq('id', id)
                        .single();

                    if (!rawRes) return;

                    type ResRow = {
                        guest_name: string;
                        guest_phone: string | null;
                        reservation_date: string;
                        reservation_time: string;
                        party_size: number;
                        contacts: { wa_id: string | null } | null;
                    };
                    const res = rawRes as unknown as ResRow;

                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'reservation_confirmation',
                            tenant_id: TENANT_ID,
                            reservation_id: id,
                            guest_name: res.guest_name,
                            guest_phone: res.guest_phone ?? null,
                            wa_id: res.contacts?.wa_id ?? null,
                            reservation_date: res.reservation_date,
                            reservation_time: res.reservation_time,
                            party_size: res.party_size,
                        }),
                    });
                } catch (webhookErr) {
                    console.error('[n8n webhook on status=confirmed]', webhookErr);
                }
            })();
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/reservations/[id]]', err);
        return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 });
    }
}
