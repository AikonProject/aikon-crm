import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatRelativeTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return formatDistanceToNow(d, { addSuffix: true, locale: es });
}

export function formatDate(date: string | Date, pattern = 'dd MMM yyyy'): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, pattern, { locale: es });
}

export function formatDateTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, 'dd MMM yyyy, HH:mm', { locale: es });
}

export function formatSmartDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isToday(d)) return `Hoy, ${format(d, 'HH:mm')}`;
    if (isYesterday(d)) return `Ayer, ${format(d, 'HH:mm')}`;
    return format(d, 'dd MMM, HH:mm', { locale: es });
}

export function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString('es-CO');
}

export function formatPercentage(value: number, decimals = 1): string {
    return `${value.toFixed(decimals)}%`;
}

export function getInitials(name: string): string {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}
