-- ============================================================
-- Seed data for tenant "AiKon Restaurant"
-- tenant_id = '00000000-0000-0000-0000-000000000001'
-- ============================================================

-- Use a variable for readability
DO $$
DECLARE
  t_id uuid := '00000000-0000-0000-0000-000000000001';

  -- Funnel stage IDs (use existing ones)
  stage_nueva uuid;
  stage_interesado uuid;
  stage_reservo uuid;
  stage_no_reservo uuid;

  -- Tag IDs
  tag_vip uuid;
  tag_frecuente uuid;
  tag_cumple uuid;
  tag_corporativo uuid;
  tag_nuevo uuid;

  -- Contact IDs (deterministic for idempotency)
  c_maria uuid := 'b1000001-0000-0000-0000-000000000001';
  c_carlos uuid := 'b1000001-0000-0000-0000-000000000002';
  c_ana uuid := 'b1000001-0000-0000-0000-000000000003';
  c_pedro uuid := 'b1000001-0000-0000-0000-000000000004';
  c_sofia uuid := 'b1000001-0000-0000-0000-000000000005';
  c_miguel uuid := 'b1000001-0000-0000-0000-000000000006';
  c_laura uuid := 'b1000001-0000-0000-0000-000000000007';
  c_diego uuid := 'b1000001-0000-0000-0000-000000000008';
  c_valentina uuid := 'b1000001-0000-0000-0000-000000000009';
  c_roberto uuid := 'b1000001-0000-0000-0000-00000000000a';
  c_camila uuid := 'b1000001-0000-0000-0000-00000000000b';
  c_andres uuid := 'b1000001-0000-0000-0000-00000000000c';
  c_daniela uuid := 'b1000001-0000-0000-0000-00000000000d';
  c_jorge uuid := 'b1000001-0000-0000-0000-00000000000e';
  c_lucia uuid := 'b1000001-0000-0000-0000-00000000000f';

  -- Conversation IDs (deterministic)
  conv_maria uuid := 'c2000001-0000-0000-0000-000000000001';
  conv_carlos uuid := 'c2000001-0000-0000-0000-000000000002';
  conv_ana uuid := 'c2000001-0000-0000-0000-000000000003';
  conv_pedro uuid := 'c2000001-0000-0000-0000-000000000004';
  conv_sofia uuid := 'c2000001-0000-0000-0000-000000000005';
  conv_miguel uuid := 'c2000001-0000-0000-0000-000000000006';
  conv_laura uuid := 'c2000001-0000-0000-0000-000000000007';
  conv_diego uuid := 'c2000001-0000-0000-0000-000000000008';
  conv_valentina uuid := 'c2000001-0000-0000-0000-000000000009';
  conv_roberto uuid := 'c2000001-0000-0000-0000-00000000000a';

  -- Product category IDs (deterministic)
  cat_entradas uuid := 'd3000001-0000-0000-0000-000000000001';
  cat_platos uuid := 'd3000001-0000-0000-0000-000000000002';
  cat_postres uuid := 'd3000001-0000-0000-0000-000000000003';
  cat_bebidas uuid := 'd3000001-0000-0000-0000-000000000004';

  -- Product IDs (deterministic)
  p_guac uuid := 'e4000001-0000-0000-0000-000000000001';
  p_ceviche uuid := 'e4000001-0000-0000-0000-000000000002';
  p_tacos uuid := 'e4000001-0000-0000-0000-000000000003';
  p_enchiladas uuid := 'e4000001-0000-0000-0000-000000000004';
  p_mole uuid := 'e4000001-0000-0000-0000-000000000005';
  p_chiles uuid := 'e4000001-0000-0000-0000-000000000006';
  p_churros uuid := 'e4000001-0000-0000-0000-000000000007';
  p_flan uuid := 'e4000001-0000-0000-0000-000000000008';
  p_margarita uuid := 'e4000001-0000-0000-0000-000000000009';
  p_agua uuid := 'e4000001-0000-0000-0000-00000000000a';

  -- Order IDs (deterministic)
  o1 uuid := 'f5000001-0000-0000-0000-000000000001';
  o2 uuid := 'f5000001-0000-0000-0000-000000000002';
  o3 uuid := 'f5000001-0000-0000-0000-000000000003';
  o4 uuid := 'f5000001-0000-0000-0000-000000000004';
  o5 uuid := 'f5000001-0000-0000-0000-000000000005';

  -- Table IDs (deterministic)
  tbl_1 uuid := 'a6000001-0000-0000-0000-000000000001';
  tbl_2 uuid := 'a6000001-0000-0000-0000-000000000002';
  tbl_3 uuid := 'a6000001-0000-0000-0000-000000000003';
  tbl_4 uuid := 'a6000001-0000-0000-0000-000000000004';
  tbl_5 uuid := 'a6000001-0000-0000-0000-000000000005';
  tbl_6 uuid := 'a6000001-0000-0000-0000-000000000006';

