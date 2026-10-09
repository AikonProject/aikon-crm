-- Filtro profesional de contactos (campañas, segmentos).
-- p_filter = { "match": "all" | "any", "conditions": [ { "field", "op", "value", "key" } ] }
-- Solo lo usa el servidor (service_role); los valores se citan con format(%L).
CREATE OR REPLACE FUNCTION public.filter_contacts(p_tenant uuid, p_filter jsonb)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c        jsonb;
  f        text;
  op       text;
  v        jsonb;
  k        text;
  cond     text;
  parts    text[] := '{}';
  joiner   text := CASE WHEN p_filter->>'match' = 'any' THEN ' OR ' ELSE ' AND ' END;
  sql      text;
  arr      text;
  col      text;
  num      text;
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(p_filter->'conditions', '[]'::jsonb)) LOOP
    f := c->>'field'; op := c->>'op'; v := c->'value'; k := c->>'key'; cond := NULL;
    -- array of text values, quoted
    arr := (SELECT string_agg(quote_literal(x), ',') FROM jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(v) = 'array' THEN v WHEN v IS NULL OR v = 'null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(v) END) x);

    IF f = 'tag' THEN
      IF arr IS NULL THEN CONTINUE; END IF;
      cond := format('%s EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id::text IN (%s))',
                     CASE WHEN op = 'not_has' THEN 'NOT' ELSE '' END, arr);

    ELSIF f IN ('stage', 'assigned', 'source') THEN
      col := CASE f WHEN 'stage' THEN 'c.funnel_stage_id::text' WHEN 'assigned' THEN 'c.assigned_to::text' ELSE 'c.source' END;
      IF op = 'empty' THEN cond := col || ' IS NULL';
      ELSIF op = 'not_empty' THEN cond := col || ' IS NOT NULL';
      ELSIF arr IS NULL THEN CONTINUE;
      ELSIF op = 'is_not' THEN cond := format('(%s IS NULL OR %s NOT IN (%s))', col, col, arr);
      ELSE cond := format('%s IN (%s)', col, arr);
      END IF;

    ELSIF f = 'ai_active' THEN
      cond := format('COALESCE(c.ai_active, false) = %L::boolean', COALESCE(v #>> '{}', 'true'));

    ELSIF f = 'window_open' THEN
      cond := CASE WHEN COALESCE(v #>> '{}', 'true') = 'true'
                   THEN 'c.last_incoming_at > now() - interval ''24 hours'''
                   ELSE '(c.last_incoming_at IS NULL OR c.last_incoming_at <= now() - interval ''24 hours'')' END;

    ELSIF f = 'lead_score' THEN
      num := v #>> '{}';
      IF op = 'between' THEN
        cond := format('c.lead_score BETWEEN %L::int AND %L::int', v->>0, v->>1);
      ELSIF num IS NULL THEN CONTINUE;
      ELSE cond := format('c.lead_score %s %L::int', CASE op WHEN 'gt' THEN '>' WHEN 'lt' THEN '<' WHEN 'gte' THEN '>=' WHEN 'lte' THEN '<=' ELSE '=' END, num);
      END IF;

    ELSIF f IN ('name', 'email', 'phone') THEN
      col := CASE f WHEN 'name' THEN 'c.nombre' WHEN 'email' THEN 'c.email' ELSE 'c.wa_id' END;
      cond := CASE op
        WHEN 'empty'        THEN format('NULLIF(%s, '''') IS NULL', col)
        WHEN 'not_empty'    THEN format('NULLIF(%s, '''') IS NOT NULL', col)
        WHEN 'is'           THEN format('lower(%s) = lower(%L)', col, v #>> '{}')
        WHEN 'not_contains' THEN format('(%s IS NULL OR %s NOT ILIKE %L)', col, col, '%' || (v #>> '{}') || '%')
        WHEN 'starts_with'  THEN format('%s ILIKE %L', col, (v #>> '{}') || '%')
        ELSE format('%s ILIKE %L', col, '%' || COALESCE(v #>> '{}', '') || '%') END;

    ELSIF f = 'id' THEN
      IF arr IS NULL THEN CONTINUE; END IF;
      cond := format('(c.id::text IN (%s) OR c.wa_id IN (%s))', arr, arr);

    ELSIF f IN ('created_at', 'last_incoming_at', 'last_contacted_at') THEN
      col := 'c.' || f;
      cond := CASE op
        WHEN 'never'          THEN col || ' IS NULL'
        WHEN 'ever'           THEN col || ' IS NOT NULL'
        WHEN 'last_days'      THEN format('%s >= now() - make_interval(days => %L::int)', col, v #>> '{}')
        WHEN 'more_than_days' THEN format('(%s < now() - make_interval(days => %L::int))', col, v #>> '{}')
        WHEN 'before'         THEN format('%s < %L::date', col, v #>> '{}')
        WHEN 'after'          THEN format('%s >= (%L::date + 1)', col, v #>> '{}')
        WHEN 'on'             THEN format('%s::date = %L::date', col, v #>> '{}')
        WHEN 'between'        THEN format('%s >= %L::date AND %s < (%L::date + 1)', col, v->>0, col, v->>1)
        ELSE NULL END;

    ELSIF f = 'custom' THEN
      IF k IS NULL THEN CONTINUE; END IF;
      col := format('(SELECT cfv.value FROM contact_field_values cfv WHERE cfv.contact_id = c.id AND cfv.field_key = %L LIMIT 1)', k);
      cond := CASE op
        WHEN 'empty'        THEN format('NULLIF(%s, '''') IS NULL', col)
        WHEN 'not_empty'    THEN format('NULLIF(%s, '''') IS NOT NULL', col)
        WHEN 'is'           THEN format('lower(%s) = lower(%L)', col, v #>> '{}')
        WHEN 'is_not'       THEN format('(%s IS NULL OR lower(%s) <> lower(%L))', col, col, v #>> '{}')
        WHEN 'contains'     THEN format('%s ILIKE %L', col, '%' || (v #>> '{}') || '%')
        WHEN 'not_contains' THEN format('(%s IS NULL OR %s NOT ILIKE %L)', col, col, '%' || (v #>> '{}') || '%')
        WHEN 'gt'           THEN format('(CASE WHEN %s ~ ''^-?[0-9]+(\.[0-9]+)?$'' THEN (%s)::numeric > %L::numeric END)', col, col, v #>> '{}')
        WHEN 'lt'           THEN format('(CASE WHEN %s ~ ''^-?[0-9]+(\.[0-9]+)?$'' THEN (%s)::numeric < %L::numeric END)', col, col, v #>> '{}')
        WHEN 'before'       THEN format('(CASE WHEN %s ~ ''^\d{4}-\d{2}-\d{2}'' THEN left(%s, 10)::date < %L::date END)', col, col, v #>> '{}')
        WHEN 'after'        THEN format('(CASE WHEN %s ~ ''^\d{4}-\d{2}-\d{2}'' THEN left(%s, 10)::date > %L::date END)', col, col, v #>> '{}')
        -- same day and month, any year (birthdays)
        WHEN 'birthday_today' THEN format('(CASE WHEN %s ~ ''^\d{4}-\d{2}-\d{2}'' THEN to_char(left(%s, 10)::date, ''MM-DD'') = to_char(now() AT TIME ZONE ''America/Bogota'', ''MM-DD'') END)', col, col)
        ELSE NULL END;

    ELSIF f = 'campaign' THEN
      IF v IS NULL OR v = 'null'::jsonb THEN CONTINUE; END IF;
      cond := CASE op
        WHEN 'not_received' THEN format('NOT EXISTS (SELECT 1 FROM campaign_messages cm WHERE cm.contact_id = c.id AND cm.campaign_id::text = %L AND cm.status <> ''pending'')', v #>> '{}')
        WHEN 'replied'      THEN format('EXISTS (SELECT 1 FROM campaign_messages cm WHERE cm.contact_id = c.id AND cm.campaign_id::text = %L AND cm.replied_at IS NOT NULL)', v #>> '{}')
        WHEN 'read'         THEN format('EXISTS (SELECT 1 FROM campaign_messages cm WHERE cm.contact_id = c.id AND cm.campaign_id::text = %L AND cm.read_at IS NOT NULL)', v #>> '{}')
        ELSE format('EXISTS (SELECT 1 FROM campaign_messages cm WHERE cm.contact_id = c.id AND cm.campaign_id::text = %L AND cm.status <> ''pending'')', v #>> '{}') END;

    ELSIF f = 'conversation' THEN
      cond := CASE op
        WHEN 'unread'   THEN 'EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id AND cv.unread_count > 0)'
        WHEN 'resolved' THEN 'EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id AND cv.status = ''resolved'')'
        WHEN 'open'     THEN 'EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id AND cv.status = ''open'')'
        WHEN 'none'     THEN 'NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id)'
        ELSE NULL END;
    END IF;

    IF cond IS NOT NULL THEN parts := parts || ('(' || cond || ')'); END IF;
  END LOOP;

  sql := format('SELECT c.id FROM contacts c WHERE c.tenant_id = %L AND c.merged_into_id IS NULL', p_tenant);
  IF array_length(parts, 1) > 0 THEN
    sql := sql || ' AND (' || array_to_string(parts, joiner) || ')';
  END IF;
  RETURN QUERY EXECUTE sql;
END;
$$;

REVOKE ALL ON FUNCTION public.filter_contacts(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.filter_contacts(uuid, jsonb) TO service_role;
