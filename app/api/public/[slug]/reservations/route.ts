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
            .select('id, confirmation_code, reservation_date, reservation_time, party_size, status')
            .single();

        if (error) throw error;

        // Link reservation to a CRM contact (best-effort — never fails the reservation)
        try {
            const phone = guest_phone?.trim() || null;
            const email = guest_email?.trim() || null;

            if (phone || email) {
                let contactId: string | null = null;

                // Build OR filter for existing contact lookup
                const orParts: string[] = [];
                if (phone) orParts.push(`wa_id.eq.${phone}`);
                if (email) orParts.push(`email.eq.${email}`);

                const { data: existingContact } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('tenant_id', tenant.id)
                    .or(orParts.join(','))
                    .limit(1)
                    .maybeSingle();

                if (existingContact) {
                    contactId = existingContact.id;
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
            }
        } catch (contactErr) {
            console.error('[POST /api/public/[slug]/reservations] contact linking failed', contactErr);
        }

        return NextResponse.json({ reservation: data }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/public/[slug]/reservations]', err);
        return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 });
    }
}
