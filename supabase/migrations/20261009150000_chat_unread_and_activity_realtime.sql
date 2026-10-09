-- ============================================================
-- Chat: unread counter that matches reality + live actions.
--
-- 1. Only a HUMAN agent's message marks the chat as read. Bot and campaign
--    messages no longer reset unread_count, so a chat the bot answered
--    still shows as unseen until someone opens it.
-- 2. activity_log joins the realtime publication so actions (AI on/off,
--    status, assignment, tags, AI notes…) appear live in the chat.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_update_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_preview TEXT;
  v_at      TIMESTAMPTZ;
BEGIN
  -- Notes don't update the public conversation preview
  IF NEW.is_note THEN
    RETURN NEW;
  END IF;

  v_at := COALESCE(NEW.created_at, now());

  v_preview := LEFT(CASE NEW.content_type
    WHEN 'text'     THEN COALESCE(NEW.content, '')
    WHEN 'image'    THEN '📷 Imagen'
    WHEN 'audio'    THEN '🎵 Nota de voz'
    WHEN 'video'    THEN '🎥 Video'
    WHEN 'document' THEN COALESCE('📄 ' || NEW.media_filename, '📄 Documento')
    WHEN 'sticker'  THEN '🖼 Sticker'
    WHEN 'location' THEN '📍 Ubicación'
    WHEN 'reaction' THEN '👍 Reacción'
    WHEN 'template' THEN COALESCE('📋 ' || NEW.template_name, '📋 Plantilla')
    ELSE COALESCE(NEW.content, '[' || NEW.content_type || ']')
  END, 120);

  UPDATE conversations
  SET
    last_message    = v_preview,
    last_message_at = v_at,
    window_expires_at = CASE
      WHEN NEW.direction = 'inbound' THEN v_at + interval '24 hours'
      ELSE window_expires_at
    END,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      WHEN NEW.sender_type = 'human' THEN 0   -- an agent answered: seen
      ELSE unread_count                        -- bot / campaign: still unseen
    END,
    updated_at = now()
  WHERE id = NEW.conversation_id;

  IF NEW.direction = 'inbound' THEN
    UPDATE contacts SET last_incoming_at = v_at, updated_at = now() WHERE id = NEW.contact_id;
  ELSE
    UPDATE contacts SET last_contacted_at = v_at, updated_at = now() WHERE id = NEW.contact_id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  END IF;
END $$;
