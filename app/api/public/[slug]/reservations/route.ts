import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ReservationStatus, ReservationSource } from '@/lib/types/database';
import { n8nHeaders } from '@/lib/n8n';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const supabase = createAdminClient();

        // Look up tenant + webhook URL in one query
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
            table_id,
            occasion,
            special_requests,
            event_id,
        } = body;

        if (!guest_name || !reservation_date || !reservation_time || !party_size) {
            return NextResponse.json(
                { error: 'guest_name, reservation_date, reservation_time, and party_size son requeridos' },
                { status: 400 }
            );
        }

        const today = new Date().toISOString().split('T')[0];
        if (reservation_date < today) {
            return NextResponse.json({ error: 'La fecha de reserva no puede ser en el pasado' }, { status: 400 });
        }

        const size = Number(party_size);
        if (isNaN(size) || size < 1 || size > 50) {
            return NextResponse.json({ error: 'El número de personas debe estar entre 1 y 50' }, { status: 400 });
        }

        // ── Availability check ────────────────────────────────────────────────
        const [tablesRes, existingRes, credsRes] = await Promise.all([
            supabase
                .from('restaurant_tables')
                .select('capacity')
                .eq('tenant_id', tenant.id)
                .eq('is_active', true),
            supabase
                .from('reservations')
                .select('party_size')
                .eq('tenant_id', tenant.id)
                .eq('reservation_date', reservation_date)
                .eq('reservation_time', reservation_time)
                .not('status', 'in', '(cancelled,no_show,completed)'),
            supabase
                .from('tenant_credentials')
                .select('n8n_reservation_webhook, n8n_webhook_secret')
                .eq('tenant_id', tenant.id)
                .maybeSingle(),
        ]);

        const tables = tablesRes.data;
        const totalCapacity = tables && tables.length > 0
            ? tables.reduce((sum, t) => sum + (t.capacity ?? 0), 0)
            : 50;

        const bookedSeats = existingRes.data
            ? existingRes.data.reduce((sum, r) => sum + (r.party_size ?? 0), 0)
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
                table_id: table_id || null,
                occasion: occasion || null,
                special_requests: special_requests?.trim() || null,
                event_id: event_id || null,
                source: 'web' as ReservationSource,
                status: 'pending' as ReservationStatus,
            })
            .select('id, confirmation_code, reservation_date, reservation_time, party_size, status, guest_name, guest_phone, guest_email')
            .single();

        if (error) throw error;

        // ── Fire webhook synchronously before returning ───────────────────────
        // Using a 4-second AbortSignal so the webhook never blocks the user more than that
        const webhookUrl = credsRes.data?.n8n_reservation_webhook;
        if (webhookUrl) {
            try {
                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: n8nHeaders(credsRes.data?.n8n_webhook_secret),
                    body: JSON.stringify({
                        action: 'reservation_new',
                        tenant_id: tenant.id,
                        reservation_id: data.id,
                        confirmation_code: data.confirmation_code,
                        guest_name: data.guest_name,
                        guest_phone: data.guest_phone ?? null,
                        guest_email: data.guest_email ?? null,
                        wa_id: data.guest_phone ?? null,
                        reservation_date: data.reservation_date,
                        reservation_time: data.reservation_time,
                        party_size: data.party_size,
                        status: data.status,
                    }),
                    signal: AbortSignal.timeout(4000),
                });
            } catch (webhookErr) {
                // Log but never block the response
                console.error('[reservation webhook] failed:', webhookErr);
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── Link contact in the background after response is sent ─────────────
        after(async () => {
            try {
                const phone = guest_phone?.trim() || null;
                const email = guest_email?.trim() || null;
                if (!phone && !email) return;

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

                let contactId: string | null = null;
                if (existingContact) {
                    contactId = existingContact.id;
                } else {
                    const { data: newContact } = await supabase
                        .from('contacts')
                        .insert({
                            tenant_id: tenant.id,
                            nombre: guest_name.trim(),
                            wa_id: phone,
                            email,
                            source: 'web',
                            lead_score: 0,
                        })
                        .select('id')
                        .single();
                    if (newContact) contactId = newContact.id;
                }

                if (contactId) {
                    await supabase
                        .from('reservations')
                        .update({ contact_id: contactId })
                        .eq('id', data.id);
                }
            } catch (err) {
                console.error('[reservation contact linking]', err);
            }
        });
        // ─────────────────────────────────────────────────────────────────────

        return NextResponse.json({ reservation: data }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/public/[slug]/reservations]', err);
        return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 });
    }
}