BEGIN

-- ============================================================
-- 0. Clean existing test data (order matters for FK constraints)
-- ============================================================
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = t_id);
DELETE FROM orders WHERE tenant_id = t_id;
DELETE FROM deals WHERE tenant_id = t_id;
DELETE FROM reservations WHERE tenant_id = t_id;
DELETE FROM messages WHERE tenant_id = t_id;
DELETE FROM conversations WHERE tenant_id = t_id;
DELETE FROM contact_tags WHERE contact_id IN (SELECT id FROM contacts WHERE tenant_id = t_id);
DELETE FROM contacts WHERE tenant_id = t_id;
DELETE FROM products WHERE tenant_id = t_id;
DELETE FROM product_categories WHERE tenant_id = t_id;
DELETE FROM tags WHERE tenant_id = t_id;
DELETE FROM restaurant_tables WHERE tenant_id = t_id;
DELETE FROM restaurant_schedules WHERE tenant_id = t_id;
DELETE FROM restaurant_menus WHERE tenant_id = t_id;
DELETE FROM message_templates WHERE tenant_id = t_id;

-- ============================================================
-- 1. Get existing funnel stages
-- ============================================================
SELECT id INTO stage_nueva FROM funnel_stages WHERE tenant_id = t_id AND name = 'Nueva Conversación' LIMIT 1;
SELECT id INTO stage_interesado FROM funnel_stages WHERE tenant_id = t_id AND name = 'Interesado' LIMIT 1;
SELECT id INTO stage_reservo FROM funnel_stages WHERE tenant_id = t_id AND name = 'Reservó' LIMIT 1;
SELECT id INTO stage_no_reservo FROM funnel_stages WHERE tenant_id = t_id AND name = 'No reservó' LIMIT 1;

-- ============================================================
-- 2. Tags
-- ============================================================
INSERT INTO tags (id, tenant_id, name, color) VALUES
  (gen_random_uuid(), t_id, 'VIP', '#F59E0B'),
  (gen_random_uuid(), t_id, 'Frecuente', '#818CF8'),
  (gen_random_uuid(), t_id, 'Cumpleañero', '#EC4899'),
  (gen_random_uuid(), t_id, 'Corporativo', '#3B82F6'),
  (gen_random_uuid(), t_id, 'Nuevo', '#22C55E')
ON CONFLICT DO NOTHING;

SELECT id INTO tag_vip FROM tags WHERE tenant_id = t_id AND name = 'VIP' LIMIT 1;
SELECT id INTO tag_frecuente FROM tags WHERE tenant_id = t_id AND name = 'Frecuente' LIMIT 1;
SELECT id INTO tag_cumple FROM tags WHERE tenant_id = t_id AND name = 'Cumpleañero' LIMIT 1;
SELECT id INTO tag_corporativo FROM tags WHERE tenant_id = t_id AND name = 'Corporativo' LIMIT 1;
SELECT id INTO tag_nuevo FROM tags WHERE tenant_id = t_id AND name = 'Nuevo' LIMIT 1;

