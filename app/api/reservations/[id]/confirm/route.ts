import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import { n8nHeaders } from '@/lib/n8n';

type ReservationRow = {
    id: string;
    guest_name: string;
    guest_phone: string | null;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    contact_id: string | null;
    contacts: { wa_id: string | null } | null;
};

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('reservations');

        // 1. Fetch reservation with contact — cast to avoid generated-type join mismatch
        const { data: rawReservation, error: resError } = await supabase
            .from('reservations')
            .select(`
                id,
                guest_name,
                guest_phone,
                reservation_date,
                reservation_time,
                party_size,
                contact_id,
                contacts ( wa_id )
            `)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .single();

        if (resError || !rawReservation) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
        }

        const reservation = rawReservation as unknown as ReservationRow;

        // 2. Fetch tenant credentials for n8n webhook
        const { data: creds } = await supabase
            .from('tenant_credentials')
            .select('n8n_send_message_webhook, n8n_webhook_secret')
            .eq('tenant_id', TENANT_ID)
            .single();

        const webhookUrl = creds?.n8n_send_message_webhook;

        if (!webhookUrl) {
            return NextResponse.json({ success: true, sent: false, reason: 'No webhook configured' });
        }

        // 3. Extract wa_id from joined contact
        const waId = reservation.contacts?.wa_id ?? null;

        // 4. Fire webhook
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: n8nHeaders(creds?.n8n_webhook_secret),
                body: JSON.stringify({
                    action: 'reservation_confirmation',
                    tenant_id: TENANT_ID,
                    reservation_id: id,
                    contact_id: reservation.contact_id ?? null,
                    guest_name: reservation.guest_name,
                    guest_phone: reservation.guest_phone ?? null,
                    wa_id: waId,
                    reservation_date: reservation.reservation_date,
                    reservation_time: reservation.reservation_time,
                    party_size: reservation.party_size,
                }),
            });
        } catch (webhookErr) {
            if (webhookErr instanceof TenantError) return NextResponse.json({ error: webhookErr.message }, { status: webhookErr.status });
            console.error('[confirm webhook]', webhookErr);
            return NextResponse.json({ success: false, sent: false, error: 'Webhook delivery failed' }, { status: 502 });
        }

        return NextResponse.json({ success: true, sent: true });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[POST /api/reservations/[id]/confirm]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
