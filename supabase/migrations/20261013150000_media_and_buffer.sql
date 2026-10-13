-- Buffer de mensajes para la IA, archivos multimedia con retención y limpieza del buffer viejo.

-- 1. Buffer: el bot reclama los mensajes entrantes que aún no respondió (acción claim_pending).
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ai_handled_at timestamptz;
-- El historial existente ya fue atendido
UPDATE public.messages SET ai_handled_at = created_at WHERE direction = 'inbound' AND ai_handled_at IS NULL;
CREATE INDEX IF NOT EXISTS messages_ai_pending_idx
  ON public.messages (conversation_id, created_at)
  WHERE direction = 'inbound' AND ai_handled_at IS NULL;

-- 2. Archivos: la limpieza borra el archivo y deja la transcripción / descripción.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_expired_at timestamptz;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS media_retention_days integer NOT NULL DEFAULT 90
  CHECK (media_retention_days = 0 OR media_retention_days >= 7);   -- 0 = conservar siempre

-- Espacio usado por un tenant en el bucket chat-media (bytes y archivos)
CREATE OR REPLACE FUNCTION public.tenant_media_usage(p_tenant uuid)
RETURNS TABLE (bytes bigint, files bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT COALESCE(sum((o.metadata->>'size')::bigint), 0)::bigint, count(*)::bigint
  FROM storage.objects o
  WHERE o.bucket_id = 'chat-media' AND o.name LIKE p_tenant::text || '/%';
$$;
REVOKE ALL ON FUNCTION public.tenant_media_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_media_usage(uuid) TO service_role;

-- 3. Buffer viejo (lo escribía /api/webhooks/whatsapp, ya eliminado)
DROP TABLE IF EXISTS public.message_buffer;
