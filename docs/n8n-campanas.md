# Campañas: contrato CRM ↔ n8n

Cada cliente tiene su propio n8n. El CRM no envía mensajes de WhatsApp: le pasa la campaña a n8n y n8n la envía
con la API de WhatsApp y reporta el progreso.

## 1. Configuración (por cliente)
En **Configuración → Integraciones → n8n** se guardan:
- **Campañas Webhook URL** (`tenant_credentials.n8n_campaign_webhook`): webhook de n8n que recibe la campaña.
- **Webhook Secret** (`n8n_webhook_secret`): el CRM lo envía en el header `x-webhook-secret`, y n8n debe devolverlo
  en sus llamadas a `/api/webhooks/n8n`. **Una vez configurado, el CRM rechaza (401) cualquier llamada sin él.**

## 2. CRM → n8n: `POST {n8n_campaign_webhook}`
Se envía al crear la campaña ("Enviar ahora" o "Programar") o con el botón ✈ de una campaña en borrador.

```json
{
  "action": "send_campaign",
  "tenant_id": "uuid",
  "campaign_id": "uuid",
  "campaign_name": "Promo octubre",
  "scheduled_at": "2026-10-10T15:00:00.000Z",
  "phone_number_id": "1234567890",
  "waba_id": "1234567890",
  "template": { "id": "uuid", "name": "promo_octubre", "language": "es", "category": "MARKETING", "components": [] },
  "template_variables": { "1": "20%", "2": "viernes" },
  "recipients": [
    { "campaign_message_id": "uuid", "contact_id": "uuid", "name": "Ana", "wa_id": "573001234567" }
  ]
}
```

- `scheduled_at` es `null` si es "Enviar ahora". Si tiene fecha, n8n debe esperar (nodo *Wait*) hasta esa hora.
- Si n8n responde con un código 2xx, la campaña pasa a `running` (o `scheduled`). Si falla o no hay webhook,
  queda en `draft` y el CRM muestra el error.
- Los contactos sin `wa_id` no se envían a n8n y quedan como `failed`.

## 3. n8n → CRM: `POST /api/webhooks/n8n` (header `x-webhook-secret`)

**Por cada destinatario** (al enviar y con cada estado que llegue de Meta):
```json
{ "tenant_id": "uuid", "action": "campaign_message_status",
  "campaign_message_id": "uuid", "wa_message_id": "wamid.xxx", "status": "sent" }
```
- `status`: `sent` | `delivered` | `read` | `replied` | `failed` (con `error_code` / `error_message`).
- Después del primer envío también se puede identificar el mensaje solo por `wa_message_id`.
- El CRM recalcula los contadores. Cuando no queda ningún `pending`, la campaña pasa a `completed`.

**Opcional, para el estado de toda la campaña:**
```json
{ "tenant_id": "uuid", "action": "campaign_status", "campaign_id": "uuid", "status": "running" }
```
`status`: `running` | `completed` | `cancelled`.
