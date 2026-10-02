-- ============================================================
-- Security hardening — PENDING: run manually in the Supabase SQL editor
-- ============================================================

-- 1. RPCs that write data for an arbitrary tenant must not be callable
--    with the public anon key or a user JWT. Only server code (service_role).
REVOKE EXECUTE ON FUNCTION public.create_contact_with_conversation(uuid, text, text, text, text, boolean, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_conversation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_unread(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- 2. Internal tables: only service_role (bypasses RLS) may write them.
DROP POLICY IF EXISTS "Service role full access on message_buffer" ON public.message_buffer;
DROP POLICY IF EXISTS n8n_chat_histories_write ON public.n8n_chat_histories;

-- 3. Pin search_path on every public function we own (advisor 0011).
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', f.sig);
  END LOOP;
END $$;
