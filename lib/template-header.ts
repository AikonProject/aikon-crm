type HeaderComp = { type?: string; format?: string; example?: { header_url?: string[]; header_handle?: string[] } };

export const MEDIA_HEADER_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT'];

/**
 * Media header of a template and the file used to SEND it.
 * Only a file uploaded in the CRM (example.header_url) works for sending: templates
 * synced from Meta carry an internal scontent.whatsapp.net link (header_handle)
 * that expires, so WhatsApp can't download it when the message goes out.
 */
export function templateMediaHeader(components: unknown): { format: string; sendUrl: string | null; metaUrl: string | null } | null {
    const h = (Array.isArray(components) ? (components as HeaderComp[]) : [])
        .find((c) => String(c.type).toUpperCase() === 'HEADER');
    const format = String(h?.format ?? '').toUpperCase();
    if (!h || !MEDIA_HEADER_FORMATS.includes(format)) return null;
    return { format, sendUrl: h.example?.header_url?.[0] ?? null, metaUrl: h.example?.header_handle?.[0] ?? null };
}

export const MISSING_HEADER_FILE = (name: string) =>
    `La plantilla "${name}" lleva imagen, video o PDF y todavía no tiene archivo para enviar. Súbelo en Plantillas → ${name} → "Archivo para enviar".`;
