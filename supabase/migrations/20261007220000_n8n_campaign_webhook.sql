-- ============================================================
-- n8n webhook that sends WhatsApp campaigns.
-- The CRM POSTs the campaign (template + recipients) here; n8n sends
-- the messages through the WhatsApp API and reports progress back to
-- /api/webhooks/n8n (actions campaign_message_status / campaign_status).
-- ============================================================
ALTER TABLE public.tenant_credentials
  ADD COLUMN IF NOT EXISTS n8n_campaign_webhook text;

COMMENT ON COLUMN public.tenant_credentials.n8n_campaign_webhook
  IS 'n8n webhook URL that sends WhatsApp campaigns for this tenant';
