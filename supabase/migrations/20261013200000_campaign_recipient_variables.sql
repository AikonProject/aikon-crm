-- Variables de la plantilla resueltas para cada destinatario (nombre, teléfono, campos personalizados…)
ALTER TABLE public.campaign_messages ADD COLUMN IF NOT EXISTS variables jsonb;
