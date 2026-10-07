# Auditoría funcional

Revisión del código y de la base de datos de producción (CRM-AiKon). Cada punto tiene su caso en `testsprite_tests/`.

## Corregido (2026-10-07)

| Hallazgo | Arreglo |
|---|---|
| El dashboard ignoraba el plan: pedía `/api/orders` (403) y mostraba "Pedidos hoy" y "Nuevo Pedido" en planes sin ventas | Las tarjetas, accesos rápidos y bloques salen de los módulos del plan. "Nuevo Pedido" abre el modal (`/orders?new=1`) |
| El detalle de contacto y el panel del chat mostraban Reservas en planes sin reservas | La pestaña, el botón y los datos dependen del módulo `reservations` (también en la API) |
| Reportes cargaba y mostraba reservas en `crm_pro` | Muestra ventas (pedidos por día y por estado) o reservas según el plan |
| Agente IA ofrecía "Crear reservas" sin el módulo | Oculto sin `reservations` |
| Un pedido solo permitía cambiar el estado y las notas | Editor de artículos, cantidades, precios y descuento (`PATCH /api/orders/[id]` con `items`) |
| Botón "Llamar" sin función | Eliminado. "Email" abre `mailto:` |
| "Invitar usuario" sin acción | Invitaciones de organización de Clerk: crear, listar y revocar, respetando `max_users` del plan. Solo para admins |
| Las campañas se quedaban en borrador | Se envían al webhook de n8n del cliente (`n8n_campaign_webhook`), y n8n reporta el progreso. Ver `docs/n8n-campanas.md` |
| Botón "…" de campañas sin acción | Reemplazado por "Enviar" (✈) en los borradores. Duplicar copia el segmento y las variables |
| "Exportar CSV" de Reportes sin acción | Exporta métricas, funnel y la serie diaria |
| "+ Agregar contacto" del funnel ignoraba la etapa | Abre "Nuevo contacto" con la etapa preseleccionada |
| No había enlace a Agente IA ni a Integraciones | Botones en `/settings` |
| **Integraciones no guardaba ni cargaba WhatsApp ni Google Calendar** (enviaba `{provider, credentials}` a columnas planas) | El cliente y la API usan las columnas reales |
| **`PATCH /api/settings/credentials` permitía escribir en otro tenant** (`...body` después de `tenant_id`) | Lista de campos permitidos y `tenant_id` forzado |
| **El webhook n8n aceptaba llamadas sin secreto** | Si el tenant tiene `n8n_webhook_secret`, se exige. Sin secreto se acepta con advertencia en el log |
| Adjuntar archivo fallaba (no existía el bucket `chat-media`) | Bucket creado y subida por `/api/conversations/[id]/attachments` |
| Crear y sincronizar plantillas usaba columnas inexistentes (`content`, `variables`, `is_active`) | Usa `components`, `status` y `meta_id` |
| El detalle de campaña pedía columnas inexistentes de contactos | Usa `nombre` y `wa_id` |
| Textos de "restaurante" en negocios de servicios (Configuración, Reportes) | Dependen de `business_type` |
| Páginas viejas con datos falsos: `/emails`, `/pipeline`, `/calendar`, `/messages` (Chatwoot), `/login` | Eliminadas, junto con `mock-data` y sus componentes. `/login` redirige a `/sign-in` |

Migraciones aplicadas en producción:
- `20261007220000_n8n_campaign_webhook.sql` (columna nueva)
- `20261007221000_chat_media_bucket.sql` (bucket público)

## Pendiente

| Hallazgo | Nota |
|---|---|
| `POST /api/webhooks/whatsapp` no verifica `X-Hub-Signature-256` | Si Meta solo habla con n8n, conviene eliminar la ruta |
| Ningún tenant tiene `n8n_webhook_secret` | Configurarlo en cada cliente (y en su n8n) para cerrar el webhook |
| `GET /api/settings/credentials` devuelve tokens a cualquier miembro | Restringir a administradores |
| `supabase/schema.sql` desactualizado; `README.md` genérico | Regenerar con `supabase db dump` |
