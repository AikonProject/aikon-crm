# Contrato CRM ↔ n8n

## Principios
1. **El CRM es el único que escribe en Supabase.** n8n no necesita llaves de la base de datos: todo lo que pasa en
   WhatsApp se reporta a `POST https://aikon-crm.vercel.app/api/webhooks/n8n`.
2. **Las credenciales de WhatsApp viven en el n8n de cada cliente**, no en el CRM. Así da igual el proveedor
   (Meta Cloud API, Zenvia, etc.): el CRM solo conoce las URLs de n8n y el secreto compartido.
3. **Cada cliente tiene su bot** (su prompt, herramientas y credenciales), en el n8n de AiKon o en uno propio.

## Workflows (carpeta "AiKon CRM", plantillas para duplicar por cliente)

| Workflow | Qué hace | Proveedor |
|---|---|---|
| **CRM Gateway · Meta** | Un solo webhook (`/webhook/crm/gateway`) que el CRM usa para enviar mensajes, campañas y confirmaciones de reserva y para sincronizar plantillas (también cada hora) | Cambiar los 3 nodos HTTP de Meta |
| **CRM Entrada · Meta** | Recibe mensajes y estados de WhatsApp, los guarda vía CRM y reenvía al bot si la IA está activa | Cambiar el trigger y la función "normalizar" |
| **CRM Bot · plantilla** | Agente con el prompt y las herramientas del cliente. Responde por WhatsApp y guarda la respuesta en el CRM | Cambiar el nodo "Responder por WhatsApp" |

Las reservas siguen usando `n8n_reservation_webhook` (Google Calendar), igual que antes.

## Alta de un cliente nuevo
1. En el CRM → Integraciones → n8n:
   - Webhook Secret: un valor largo y aleatorio.
   - Mensajes, Campañas y Plantillas: la **misma** URL del Gateway del cliente.
   - Proveedor (informativo).
2. Duplica los 3 workflows y renómbralos con el cliente.
3. Edita el nodo de configuración de cada uno: `tenant_id`, secreto, `phone_number_id`, `waba_id` y la URL del bot.
4. Asigna las credenciales del cliente (WhatsApp, OpenAI, Postgres de memoria).
5. Publica. **Meta permite una sola URL de webhook por app**: publica "CRM Entrada" cuando reemplace al enrutador
   que hoy atiende ese número.

## CRM → n8n
Todas las llamadas llevan el header `x-webhook-secret`.

| `action` | Cuándo | Campos |
|---|---|---|
| `send_message` | Un agente escribe en Conversaciones | `tenant_id, conversation_id, contact_id, wa_id, contact_name, message, content_type, media_url, sent_by_name` |
| `reservation_confirmation` | Confirmar una reserva | `tenant_id, reservation_id, contact_id, guest_name, guest_phone, wa_id, reservation_date, reservation_time, party_size` |
| `send_campaign` | Crear o enviar una campaña | `tenant_id, campaign_id, campaign_name, scheduled_at, template{name, language, components}, template_variables, recipients[{campaign_message_id, contact_id, name, wa_id}]` |
| `sync_templates` | Botón "Sincronizar" en Plantillas | `tenant_id` |

n8n responde **202 de inmediato** y trabaja en segundo plano. Responde 401 si el secreto o el tenant no coinciden.

## n8n → CRM: `POST /api/webhooks/n8n`
Header `x-webhook-secret`. Si el tenant tiene secreto configurado, una llamada sin él responde 401.

| `action` | Uso | Campos |
|---|---|---|
| `inbound_message` | Mensaje del cliente | `wa_id, contact_name, wa_message_id, content, content_type, media_url?, media_mime_type?, media_filename?` → responde `{ contact_id, conversation_id, ai_enabled, duplicate }` |
| `message_sent` | Resultado de un envío manual o de reserva | `contact_id, conversation_id?, wa_message_id, content, content_type, sent_by_name, status ('sent' \| 'failed'), error_code?, error_message?` |
| `ai_response` | Respuesta del bot | `contact_id, conversation_id, wa_message_id, content` |
| `message_status` | Recibo del proveedor | `wa_message_id, status ('sent' \| 'delivered' \| 'read' \| 'failed'), error_code?, error_message?` (también actualiza campañas) |
| `campaign_message_status` | Resultado por destinatario de una campaña | `campaign_message_id, wa_message_id, status, error_*` (con `sent`, la plantilla aparece en el chat) |
| `campaign_status` | Opcional | `campaign_id, status ('running' \| 'completed' \| 'cancelled')` |
| `templates_sync` | Lista completa de plantillas del proveedor | `templates[{ id, name, language, category, status, components }]` |

Qué garantiza el CRM:
- **Sin duplicados:** los reintentos con el mismo `wa_message_id` no crean mensajes nuevos.
- **Sin retrocesos de estado:** un "entregado" que llega después de "leído" no lo pisa.
- **Respuestas a campañas:** si un contacto responde, su mensaje de campaña pasa a `replied`.
- **Conversaciones al día:** el resumen y los no leídos los actualizan triggers de la base de datos.

## Pendiente
- **Media entrante** (fotos, audios, documentos): hoy se guarda el tipo y el pie de foto. El archivo lo puede
  descargar el bot con `media_id`. Para verlo en el CRM hay que bajarlo de Meta y subirlo al bucket `chat-media`
  (siguiente paso).
