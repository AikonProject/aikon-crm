import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Reserva tu mesa',
    description: 'Haz una reserva en línea de forma rápida y sencilla',
};

export default function PublicBookingLayout({ children }: { children: React.ReactNode }) {
    return children;
}
