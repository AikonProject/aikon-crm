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
        ];

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
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

        // ── Fire n8n webhook on status change ─────────────────────────────────
        const newStatus = body.status;
        if (newStatus === 'confirmed' || newStatus === 'cancelled') {
            void (async () => {
                try {
                    const { data: creds } = await supabase
                        .from('tenant_credentials')
                        .select('n8n_reservation_webhook')
                        .eq('tenant_id', TENANT_ID)
                        .maybeSingle();

                    const webhookUrl = creds?.n8n_reservation_webhook;
                    if (!webhookUrl) return;

                    // Get reservation + contact wa_id for the payload
                    const { data: rawRes } = await supabase
                        .from('reservations')
                        .select(`
                            guest_name,
                            guest_phone,
                            confirmation_code,
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
                        confirmation_code: string | null;
                        reservation_date: string;
                        reservation_time: string;
                        party_size: number;
                        contacts: { wa_id: string | null } | null;
                    };
                    const res = rawRes as unknown as ResRow;

                    const action = newStatus === 'confirmed'
                        ? 'reservation_confirmation'
                        : 'reservation_cancellation';

                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action,
                            tenant_id: TENANT_ID,
                            reservation_id: id,
                            confirmation_code: res.confirmation_code ?? null,
                            guest_name: res.guest_name,
                            guest_phone: res.guest_phone ?? null,
                            wa_id: res.contacts?.wa_id ?? res.guest_phone ?? null,
                            reservation_date: res.reservation_date,
                            reservation_time: res.reservation_time,
                            party_size: res.party_size,
                        }),
                    });
                } catch (webhookErr) {
                    console.error(`[n8n webhook on status=${newStatus}]`, webhookErr);
                }
            })();
        }
        // ─────────────────────────────────────────────────────────────────────

        return NextResponse.json(data);
    } catch (err) {
        console.error('[PATCH /api/reservations/[id]]', err);
        return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 });
    }
}
