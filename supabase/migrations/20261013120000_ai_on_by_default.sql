-- La IA arranca activa en conversaciones nuevas, en todos los tenants
UPDATE public.conversations SET ai_enabled = true WHERE ai_enabled IS NULL;
ALTER TABLE public.conversations ALTER COLUMN ai_enabled SET DEFAULT true;
ALTER TABLE public.conversations ALTER COLUMN ai_enabled SET NOT NULL;
ALTER TABLE public.contacts ALTER COLUMN ai_active SET DEFAULT true;
