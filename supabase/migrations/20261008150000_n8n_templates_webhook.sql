-- ============================================================
-- n8n webhook that syncs WhatsApp templates from the tenant's provider
-- (Meta Cloud API, Zenvia, …). The CRM POSTs { action: 'sync_templates' }
-- and n8n answers asynchronously with action templates_sync on
-- /api/webhooks/n8n.
-- ============================================================
ALTER TABLE public.tenant_credentials
  ADD COLUMN IF NOT EXISTS n8n_templates_webhook text,
  ADD COLUMN IF NOT EXISTS whatsapp_provider text;

COMMENT ON COLUMN public.tenant_credentials.n8n_templates_webhook
  IS 'n8n webhook URL that syncs WhatsApp templates for this tenant';
COMMENT ON COLUMN public.tenant_credentials.whatsapp_provider
  IS 'Informative: WhatsApp provider used by the tenant n8n (meta, zenvia, …). Credentials live in n8n.';
