-- ============================================================
-- Test data for a tenant: contacts, conversations, messages,
-- tags, custom fields, notes, activity and deals.
-- All contacts use emails @ejemplo-prueba.com (see cleanup at the end).
-- Replace the tenant id below to reuse it.
-- ============================================================
DO $$
DECLARE
  v_tenant uuid := 'bb00173e-f38c-4f01-a6e0-e20fe1eab74d';
  v_contact uuid;
  v_conv uuid;
  v_stage uuid;
  v_base timestamptz;
  v_tag text;
  v_msg jsonb;
  i int;
  c jsonb;
  -- contact: nombre, tel, stage slug, score, source, empresa, cargo, ciudad, tags, days ago, status, script
  v_contacts jsonb := '[
    ["Laura Gómez",      "573000000101","nuevo",          20,"whatsapp","Café Andino",          "Gerente",              "Bogotá",      ["Nuevo"],                      0,"open",    0],
    ["Andrés Martínez",  "573000000102","nuevo",          15,"whatsapp","Ferretería El Tornillo","Propietario",         "Medellín",    [],                              0,"open",    1],
    ["Valentina Ríos",   "573000000103","nuevo",          10,"web",     "Estudio Pilates Vida", "Fundadora",           "Cali",        ["Nuevo"],                      1,"open",    0],
    ["Camilo Herrera",   "573000000104","contactado",     35,"whatsapp","Inmobiliaria Horizonte","Director comercial", "Barranquilla",["Seguimiento"],                1,"pending", 2],
    ["Daniela Torres",   "573000000105","contactado",     30,"manual",  "Clínica Dental Sonríe","Administradora",      "Bogotá",      ["Referido"],                   2,"open",    2],
    ["Santiago López",   "573000000106","contactado",     40,"whatsapp","AutoPartes Express",   "Gerente de marketing","Bucaramanga", ["Seguimiento"],                3,"resolved",1],
    ["Mariana Castro",   "573000000107","interesado",     60,"whatsapp","Boutique Mariana",     "Propietaria",         "Pereira",     ["Lead caliente"],              0,"open",    3],
    ["Felipe Ramírez",   "573000000108","interesado",     55,"web",     "Gimnasio PowerFit",    "Socio",               "Medellín",    ["Lead caliente","Seguimiento"],1,"open",    3],
    ["Isabella Moreno",  "573000000109","interesado",     50,"csv",     "Panadería La Espiga",  "Administradora",      "Manizales",   [],                              4,"pending", 3],
    ["Juan David Pérez", "573000000110","interesado",     65,"whatsapp","Constructora Pilares", "Gerente general",     "Bogotá",      ["VIP","Lead caliente"],        2,"open",    4],
    ["Natalia Vargas",   "573000000111","negociacion",    75,"whatsapp","Spa Esencia",          "Directora",           "Cartagena",   ["Lead caliente"],              0,"open",    4],
    ["Sebastián Rojas",  "573000000112","negociacion",    80,"manual",  "Colegio Nuevo Mundo",  "Rector",              "Bogotá",      ["VIP"],                        1,"open",    4],
    ["Carolina Jiménez", "573000000113","negociacion",    70,"whatsapp","Veterinaria Patitas",  "Propietaria",         "Cali",        ["Seguimiento"],                5,"pending", 4],
    ["Diego Hernández",  "573000000114","cerrado-ganado", 95,"whatsapp","Restaurante Fogón",    "Chef y propietario",  "Medellín",    ["VIP"],                        3,"resolved",5],
    ["Paula Sánchez",    "573000000115","cerrado-ganado", 90,"web",     "Óptica Visión Clara",  "Gerente",             "Bogotá",      ["Referido","VIP"],             8,"resolved",5],
    ["Tomás Díaz",       "573000000116","cerrado-ganado", 92,"whatsapp","Lavandería Burbujas",  "Propietario",         "Santa Marta", [],                              12,"resolved",5],
    ["Gabriela Ruiz",    "573000000117","cerrado-perdido",25,"whatsapp","Floristería Pétalos",  "Propietaria",         "Pereira",     [],                              10,"resolved",6],
    ["Ricardo Mendoza",  "573000000118","cerrado-perdido",20,"csv",     "Taller Mecánico RM",   "Propietario",         "Ibagué",      [],                              15,"resolved",6],
    ["Luisa Fernanda Ortiz","573000000119","nuevo",        5,"whatsapp","Tienda Naturista Vital","Encargada",          "Villavicencio",["Nuevo"],                     0,"open",    1],
    ["Alejandro Navarro","573000000120","contactado",     30,"web",     "Agencia de Viajes Rumbo","Asesor senior",      "Bogotá",      ["Seguimiento"],                6,"open",    2]
  ]';
  -- message scripts: [direction, sender_type, text]
  v_scripts jsonb := '[
    [["inbound","contact","Hola! Vi su anuncio en Instagram, ¿manejan redes sociales para negocios pequeños?"],
     ["outbound","bot","¡Hola! 👋 Soy el asistente de la agencia. Sí, manejamos redes sociales desde $800.000 al mes. ¿Qué tipo de negocio tienes?"],
     ["inbound","contact","Tengo un café y quiero más clientes los fines de semana"]],
    [["inbound","contact","Buenas tardes, ¿cuánto cuesta una página web?"],
     ["outbound","bot","¡Buenas tardes! Nuestras páginas web empiezan desde $1.500.000 e incluyen dominio y hosting el primer año. ¿Te gustaría agendar una llamada?"]],
    [["inbound","contact","Hola, me recomendaron su agencia"],
     ["outbound","bot","¡Qué bueno saberlo! ¿En qué servicio estás interesado: redes, pauta o página web?"],
     ["inbound","contact","Pauta en Google y Meta"],
     ["outbound","human","Hola, soy Sebastián, asesor comercial. Te comparto nuestro portafolio de pauta. ¿Tienes un presupuesto mensual estimado?"],
     ["inbound","contact","Entre 2 y 3 millones mensuales"],
     ["outbound","human","Perfecto, con ese presupuesto podemos trabajar bien. Te llamo mañana a las 10am para explicarte la estrategia."]],
    [["inbound","contact","Hola, quiero cotizar el plan de redes sociales"],
     ["outbound","bot","¡Claro! El plan Básico incluye 12 publicaciones al mes y el Pro 20 publicaciones + reels. ¿Cuál te interesa?"],
     ["inbound","contact","El Pro, ¿incluye las fotos?"],
     ["outbound","human","Sí, el Pro incluye una sesión de fotos mensual en tu local. Te envío la cotización formal por aquí."],
     ["outbound","human","Cotización Plan Pro: $1.400.000/mes, permanencia mínima 3 meses."],
     ["inbound","contact","Déjame revisarla con mi socio y te confirmo esta semana 🙏"]],
    [["inbound","contact","Buenos días, revisamos la propuesta y nos gustó"],
     ["outbound","human","¡Excelente noticia! ¿Tienen alguna duda o ajuste antes de firmar?"],
     ["inbound","contact","Queremos saber si pueden hacer descuento si pagamos 6 meses por adelantado"],
     ["outbound","human","Por pago semestral aplicamos un 10% de descuento. Te envío la propuesta actualizada."],
     ["inbound","contact","Perfecto, ¿cómo sería el pago?"]],
    [["inbound","contact","Listo, ya hicimos la transferencia"],
     ["outbound","human","¡Recibido, muchas gracias! Bienvenidos 🎉 Mañana te escribe tu community manager para el kick-off."],
     ["inbound","contact","Genial, quedamos atentos"],
     ["outbound","bot","Tu caso fue marcado como resuelto. Si necesitas algo más, escríbenos por aquí."]],
    [["inbound","contact","Hola, gracias por la propuesta pero por ahora no tenemos presupuesto"],
     ["outbound","human","Entendemos, gracias por tenernos en cuenta. ¿Te parece si te escribimos en un par de meses?"],
     ["inbound","contact","Sí, claro, más adelante hablamos"]]
  ]';
  v_script jsonb;
  v_n int;
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(v_contacts) LOOP
    SELECT id INTO v_stage FROM funnel_stages WHERE tenant_id = v_tenant AND slug = c->>2;
    v_base := now() - ((c->>9)::int || ' days')::interval - interval '2 hours';

    -- Contact (trigger creates the conversation + nombre/telefono field values)
    INSERT INTO contacts (tenant_id, nombre, wa_id, phone, email, funnel_stage_id, lead_score, source, created_at, ai_active)
    VALUES (v_tenant, c->>0, c->>1, '+' || (c->>1),
            lower(replace(translate(split_part(c->>0,' ',1)||'.'||split_part(c->>0,' ',2),'áéíóúñÁÉÍÓÚÑ','aeiounAEIOUN'),' ','')) || '@ejemplo-prueba.com',
            v_stage, (c->>3)::int, c->>4, v_base - interval '1 day', (c->>2) IN ('nuevo','contactado'))
    RETURNING id INTO v_contact;

    -- Custom fields
    INSERT INTO contact_field_values (contact_id, tenant_id, field_key, value) VALUES
      (v_contact, v_tenant, 'empresa', c->>5),
      (v_contact, v_tenant, 'cargo',   c->>6),
      (v_contact, v_tenant, 'ciudad',  c->>7)
    ON CONFLICT (contact_id, field_key) DO UPDATE SET value = EXCLUDED.value;

    -- Tags
    FOR v_tag IN SELECT jsonb_array_elements_text(c->8) LOOP
      INSERT INTO contact_tags (contact_id, tag_id)
      SELECT v_contact, id FROM tags WHERE tenant_id = v_tenant AND name = v_tag
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- Messages (trigger updates last_message, unread_count and contact timestamps)
    SELECT id INTO v_conv FROM conversations WHERE contact_id = v_contact;
    v_script := v_scripts -> (c->>11)::int;
    v_n := jsonb_array_length(v_script);
    FOR i IN 0 .. v_n - 1 LOOP
      v_msg := v_script -> i;
      INSERT INTO messages (tenant_id, conversation_id, contact_id, direction, sender_type, content_type, content,
                            status, delivery_status, sent_by_name, created_at)
      VALUES (v_tenant, v_conv, v_contact, v_msg->>0, v_msg->>1, 'text', v_msg->>2,
              CASE WHEN v_msg->>0 = 'outbound' THEN 'read' ELSE 'sent' END,
              CASE WHEN v_msg->>0 = 'outbound' THEN 'read' ELSE 'delivered' END,
              CASE v_msg->>1 WHEN 'human' THEN 'Sebastián (Asesor)' WHEN 'bot' THEN 'Asistente IA' ELSE NULL END,
              v_base + (i * interval '7 minutes'));
    END LOOP;

    -- Conversation status; resolved/pending ones have been read
    UPDATE conversations
    SET status = c->>10,
        unread_count = CASE WHEN c->>10 = 'open' THEN unread_count ELSE 0 END,
        ai_enabled = (c->>2) IN ('nuevo','contactado')
    WHERE id = v_conv;

    -- Activity
    INSERT INTO activity_log (tenant_id, contact_id, activity_type, channel, description, created_at)
    VALUES (v_tenant, v_contact, 'contact_created', CASE WHEN c->>4 = 'whatsapp' THEN 'whatsapp' ELSE 'manual' END,
            'Contacto creado desde ' || (c->>4), v_base - interval '1 day');
    IF (c->>2) <> 'nuevo' THEN
      INSERT INTO activity_log (tenant_id, contact_id, activity_type, channel, description, performed_by_name, created_at)
      VALUES (v_tenant, v_contact, 'stage_changed', 'manual',
              'Movido a la fase ' || (SELECT name FROM funnel_stages WHERE id = v_stage),
              'Sebastián (Asesor)', v_base + interval '1 hour');
    END IF;

    -- Notes for advanced stages
    IF (c->>2) IN ('interesado','negociacion','cerrado-ganado','cerrado-perdido') THEN
      INSERT INTO contact_notes (tenant_id, contact_id, content, created_at)
      VALUES (v_tenant, v_contact,
              CASE c->>2
                WHEN 'interesado' THEN 'Interesado en ' || CASE WHEN (c->>3)::int > 55 THEN 'plan Pro de redes + pauta' ELSE 'plan Básico de redes' END || '. Llamar esta semana.'
                WHEN 'negociacion' THEN 'Propuesta enviada. Pide descuento por pago semestral (10% aprobado).'
                WHEN 'cerrado-ganado' THEN 'Cliente activo. Kick-off realizado, community manager asignado.'
                ELSE 'Sin presupuesto este trimestre. Retomar en 2 meses.'
              END,
              v_base + interval '2 hours');
    END IF;

    -- Deals for won and negotiating contacts
    IF (c->>2) = 'cerrado-ganado' THEN
      INSERT INTO deals (tenant_id, contact_id, name, description, price, quantity, status, sold_at)
      VALUES (v_tenant, v_contact, 'Plan Pro Redes Sociales', 'Pago semestral con 10% de descuento',
              1260000, 6, 'paid', v_base);
    ELSIF (c->>2) = 'negociacion' THEN
      INSERT INTO deals (tenant_id, contact_id, name, description, price, quantity, status, sold_at)
      VALUES (v_tenant, v_contact, 'Plan Pro Redes + Pauta', 'Propuesta en negociación',
              2400000, 3, 'pending', v_base);
    END IF;
  END LOOP;
END $$;

-- Cleanup (removes only these test contacts and everything linked to them):
-- DELETE FROM contacts
-- WHERE tenant_id = 'bb00173e-f38c-4f01-a6e0-e20fe1eab74d' AND email LIKE '%@ejemplo-prueba.com';
