import { toast } from 'sonner';

/**
 * Wrapper around fetch that shows toast.error on failure.
 * Returns the parsed JSON on success, or null on failure.
 */
export async function apiFetch<T = unknown>(
    url: string,
    options?: RequestInit & { successMessage?: string }
): Promise<T | null> {
    const { successMessage, ...fetchOptions } = options ?? {};
    try {
        const res = await fetch(url, fetchOptions);
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const message = data?.error || `Error ${res.status}: ${res.statusText}`;
            toast.error(message);
            return null;
        }
        const data = await res.json();
        if (successMessage) toast.success(successMessage);
        return data as T;
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Error de conexión';
        toast.error(message);
        return null;
    }
}
