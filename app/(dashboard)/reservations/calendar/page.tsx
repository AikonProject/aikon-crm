import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId } from '@/lib/tenant';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { ReservationCalendarClient } from '@/components/reservations/reservation-calendar-client';
import type { Reservation } from '@/lib/types/database';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';

async function getReservations(): Promise<Pick<Reservation, 'id' | 'reservation_date' | 'reservation_time' | 'status' | 'guest_name' | 'party_size'>[]> {
    const supabase = createAdminClient();
    const TENANT_ID = await getServerTenantId();
    const today = new Date();
    const from = format(startOfMonth(today), 'yyyy-MM-dd');
    const to = format(endOfMonth(addMonths(today, 2)), 'yyyy-MM-dd');

    const { data } = await supabase
        .from('reservations')
        .select('id, reservation_date, reservation_time, status, guest_name, party_size')
        .eq('tenant_id', TENANT_ID)
        .gte('reservation_date', from)
        .lte('reservation_date', to)
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true });

    return data ?? [];
}

export default async function ReservationCalendarPage() {
    const reservations = await getReservations();

    return (
        <>
            <Breadcrumb />
            <ReservationCalendarClient reservations={reservations} />
        </>
    );
}
