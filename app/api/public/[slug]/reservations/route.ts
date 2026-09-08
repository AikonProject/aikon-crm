import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ReservationStatus, ReservationSource } from '@/lib/types/database';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const supabase = createAdminClient();

        // Look up tenant by slug
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, is_active')
            .eq('slug', slug)
            .eq('is_active', true)
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const body = await request.json();
        const {
            guest_name,
            guest_phone,
            guest_email,
            reservation_date,
            reservation_time,
            party_size,
            occasion,
            special_requests,
            event_id,
        } = body;

        if (!guest_name || !reservation_date || !reservation_time || !party_size) {
            return NextResponse.json(
                { error: 'guest_name, reservation_date, reservation_time, and party_size are required' },
                { status: 400 }
            );
        }

        // Validate date is not in the past
        const today = new Date().toISOString().split('T')[0];
        if (reservation_date < today) {
            return NextResponse.json({ error: 'Reservation date cannot be in the past' }, { status: 400 });
        }

        // Validate party_size
        const size = Number(party_size);
        if (isNaN(size) || size < 1 || size > 50) {
            return NextResponse.json({ error: 'party_size must be between 1 and 50' }, { status: 400 });
        }

        // ── Availability check ────────────────────────────────────────────────
        // 1. Get total table capacity for the restaurant
        const { data: tables } = await supabase
            .from('restaurant_tables')
            .select('capacity')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true);

        const totalCapacity = tables && tables.length > 0
            ? tables.reduce((sum, t) => sum + (t.capacity ?? 0), 0)
            : 50; // fallback: 50 guests if no tables configured

        // 2. Sum party_size already booked for the same date + time slot
        const { data: existing } = await supabase
            .from('reservations')
            .select('party_size')
            .eq('tenant_id', tenant.id)
            .eq('reservation_date', reservation_date)
            .eq('reservation_time', reservation_time)
            .not('status', 'in', '("cancelled","no_show","completed")');

        const bookedSeats = existing
            ? existing.reduce((sum, r) => sum + (r.party_size ?? 0), 0)
            : 0;

        if (bookedSeats + size > totalCapacity) {
            const available = Math.max(0, totalCapacity - bookedSeats);
            return NextResponse.json(
                {
                    error: available > 0
                        ? `Solo quedan ${available} lugares disponibles para este horario`
                        : 'No hay disponibilidad para este horario. Por favor elige otro horario o fecha.',
                },
                { status: 409 }
            );
        }
        // ─────────────────────────────────────────────────────────────────────

        const { data, error } = await supabase
            .from('reservations')
            .insert({
                tenant_id: tenant.id,
                guest_name: guest_name.trim(),
                guest_phone: guest_phone?.trim() || null,
                guest_email: guest_email?.trim() || null,
                reservation_date,
                reservation_time,
                party_size: size,
                occasion: occasion || null,
                special_requests: special_requests?.trim() || null,
                event_id: event_id || null,
                source: 'web' as ReservationSource,
                status: 'pending' as ReservationStatus,
            })
            .select('id, confirmation_code, reservation_date, reservation_time, party_size, status, guest_name, guest_phone')
            .single();

        if (error) throw error;

        // Link reservation to a CRM contact (best-effort — never fails the reservation)
        let waId: string | null = null;
        try {
            const phone = guest_phone?.trim() || null;
            const email = guest_email?.trim() || null;

            if (phone || email) {
                let contactId: string | null = null;

                const orParts: string[] = [];
                if (phone) orParts.push(`wa_id.eq.${phone}`);
                if (email) orParts.push(`email.eq.${email}`);

                const { data: existingContact } = await supabase
                    .from('contacts')
                    .select('id, wa_id')
                    .eq('tenant_id', tenant.id)
                    .or(orParts.join(','))
                    .limit(1)
                    .maybeSingle();

                if (existingContact) {
                    contactId = existingContact.id;
                    waId = existingContact.wa_id;
                } else {
                    const { data: newContact } = await supabase
                        .from('contacts')
                        .insert({
                            tenant_id: tenant.id,
                            nombre: guest_name.trim(),
                            wa_id: phone,
                            email: email,
                            source: 'web',
                            lead_score: 0,
                        })
                        .select('id, wa_id')
                        .single();

                    if (newContact) {
                        contactId = newContact.id;
                        waId = newContact.wa_id;
                    }
                }

                if (contactId) {
                    await supabase
                        .from('reservations')
                        .update({ contact_id: contactId })
                        .eq('id', data.id);
                }
            }
        } catch (contactErr) {
            console.error('[POST /api/public/[slug]/reservations] contact linking failed', contactErr);
        }

        // ── Fire reservation webhook (fire-and-forget) ────────────────────────
        void (async () => {
            try {
                const { data: creds } = await supabase
                    .from('tenant_credentials')
                    .select('n8n_reservation_webhook')
                    .eq('tenant_id', tenant.id)
                    .maybeSingle();

                const webhookUrl = creds?.n8n_reservation_webhook;
                if (!webhookUrl) return;

                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'reservation_new',
                        tenant_id: tenant.id,
                        reservation_id: data.id,
                        confirmation_code: data.confirmation_code,
                        guest_name: data.guest_name,
                        guest_phone: data.guest_phone ?? null,
                        wa_id: waId ?? data.guest_phone ?? null,
                        reservation_date: data.reservation_date,
                        reservation_time: data.reservation_time,
                        party_size: data.party_size,
                        status: data.status,
                    }),
                });
            } catch (webhookErr) {
                console.error('[reservation webhook on new booking]', webhookErr);
            }
        })();
        // ─────────────────────────────────────────────────────────────────────

        return NextResponse.json({ reservation: data }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/public/[slug]/reservations]', err);
        return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 });
    }
}
