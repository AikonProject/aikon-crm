-- ============================================
-- SCHEMA: CRM Aikon Intelligence
-- ============================================

-- 1. Profiles (System Users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'manager', 'agent')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Contacts (Master table)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  city TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('csv', 'whatsapp', 'web', 'manual')),
  phase TEXT NOT NULL DEFAULT 'nuevo' CHECK (phase IN ('nuevo', 'contactado', 'interesado', 'en_negociacion', 'reunion_agendada', 'propuesta_enviada', 'cerrado_ganado', 'cerrado_perdido')),
  instantly_lead_id TEXT,
  chatwoot_contact_id TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  custom_fields JSONB DEFAULT '{}',
  lead_score INTEGER DEFAULT 0,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Email Campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  instantly_campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  sequence_steps INTEGER DEFAULT 1,
  total_leads INTEGER DEFAULT 0,
  start_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Email Events
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed')),
  email_account TEXT,
  subject TEXT,
  body_preview TEXT,
  sequence_step INTEGER,
  variant_used TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Email Replies
CREATE TABLE IF NOT EXISTS email_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email_event_id UUID NOT NULL REFERENCES email_events(id) ON DELETE CASCADE,
  reply_body TEXT NOT NULL,
  ai_classification TEXT CHECK (ai_classification IN ('interested', 'not_interested', 'out_of_office', 'unsubscribe', 'neutral')),
  sentiment_score INTEGER,
  requires_action BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. WhatsApp Messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  chatwoot_conversation_id INTEGER,
  chatwoot_message_id INTEGER,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'video', 'document')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'system', 'manual')),
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Phase Transitions
CREATE TABLE IF NOT EXISTS phase_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  previous_phase TEXT NOT NULL,
  new_phase TEXT NOT NULL,
  reason TEXT DEFAULT 'manual' CHECK (reason IN ('automatic', 'manual')),
  trigger_event TEXT,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Calendar Events
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'meeting' CHECK (event_type IN ('meeting', 'follow_up', 'call', 'demo', 'task')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Daily Metrics
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  emails_bounced INTEGER DEFAULT 0,
  wa_messages_received INTEGER DEFAULT 0,
  wa_messages_sent INTEGER DEFAULT 0,
  new_leads INTEGER DEFAULT 0,
  leads_interested INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_contacts_phase ON contacts(phase);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned ON contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_email_events_contact ON email_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contact ON whatsapp_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_activity_contact ON activity_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_assigned ON calendar_events(assigned_to);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX IF NOT EXISTS idx_phase_transitions_contact ON phase_transitions(contact_id);

-- ============================================
-- RLS Policies (enable RLS on all tables)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all data (for CRM usage)
CREATE POLICY "Allow authenticated read" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON email_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON email_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON email_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON whatsapp_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON phase_transitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON calendar_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON daily_metrics FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert/update/delete
CREATE POLICY "Allow authenticated write" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated write" ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated write" ON email_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated write" ON email_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated write" ON email_replies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated write" ON whatsapp_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated write" ON activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated write" ON phase_transitions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated write" ON calendar_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated write" ON daily_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon access for development (remove in production)
CREATE POLICY "Allow anon read" ON profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON contacts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON email_campaigns FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON email_events FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON email_replies FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON whatsapp_messages FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON activity_log FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON phase_transitions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON calendar_events FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON daily_metrics FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon write" ON profiles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon write" ON contacts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon write" ON email_campaigns FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon write" ON email_events FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon write" ON email_replies FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon write" ON whatsapp_messages FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon write" ON activity_log FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon write" ON phase_transitions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon write" ON calendar_events FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon write" ON daily_metrics FOR ALL TO anon USING (true) WITH CHECK (true);
