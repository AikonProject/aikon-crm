/**
 * Headers for every CRM → n8n call. n8n should reject requests whose
 * x-webhook-secret doesn't match the tenant's n8n_webhook_secret.
 */
export function n8nHeaders(secret: string | null | undefined): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-webhook-secret': secret } : {}),
    };
}
