-- ============================================================
-- Bucket for files agents attach in Conversaciones.
-- Public so n8n / the WhatsApp API can download the media by URL.
-- Uploads go through /api/conversations/[id]/attachments (service role),
-- under {tenant_id}/{conversation_id}/{uuid}-{filename}.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', true, 16777216) -- 16 MB, WhatsApp's media limit
ON CONFLICT (id) DO NOTHING;
