import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import type { ReservationStatus } from '@/lib/types/database';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const status = searchParams.get('status');
        const tableId = searchParams.get('table_id');

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        let query = supabase
            .from('reservations')
            .select(
                `*,
                 contact:contacts ( id, nombre, wa_id ),
                 table:restaurant_tables ( id, name, capacity ),
                 event:restaurant_events ( id, name )`
            )
            .eq('tenant_id', TENANT_ID)
            .order('reservation_date', { ascending: true })
            .order('reservation_time', { ascending: true });

        if (date) query = query.eq('reservation_date', date);
        if (status) query = query.eq('status', status as ReservationStatus);
        if (tableId) query = query.eq('table_id', tableId);

        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (err) {
        console.error('[GET /api/reservations]', err);
        return NextResponse.json({ error: 'Failed to fetch reservations' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            guest_name,
            guest_phone,
            guest_email,
            reservation_date,
            reservation_time,
            party_size,
            table_id,
            event_id,
            occasion,
            special_requests,
            internal_notes,
            source,
            contact_id,
        } = body;

        if (!guest_name || !reservation_date || !reservation_time || !party_size) {
            return NextResponse.json(
                { error: 'guest_name, reservation_date, reservation_time, and party_size are required' },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
        const { data, error } = await supabase
            .from('reservations')
            .insert({
                tenant_id: TENANT_ID,
                guest_name,
                guest_phone: guest_phone || null,
                guest_email: guest_email || null,
                reservation_date,
                reservation_time,
                party_size: Number(party_size),
                table_id: table_id || null,
                event_id: event_id || null,
                occasion: occasion || null,
                special_requests: special_requests || null,
                internal_notes: internal_notes || null,
                source: source || 'manual',
                status: 'pending' as ReservationStatus,
                contact_id: contact_id || null,
            })
            .select()
            .single();

        if (error) throw error;

        // Fire reservation webhook (non-fatal)
        try {
            const { data: creds } = await supabase
                .from('tenant_credentials')
                .select('n8n_reservation_webhook')
                .eq('tenant_id', TENANT_ID)
                .maybeSingle();

            const webhookUrl = creds?.n8n_reservation_webhook ?? undefined;
            if (webhookUrl) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const row = data as any;
                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(4000),
                    body: JSON.stringify({
                        action: 'reservation_new',
                        tenant_id: TENANT_ID,
                        reservation_id: row.id,
                        confirmation_code: row.confirmation_code ?? null,
                        guest_name: guest_name,
                        guest_phone: guest_phone || null,
                        guest_email: guest_email || null,
                        wa_id: guest_phone || null,
                        reservation_date,
                        reservation_time,
                        party_size: Number(party_size),
                        status: 'pending',
                        source: 'crm',
                    }),
                });
            }
        } catch (webhookErr) {
            console.warn('[POST /api/reservations] webhook failed (non-fatal):', webhookErr);
        }

        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        console.error('[POST /api/reservations]', err);
        return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 });
    }
}