-- ============================================================
-- 3. Contacts (15)
-- ============================================================
INSERT INTO contacts (id, tenant_id, nombre, email, wa_id, source, funnel_stage_id, lead_score, ai_active, last_contacted_at, last_incoming_at) VALUES
  (c_maria,     t_id, 'María García López',     'maria.garcia@gmail.com',     '5215512345678', 'whatsapp', stage_interesado, 85, true,  NOW() - INTERVAL '2 hours',  NOW() - INTERVAL '2 hours'),
  (c_carlos,    t_id, 'Carlos Hernández Ruiz',   'carlos.hdez@outlook.com',    '5215587654321', 'whatsapp', stage_reservo,    92, false, NOW() - INTERVAL '30 min',   NOW() - INTERVAL '45 min'),
  (c_ana,       t_id, 'Ana Martínez Soto',       'ana.martinez@yahoo.com',     '5215598765432', 'whatsapp', stage_interesado, 78, true,  NOW() - INTERVAL '1 day',    NOW() - INTERVAL '1 day'),
  (c_pedro,     t_id, 'Pedro Sánchez Díaz',      'pedro.sanchez@empresa.mx',   '5215576543210', 'manual',   stage_reservo,    95, false, NOW() - INTERVAL '3 hours',  NULL),
  (c_sofia,     t_id, 'Sofía Ramírez Torres',    'sofia.ramirez@gmail.com',    '5215534567890', 'whatsapp', stage_nueva,      45, true,  NOW() - INTERVAL '5 hours',  NOW() - INTERVAL '5 hours'),
  (c_miguel,    t_id, 'Miguel Ángel Flores',     'miguel.flores@hotmail.com',  '5215523456789', 'whatsapp', stage_interesado, 70, true,  NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours'),
  (c_laura,     t_id, 'Laura Jiménez Moreno',    'laura.jimenez@gmail.com',    '5215545678901', 'web',      stage_nueva,      30, true,  NOW() - INTERVAL '2 days',   NOW() - INTERVAL '2 days'),
  (c_diego,     t_id, 'Diego López Castro',      'diego.lopez@empresa.mx',     '5215556789012', 'whatsapp', stage_reservo,    88, false, NOW() - INTERVAL '6 hours',  NOW() - INTERVAL '8 hours'),
  (c_valentina, t_id, 'Valentina Cruz Mendoza',  'vale.cruz@gmail.com',        '5215567890123', 'whatsapp', stage_no_reservo, 55, true,  NOW() - INTERVAL '3 days',   NOW() - INTERVAL '3 days'),
  (c_roberto,   t_id, 'Roberto Morales Ríos',    'roberto.morales@corp.mx',    '5215578901234', 'manual',   stage_interesado, 75, true,  NOW() - INTERVAL '1 day',    NULL),
  (c_camila,    t_id, 'Camila Ortega Vargas',    'camila.ortega@gmail.com',    '5215589012345', 'whatsapp', stage_nueva,      40, true,  NOW() - INTERVAL '4 days',   NOW() - INTERVAL '4 days'),
  (c_andres,    t_id, 'Andrés Gutiérrez Peña',   'andres.gtz@outlook.com',     '5215590123456', 'csv',      stage_reservo,    90, false, NOW() - INTERVAL '1 hour',   NULL),
  (c_daniela,   t_id, 'Daniela Reyes Navarro',   'daniela.reyes@gmail.com',    '5215501234567', 'whatsapp', stage_interesado, 65, true,  NOW() - INTERVAL '18 hours', NOW() - INTERVAL '18 hours'),
  (c_jorge,     t_id, 'Jorge Vargas Castillo',   'jorge.vargas@empresa.mx',    '5215512340987', 'manual',   stage_no_reservo, 50, true,  NOW() - INTERVAL '5 days',   NULL),
  (c_lucia,     t_id, 'Lucía Fernández Rojas',   'lucia.fernandez@gmail.com',  '5215543210987', 'whatsapp', stage_nueva,      35, true,  NOW() - INTERVAL '6 days',   NOW() - INTERVAL '6 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. Contact ↔ Tag assignments
-- ============================================================
INSERT INTO contact_tags (contact_id, tag_id) VALUES
  (c_maria, tag_frecuente),
  (c_carlos, tag_vip),
  (c_carlos, tag_frecuente),
  (c_pedro, tag_corporativo),
  (c_pedro, tag_vip),
  (c_sofia, tag_nuevo),
  (c_miguel, tag_frecuente),
  (c_diego, tag_corporativo),
  (c_valentina, tag_cumple),
  (c_roberto, tag_corporativo),
  (c_andres, tag_vip),
  (c_andres, tag_frecuente),
  (c_daniela, tag_nuevo),
  (c_lucia, tag_nuevo),
  (c_camila, tag_cumple)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. Conversations (update auto-created ones from contact trigger)
-- ============================================================
SELECT id INTO conv_maria     FROM conversations WHERE tenant_id = t_id AND contact_id = c_maria     LIMIT 1;
SELECT id INTO conv_carlos    FROM conversations WHERE tenant_id = t_id AND contact_id = c_carlos    LIMIT 1;
SELECT id INTO conv_ana       FROM conversations WHERE tenant_id = t_id AND contact_id = c_ana       LIMIT 1;
SELECT id INTO conv_pedro     FROM conversations WHERE tenant_id = t_id AND contact_id = c_pedro     LIMIT 1;
SELECT id INTO conv_sofia     FROM conversations WHERE tenant_id = t_id AND contact_id = c_sofia     LIMIT 1;
SELECT id INTO conv_miguel    FROM conversations WHERE tenant_id = t_id AND contact_id = c_miguel    LIMIT 1;
SELECT id INTO conv_laura     FROM conversations WHERE tenant_id = t_id AND contact_id = c_laura     LIMIT 1;
SELECT id INTO conv_diego     FROM conversations WHERE tenant_id = t_id AND contact_id = c_diego     LIMIT 1;
SELECT id INTO conv_valentina FROM conversations WHERE tenant_id = t_id AND contact_id = c_valentina LIMIT 1;
SELECT id INTO conv_roberto   FROM conversations WHERE tenant_id = t_id AND contact_id = c_roberto   LIMIT 1;

UPDATE conversations SET channel = 'whatsapp', status = 'open',     last_message = 'Claro, ¿para cuántas personas sería la reserva?',              last_message_at = NOW() - INTERVAL '2 hours',  unread_count = 1, ai_enabled = true  WHERE id = conv_maria;
UPDATE conversations SET channel = 'whatsapp', status = 'open',     last_message = 'Perfecto, su reserva está confirmada para las 8pm',             last_message_at = NOW() - INTERVAL '30 min',   unread_count = 0, ai_enabled = false WHERE id = conv_carlos;
UPDATE conversations SET channel = 'whatsapp', status = 'open',     last_message = '¿Tienen opciones vegetarianas en el menú?',                     last_message_at = NOW() - INTERVAL '1 day',    unread_count = 2, ai_enabled = true  WHERE id = conv_ana;
UPDATE conversations SET channel = 'whatsapp', status = 'resolved', last_message = 'Gracias, nos vemos el viernes',                                 last_message_at = NOW() - INTERVAL '3 hours',  unread_count = 0, ai_enabled = false WHERE id = conv_pedro;
UPDATE conversations SET channel = 'whatsapp', status = 'open',     last_message = 'Hola, me gustaría hacer una reserva',                            last_message_at = NOW() - INTERVAL '5 hours',  unread_count = 1, ai_enabled = true  WHERE id = conv_sofia;
UPDATE conversations SET channel = 'whatsapp', status = 'open',     last_message = '¿Cuál es el horario del restaurante los domingos?',              last_message_at = NOW() - INTERVAL '12 hours', unread_count = 1, ai_enabled = true  WHERE id = conv_miguel;
UPDATE conversations SET channel = 'whatsapp', status = 'pending',  last_message = 'Buenas tardes, quisiera información sobre eventos privados',     last_message_at = NOW() - INTERVAL '2 days',   unread_count = 3, ai_enabled = true  WHERE id = conv_laura;
UPDATE conversations SET channel = 'whatsapp', status = 'resolved', last_message = 'Excelente, la cena corporativa queda agendada',                  last_message_at = NOW() - INTERVAL '6 hours',  unread_count = 0, ai_enabled = false WHERE id = conv_diego;
UPDATE conversations SET channel = 'whatsapp', status = 'open',     last_message = 'Voy a pensarlo y les confirmo',                                  last_message_at = NOW() - INTERVAL '3 days',   unread_count = 0, ai_enabled = true  WHERE id = conv_valentina;
UPDATE conversations SET channel = 'whatsapp', status = 'open',     last_message = 'Necesito cotizar un evento para 30 personas',                    last_message_at = NOW() - INTERVAL '1 day',    unread_count = 1, ai_enabled = true  WHERE id = conv_roberto;

-- ============================================================
-- 6. Messages (realistic WhatsApp-style conversations)
-- ============================================================
INSERT INTO messages (tenant_id, conversation_id, contact_id, direction, content_type, content, status, sender_type, created_at) VALUES
  -- María: asking about reservation
  (t_id, conv_maria, c_maria, 'inbound',  'text', 'Hola buenas tardes, quisiera reservar una mesa para este viernes', 'read', 'contact', NOW() - INTERVAL '2 hours 15 min'),
  (t_id, conv_maria, c_maria, 'outbound', 'text', '¡Hola María! Con gusto te ayudo. ¿Para cuántas personas sería la reserva?', 'delivered', 'bot', NOW() - INTERVAL '2 hours 14 min'),
  (t_id, conv_maria, c_maria, 'inbound',  'text', 'Somos 4 personas, a las 8 de la noche si es posible', 'read', 'contact', NOW() - INTERVAL '2 hours 10 min'),
  (t_id, conv_maria, c_maria, 'outbound', 'text', 'Claro, ¿para cuántas personas sería la reserva?', 'delivered', 'bot', NOW() - INTERVAL '2 hours'),

  -- Carlos: confirmed reservation
  (t_id, conv_carlos, c_carlos, 'inbound',  'text', 'Buenas, necesito cambiar mi reserva del sábado a las 8pm en lugar de las 7', 'read', 'contact', NOW() - INTERVAL '1 hour'),
  (t_id, conv_carlos, c_carlos, 'outbound', 'text', 'Hola Carlos, claro que sí. Permítame verificar disponibilidad...', 'delivered', 'human', NOW() - INTERVAL '55 min'),
  (t_id, conv_carlos, c_carlos, 'outbound', 'text', 'Listo, ya está actualizada su reserva para el sábado a las 8pm, mesa para 6 personas en terraza', 'delivered', 'human', NOW() - INTERVAL '50 min'),
  (t_id, conv_carlos, c_carlos, 'inbound',  'text', 'Muchas gracias, ¿pueden preparar un pastel? Es cumpleaños de mi esposa', 'read', 'contact', NOW() - INTERVAL '45 min'),
  (t_id, conv_carlos, c_carlos, 'outbound', 'text', 'Perfecto, su reserva está confirmada para las 8pm. Con gusto preparamos un pastel especial. ¿Alguna preferencia de sabor?', 'delivered', 'human', NOW() - INTERVAL '30 min'),

  -- Ana: menu questions
  (t_id, conv_ana, c_ana, 'inbound',  'text', 'Hola! Quiero ir a cenar pero soy vegetariana', 'read', 'contact', NOW() - INTERVAL '1 day 2 hours'),
  (t_id, conv_ana, c_ana, 'outbound', 'text', '¡Hola Ana! Tenemos varias opciones vegetarianas. Te comparto nuestro menú.', 'delivered', 'bot', NOW() - INTERVAL '1 day 1 hour 58 min'),
  (t_id, conv_ana, c_ana, 'inbound',  'text', 'Genial, ¿también tienen opciones sin gluten?', 'read', 'contact', NOW() - INTERVAL '1 day 1 hour'),
  (t_id, conv_ana, c_ana, 'inbound',  'text', '¿Tienen opciones vegetarianas en el menú?', 'delivered', 'contact', NOW() - INTERVAL '1 day'),

  -- Sofía: new contact
  (t_id, conv_sofia, c_sofia, 'inbound', 'text', 'Hola, me gustaría hacer una reserva', 'read', 'contact', NOW() - INTERVAL '5 hours'),

  -- Miguel: schedule question
  (t_id, conv_miguel, c_miguel, 'inbound',  'text', 'Buenos días, ¿a qué hora abren los domingos?', 'read', 'contact', NOW() - INTERVAL '12 hours 30 min'),
  (t_id, conv_miguel, c_miguel, 'outbound', 'text', '¡Buenos días! Los domingos abrimos de 1pm a 10pm. ¿Le gustaría hacer una reserva?', 'delivered', 'bot', NOW() - INTERVAL '12 hours 28 min'),
  (t_id, conv_miguel, c_miguel, 'inbound',  'text', '¿Cuál es el horario del restaurante los domingos?', 'delivered', 'contact', NOW() - INTERVAL '12 hours'),

  -- Laura: private events
  (t_id, conv_laura, c_laura, 'inbound',  'text', 'Buenas tardes, quisiera información sobre eventos privados', 'read', 'contact', NOW() - INTERVAL '2 days 3 hours'),
  (t_id, conv_laura, c_laura, 'inbound',  'text', 'Es para un evento de empresa, seríamos como 50 personas', 'read', 'contact', NOW() - INTERVAL '2 days 2 hours'),
  (t_id, conv_laura, c_laura, 'inbound',  'text', '¿Tienen salón privado?', 'read', 'contact', NOW() - INTERVAL '2 days'),

  -- Diego: corporate dinner confirmed
  (t_id, conv_diego, c_diego, 'inbound',  'text', 'Hola, confirmo la cena corporativa para el jueves 15 personas', 'read', 'contact', NOW() - INTERVAL '8 hours'),
  (t_id, conv_diego, c_diego, 'outbound', 'text', 'Perfecto Diego, reservamos el salón privado para 15 personas el jueves a las 7:30pm', 'delivered', 'human', NOW() - INTERVAL '7 hours'),
  (t_id, conv_diego, c_diego, 'outbound', 'text', 'El menú corporativo incluye entrada, plato fuerte, postre y bebidas. ¿Alguna restricción alimentaria?', 'delivered', 'human', NOW() - INTERVAL '6 hours 30 min'),
  (t_id, conv_diego, c_diego, 'inbound',  'text', 'No, ninguna restricción. Todo perfecto, gracias', 'read', 'contact', NOW() - INTERVAL '6 hours 15 min'),
  (t_id, conv_diego, c_diego, 'outbound', 'text', 'Excelente, la cena corporativa queda agendada. Les enviaré la confirmación por email.', 'delivered', 'human', NOW() - INTERVAL '6 hours'),

  -- Valentina: undecided
  (t_id, conv_valentina, c_valentina, 'inbound',  'text', 'Hola, ¿cuánto cuesta el menú degustación?', 'read', 'contact', NOW() - INTERVAL '3 days 4 hours'),
  (t_id, conv_valentina, c_valentina, 'outbound', 'text', 'Hola Valentina, el menú degustación es de $850 por persona e incluye 7 tiempos con maridaje', 'delivered', 'bot', NOW() - INTERVAL '3 days 3 hours'),
  (t_id, conv_valentina, c_valentina, 'inbound',  'text', 'Voy a pensarlo y les confirmo', 'read', 'contact', NOW() - INTERVAL '3 days'),

  -- Roberto: corporate event quote
  (t_id, conv_roberto, c_roberto, 'inbound',  'text', 'Buenas tardes, necesito cotizar un evento para 30 personas, es para la empresa', 'read', 'contact', NOW() - INTERVAL '1 day 2 hours'),
  (t_id, conv_roberto, c_roberto, 'outbound', 'text', 'Hola Roberto, con gusto. Tenemos paquetes corporativos desde $450 por persona. ¿Le envío las opciones?', 'delivered', 'bot', NOW() - INTERVAL '1 day 1 hour'),
  (t_id, conv_roberto, c_roberto, 'inbound',  'text', 'Necesito cotizar un evento para 30 personas', 'delivered', 'contact', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. Product Categories
-- ============================================================
INSERT INTO product_categories (id, tenant_id, name, position) VALUES
  (cat_entradas, t_id, 'Entradas', 0),
  (cat_platos,   t_id, 'Platos Fuertes', 1),
  (cat_postres,  t_id, 'Postres', 2),
  (cat_bebidas,  t_id, 'Bebidas', 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. Products (10)
-- ============================================================
INSERT INTO products (id, tenant_id, name, description, sku, price, category_id, is_active) VALUES
  (p_guac,       t_id, 'Guacamole Fresco',        'Guacamole preparado al momento con totopos',      'ENT-001', 145.00, cat_entradas, true),
  (p_ceviche,    t_id, 'Ceviche de Camarón',       'Camarón fresco marinado con limón y chile',       'ENT-002', 195.00, cat_entradas, true),
  (p_tacos,      t_id, 'Tacos al Pastor',           'Orden de 3 tacos con piña y cilantro',            'PLA-001', 165.00, cat_platos,   true),
  (p_enchiladas, t_id, 'Enchiladas Suizas',         'Enchiladas rellenas de pollo con crema y queso',  'PLA-002', 195.00, cat_platos,   true),
  (p_mole,       t_id, 'Mole Poblano',              'Pollo bañado en mole tradicional con arroz',      'PLA-003', 245.00, cat_platos,   true),
  (p_chiles,     t_id, 'Chiles en Nogada',          'Chiles rellenos con salsa de nuez (temporada)',    'PLA-004', 295.00, cat_platos,   true),
  (p_churros,    t_id, 'Churros con Chocolate',     'Churros artesanales con chocolate caliente',       'POS-001',  95.00, cat_postres,  true),
  (p_flan,       t_id, 'Flan Napolitano',           'Flan casero con caramelo',                         'POS-002', 105.00, cat_postres,  true),
  (p_margarita,  t_id, 'Margarita Clásica',         'Tequila, limón, triple sec y sal',                 'BEB-001', 135.00, cat_bebidas,  true),
  (p_agua,       t_id, 'Agua de Horchata',          'Agua fresca de horchata (1 litro)',                'BEB-002',  65.00, cat_bebidas,  true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. Orders (5) + Order Items
-- ============================================================
INSERT INTO orders (id, tenant_id, contact_id, status, subtotal, discount, total, notes, source) VALUES
  (o1, t_id, c_carlos, 'completed', 1070.00, 0,   1070.00, 'Mesa terraza, celebración cumpleaños', 'crm'),
  (o2, t_id, c_maria,  'completed',  555.00, 0,    555.00, NULL, 'whatsapp'),
  (o3, t_id, c_pedro,  'confirmed', 2950.00, 295,  2655.00, 'Cena corporativa, facturar a empresa', 'crm'),
  (o4, t_id, c_diego,  'pending',    850.00, 0,    850.00, 'Pedir sin picante', 'whatsapp'),
  (o5, t_id, c_andres, 'completed',  710.00, 0,    710.00, NULL, 'crm')
ON CONFLICT DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES
  -- Order 1 (Carlos): cena de cumpleaños
  (o1, p_guac,       'Guacamole Fresco',     2, 145.00,  290.00),
  (o1, p_mole,       'Mole Poblano',         2, 245.00,  490.00),
  (o1, p_flan,       'Flan Napolitano',      2, 105.00,  210.00),
  (o1, p_margarita,  'Margarita Clásica',    2, 135.00,  270.00),

  -- Order 2 (María): cena casual
  (o2, p_ceviche,    'Ceviche de Camarón',   1, 195.00,  195.00),
  (o2, p_tacos,      'Tacos al Pastor',      1, 165.00,  165.00),
  (o2, p_churros,    'Churros con Chocolate', 1,  95.00,   95.00),
  (o2, p_agua,       'Agua de Horchata',     1,  65.00,   65.00),

  -- Order 3 (Pedro): cena corporativa 10 personas
  (o3, p_guac,       'Guacamole Fresco',     5, 145.00,  725.00),
  (o3, p_chiles,     'Chiles en Nogada',    10, 295.00, 2950.00),

  -- Order 4 (Diego): pedido pendiente
  (o4, p_enchiladas, 'Enchiladas Suizas',    2, 195.00,  390.00),
  (o4, p_tacos,      'Tacos al Pastor',      1, 165.00,  165.00),
  (o4, p_margarita,  'Margarita Clásica',    2, 135.00,  270.00),

  -- Order 5 (Andrés): comida
  (o5, p_ceviche,    'Ceviche de Camarón',   1, 195.00,  195.00),
  (o5, p_mole,       'Mole Poblano',         1, 245.00,  245.00),
  (o5, p_flan,       'Flan Napolitano',      1, 105.00,  105.00),
  (o5, p_agua,       'Agua de Horchata',     1,  65.00,   65.00)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10. Deals (6)
-- ============================================================
INSERT INTO deals (tenant_id, contact_id, name, price, currency, status, description) VALUES
  (t_id, c_carlos,  'Cena Cumpleaños Esposa',     1070.00, 'MXN', 'completed', 'Cena de cumpleaños con pastel especial'),
  (t_id, c_pedro,   'Cena Corporativa Empresa X', 2655.00, 'MXN', 'paid',      'Evento corporativo 15 personas'),
  (t_id, c_diego,   'Cena Corporativa Jueves',    5250.00, 'MXN', 'pending',   'Cena para 15 personas, salón privado'),
  (t_id, c_roberto, 'Evento Corporativo 30p',    13500.00, 'MXN', 'pending',   'Cotización evento corporativo 30 personas'),
  (t_id, c_andres,  'Comida Familiar',             710.00, 'MXN', 'completed', 'Comida familiar fin de semana'),
  (t_id, c_maria,   'Reserva Viernes 4p',          555.00, 'MXN', 'pending',   'Cena viernes 4 personas')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 11. Restaurant Tables (6)
-- ============================================================
INSERT INTO restaurant_tables (id, tenant_id, name, capacity, location, is_active, position) VALUES
  (tbl_1, t_id, 'Mesa 1',    2, 'Interior',  true, 0),
  (tbl_2, t_id, 'Mesa 2',    4, 'Interior',  true, 1),
  (tbl_3, t_id, 'Mesa 3',    4, 'Interior',  true, 2),
  (tbl_4, t_id, 'Mesa 4',    6, 'Terraza',   true, 3),
  (tbl_5, t_id, 'Mesa 5',    8, 'Terraza',   true, 4),
  (tbl_6, t_id, 'Salón VIP', 20, 'Privado',  true, 5)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 12. Restaurant Schedules (7 days)
-- ============================================================
INSERT INTO restaurant_schedules (tenant_id, day_of_week, shift_name, open_time, close_time, is_active, slot_duration_minutes) VALUES
  (t_id, 1, 'Comida y Cena', '12:00', '23:00', true,  30),
  (t_id, 2, 'Comida y Cena', '12:00', '23:00', true,  30),
  (t_id, 3, 'Comida y Cena', '12:00', '23:00', true,  30),
  (t_id, 4, 'Comida y Cena', '12:00', '23:00', true,  30),
  (t_id, 5, 'Comida y Cena', '12:00', '00:00', true,  30),
  (t_id, 6, 'Comida y Cena', '12:00', '00:00', true,  30),
  (t_id, 0, 'Brunch y Cena', '13:00', '22:00', true,  30)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 13. Reservations (6)
-- ============================================================
INSERT INTO reservations (tenant_id, contact_id, table_id, guest_name, guest_phone, guest_email, reservation_date, reservation_time, party_size, status, source, special_requests, occasion) VALUES
  (t_id, c_carlos, tbl_4, 'Carlos Hernández Ruiz',  '5215587654321', 'carlos.hdez@outlook.com',  CURRENT_DATE + 2,  '20:00', 6, 'confirmed', 'whatsapp', 'Pastel de cumpleaños para la esposa',   'Cumpleaños'),
  (t_id, c_pedro,  tbl_6, 'Pedro Sánchez Díaz',     '5215576543210', 'pedro.sanchez@empresa.mx', CURRENT_DATE + 4,  '19:30', 15, 'confirmed', 'manual',  'Cena corporativa, necesitan factura',    'Corporativo'),
  (t_id, c_diego,  tbl_6, 'Diego López Castro',     '5215556789012', 'diego.lopez@empresa.mx',   CURRENT_DATE + 3,  '19:30', 15, 'pending',  'whatsapp', 'Sin restricciones alimentarias',         'Corporativo'),
  (t_id, c_maria,  tbl_2, 'María García López',     '5215512345678', 'maria.garcia@gmail.com',   CURRENT_DATE + 1,  '20:00', 4,  'pending',  'whatsapp', NULL,                                     NULL),
  (t_id, c_andres, tbl_5, 'Andrés Gutiérrez Peña',  '5215590123456', 'andres.gtz@outlook.com',   CURRENT_DATE,      '14:00', 5,  'completed', 'manual', 'Mesa con vista al jardín',                NULL),
  (t_id, c_valentina, tbl_1, 'Valentina Cruz Mendoza', '5215567890123', 'vale.cruz@gmail.com',   CURRENT_DATE - 1,  '20:30', 2,  'no_show',  'whatsapp', 'Cena romántica',                         NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 14. Message Templates (3)
-- ============================================================
INSERT INTO message_templates (tenant_id, name, language, category, status, components) VALUES
  (t_id, 'confirmacion_reserva', 'es', 'UTILITY', 'APPROVED',
    '[{"type": "BODY", "text": "Hola {{1}}, tu reserva para {{2}} personas el {{3}} a las {{4}} está confirmada. ¡Te esperamos!"}]'::jsonb),
  (t_id, 'recordatorio_reserva', 'es', 'UTILITY', 'APPROVED',
    '[{"type": "BODY", "text": "Hola {{1}}, te recordamos tu reserva para mañana {{2}} a las {{3}}. Si necesitas cambiar algo, responde a este mensaje."}]'::jsonb),
  (t_id, 'promo_fin_semana', 'es', 'MARKETING', 'APPROVED',
    '[{"type": "BODY", "text": "¡Hola {{1}}! Este fin de semana tenemos promoción especial: 2x1 en margaritas y 15% de descuento en nuestro menú degustación. ¡Reserva ahora!"}]'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 15. Restaurant Menus (2)
-- ============================================================
INSERT INTO restaurant_menus (tenant_id, name, is_active, is_default) VALUES
  (t_id, 'Menú Principal',     true, true),
  (t_id, 'Menú Degustación',   true, false)
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Seed data inserted successfully for tenant %', t_id;

END $$;
