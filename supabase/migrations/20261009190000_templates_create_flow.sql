-- Plantillas creadas desde el CRM: n8n las crea en el proveedor y devuelve el resultado
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS rejection_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_templates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_templates;
  END IF;
END $$;
