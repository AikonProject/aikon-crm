-- Campañas disponibles en todos los planes
UPDATE public.plans
SET features = jsonb_set(
  COALESCE(features, '{}'::jsonb),
  '{modules}',
  COALESCE(features->'modules', '[]'::jsonb) || '["campaigns"]'::jsonb
)
WHERE NOT (COALESCE(features->'modules', '[]'::jsonb) ? 'campaigns');
