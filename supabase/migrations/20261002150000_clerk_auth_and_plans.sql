-- ============================================================
-- Clerk ↔ Supabase auth + plans as source of truth
-- (APPLIED to CRM-AiKon on 2026-10-02)
-- ============================================================

-- 1. Read the Clerk org id from both session token formats:
--    v1 → { "org_id": "org_..." }   v2 → { "o": { "id": "org_..." } }
CREATE OR REPLACE FUNCTION public.get_clerk_org_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'org_id', ''),
    current_setting('request.jwt.claims', true)::jsonb -> 'o' ->> 'id',
    ''
  );
$$;

-- 2. A Clerk user can belong to several organizations (tenants):
--    one users row per (clerk_user_id, tenant_id).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_clerk_user_id_key;
ALTER TABLE public.users ADD CONSTRAINT users_clerk_user_id_tenant_id_key UNIQUE (clerk_user_id, tenant_id);

-- 3. plans is the source of truth: every tenant has a plan_id.
UPDATE public.tenants t SET plan_id = p.id FROM public.plans p
WHERE t.plan_id IS NULL AND p.slug = CASE
  WHEN t.business_type = 'restaurant' AND t.plan = 'starter' THEN 'restaurant_basic'
  WHEN t.business_type = 'restaurant' THEN 'restaurant_pro'
  WHEN t.plan = 'starter' THEN 'crm_basic'
  ELSE 'crm_pro' END;

CREATE OR REPLACE FUNCTION public.default_plan_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = public
AS 'SELECT id FROM plans WHERE slug = ''crm_basic''';
ALTER TABLE public.tenants ALTER COLUMN plan_id SET DEFAULT public.default_plan_id();
ALTER TABLE public.tenants ALTER COLUMN plan_id SET NOT NULL;
COMMENT ON COLUMN public.tenants.plan IS 'DEPRECATED: use plan_id -> plans';
