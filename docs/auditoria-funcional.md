# Auditoría funcional: huecos encontrados (2026-10-07)

Revisión estática del código y de la base de datos de producción (CRM-AiKon, solo lectura).
Cada hallazgo tiene un caso de TestSprite (`testsprite_tests/`) que debe fallar hoy y pasar cuando se corrija.

## Crítico (seguridad)

| # | Hallazgo | Dónde | Test |
|---|---|---|---|
| S1 | **El webhook de n8n acepta peticiones sin autenticar.** La validación solo corre si llega el header `x-webhook-secret` *y* el tenant tiene un secreto guardado. Hoy **ningún tenant** tiene `n8n_webhook_secret`, así que cualquiera que conozca un `tenant_id` puede insertar mensajes "del bot" o cambiar estados de entrega. | `app/api/webhooks/n8n/route.ts:33-43` | BE009 |
| S2 | **El webhook de WhatsApp no verifica `X-Hub-Signature-256`.** Cualquiera puede inyectar mensajes entrantes falsos conociendo un `phone_number_id`. Hay que validar con el App Secret de Meta. | `app/api/webhooks/whatsapp/route.ts` (POST) | BE008 |

## Alto (funcionalidad rota o engañosa)

| # | Hallazgo | Dónde | Test |
|---|---|---|---|
| F1 | **El dashboard ignora el plan.** En `crm_basic` y `restaurant_basic` llama a `/api/orders` y `/api/orders/stats` (que responden 403), muestra "Pedidos hoy" e "Ingresos" en 0 y el botón **"Nuevo Pedido"**, que al hacer clic devuelve al dashboard. | `app/(dashboard)/dashboard/dashboard-client.tsx:96-97, 154, 161` | TC008, TC010 |
| F2 | **"Agente IA" (`/settings/ai`) e "Integraciones" (`/settings/integrations`) no tienen ningún enlace** en el sidebar ni en `/settings`. El cliente no puede llegar a configurar WhatsApp, n8n ni el bot. | `components/layout/sidebar.tsx`, `app/(dashboard)/settings/page.tsx` | TC038 |
| F3 | **Las campañas nunca se envían.** "Enviar ahora" crea la campaña en `draft` con los `campaign_messages` en `pending`, pero nada llama a n8n. *(Confirmar: ¿n8n consulta la tabla por su cuenta?)* | `app/api/campaigns/route.ts:80` | TC028 |
| F4 | **"Invitar usuario" no hace nada** (no tiene `onClick`). | `app/(dashboard)/settings/page.tsx:142` | TC036 |
| F5 | **"Llamar" y "Email" del detalle de contacto no hacen nada.** | `app/(dashboard)/contacts/[id]/page.tsx:236, 245` | TC016 |
| F6 | **Enviar mensajes solo funciona en `aikon-restaurant`**: es el único tenant con `n8n_send_message_webhook`. En los demás, enviar desde Conversaciones falla. Falta un aviso claro en la UI. | datos en `tenant_credentials` | TC020 |

## Medio

| # | Hallazgo | Dónde | Test |
|---|---|---|---|
| M1 | "Exportar CSV" de Reportes no tiene acción. | `app/(dashboard)/reports/page.tsx:174` | TC030 |
| M2 | El botón "…" (Más opciones) de cada campaña no tiene acción. | `app/(dashboard)/campaigns/campaigns-client.tsx:209` | TC029 |
| M3 | "+ Agregar contacto" de cada columna del funnel lleva a `/contacts?stage=…`, pero `/contacts` ignora `stage`: no filtra ni preselecciona. | `components/funnel/funnel-page-client.tsx:240`, `components/contacts/contacts-table-client.tsx` | TC024 |
| M4 | En Configuración → General el texto dice "Información del restaurante" y "Nombre del restaurante" también para empresas de servicios. | `app/(dashboard)/settings/page.tsx:85-87` | TC035 |

## Bajo (deuda técnica)

- **Páginas antiguas con datos de mentira (mock)** que siguen accesibles por URL y no dependen del plan: `/emails`, `/pipeline`, `/calendar` y `/messages` (Chatwoot). El "activity feed" del dashboard también usa `mockContacts`. Recomiendo borrarlas o conectarlas a datos reales.
- `app/(auth)/login/page.tsx` es una página de login de Supabase sin implementar (TODO). El login real es `/sign-in` (Clerk).
- `supabase/schema.sql` está desactualizado respecto a la base real (no tiene `plans`, `tenants`, `messages`…). Conviene regenerarlo con `supabase db dump`.
- `README.md` es el de create-next-app.

## Preguntas abiertas

1. **Campañas**: ¿n8n lee `campaign_messages` en estado `pending` por su cuenta, o el CRM debería llamar a un webhook de n8n al crear la campaña?
2. **Invitar usuario**: ¿debe usar las invitaciones de organización de Clerk (`organizations.createOrganizationInvitation`)?
3. **"Llamar"**: ¿llamada telefónica (`tel:`) o abrir WhatsApp (`wa.me`)?
4. ¿Las páginas `/emails`, `/pipeline`, `/calendar` y `/messages` se pueden borrar?
