/**
 * Media messages arrive from n8n with a label on the first line, e.g.
 *   [Nota de voz del cliente (transcripción automática)]
 *   Hola, quería saber si tienen envíos a Medellín
 * The label tells the AI what kind of content it is; the CRM shows it small.
 */
export function splitLabeledContent(content: string | null | undefined): { label: string | null; body: string } {
    const text = (content ?? '').trim();
    const m = text.match(/^\[([^\]\n]{2,120})\]\s*(?:\n|$)/);
    if (!m) return { label: null, body: text };
    return { label: m[1].trim(), body: text.slice(m[0].length).trim() };
}

const TYPE_PREVIEW: Record<string, string> = {
    image: '📷 Imagen',
    video: '🎥 Video',
    audio: '🎤 Nota de voz',
    document: '📄 Documento',
    sticker: '💟 Sticker',
    location: '📍 Ubicación',
    template: '📋 Plantilla',
};

/** One-line preview for notifications and lists. */
export function messagePreview(contentType: string | null | undefined, content: string | null | undefined, max = 120): string {
    const { body } = splitLabeledContent(content);
    const prefix = contentType && TYPE_PREVIEW[contentType] && contentType !== 'template' ? TYPE_PREVIEW[contentType] : '';
    const text = body.replace(/\s+/g, ' ').trim();
    const out = prefix && text ? `${prefix}: ${text}` : prefix || text || 'Nuevo mensaje';
    return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
