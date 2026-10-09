-- Citas / reuniones para negocios de servicios (planes no restaurante)

-- 1. Datos de la cita
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS meeting_type  text NOT NULL DEFAULT 'virtual',
  ADD COLUMN IF NOT EXISTS meeting_url   text,
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS notes         text,
  ADD COLUMN IF NOT EXISTS color         text,
  ADD COLUMN IF NOT EXISTS service_id    uuid REFERENCES public.services(id) ON DELETE SET NULL;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_meeting_type_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_meeting_type_check
  CHECK (meeting_type IN ('virtual', 'presencial', 'llamada'));

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'));

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_time_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_time_check
  CHECK (end_time > start_time);

CREATE INDEX IF NOT EXISTS appointments_tenant_start_idx ON public.appointments (tenant_id, start_time);

-- 2. Un contacto o servicio de otro tenant nunca se puede asociar
CREATE OR REPLACE FUNCTION public.fn_enforce_appointment_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contacts WHERE id = NEW.contact_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'contact % does not belong to tenant %', NEW.contact_id, NEW.tenant_id;
  END IF;
  IF NEW.service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM services WHERE id = NEW.service_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'service % does not belong to tenant %', NEW.service_id, NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_enforce_tenant ON public.appointments;
CREATE TRIGGER appointments_enforce_tenant
  BEFORE INSERT OR UPDATE OF contact_id, service_id, tenant_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_appointment_tenant();

-- 3. Calendario en tiempo real
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
END $$;

-- 4. Módulo "appointments" en los planes que no son de restaurante
UPDATE public.plans
SET features = jsonb_set(
  COALESCE(features, '{}'::jsonb),
  '{modules}',
  COALESCE(features->'modules', '[]'::jsonb) || '["appointments"]'::jsonb
)
WHERE slug NOT LIKE 'restaurant%'
  AND NOT (COALESCE(features->'modules', '[]'::jsonb) ? 'appointments');
