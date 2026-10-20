# Contrato CRM ↔ n8n

## Principios
1. **El CRM es el único que escribe en Supabase.** n8n no necesita llaves de la base de datos: todo lo que pasa en
   WhatsApp se reporta a `POST https://crm.aikonintelligence.com/api/webhooks/n8n`.
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
| `send_message` | Un agente escribe en Conversaciones | `tenant_id, conversation_id, contact_id, wa_id, contact_name, message, content_type, media_url, media_filename, sent_by_name, template, template_variables, template_header ({ format, url } si la plantilla tiene imagen/video/PDF)` |
| `reservation_confirmation` | Confirmar una reserva | `tenant_id, reservation_id, contact_id, guest_name, guest_phone, wa_id, reservation_date, reservation_time, party_size` |
| `send_campaign` | Crear o enviar una campaña | `tenant_id, campaign_id, campaign_name, scheduled_at, template{name, language, components}, template_variables, recipients[{campaign_message_id, contact_id, name, wa_id, variables}]` → `recipients[].variables` trae el valor final de cada `{{variable}}` para ese contacto (su nombre, teléfono, campo personalizado o texto fijo). Úsalo en lugar de `template_variables`, que queda con el mismo valor para todos (texto fijo o el respaldo) |
| `sync_templates` | Botón "Sincronizar" en Plantillas | `tenant_id` |
| `create_template` | "Nueva plantilla" en Plantillas | `tenant_id, template_id, name, language, category, components` (HEADER opcional: TEXT, o IMAGE/VIDEO/DOCUMENT con `example.header_url`; BODY con `example.body_text`; FOOTER opcional), `header_format`, `header_media_url` → n8n la crea en el proveedor y responde con `template_created` |

**Plantillas desde el chat:** cuando `content_type = 'template'`, `template = { name, language, components }` y
`template_variables = { "1": "Ana", ... }`. `message` trae el texto ya renderizado (para guardarlo en el chat).
El Gateway debe enviar un mensaje tipo `template` al proveedor (no texto), con los parámetros del BODY en orden
numérico, y reportar `message_sent` con `template_name` y el `content` renderizado. Es la única forma de escribir
cuando la ventana de 24 h está cerrada.

```js
// Nodo "Construir mensaje" del Gateway (Code)
const d = $json.body ?? $json;
if (d.content_type === 'template' && d.template) {
  const vars = d.template_variables ?? {};
  const params = Object.keys(vars).sort((a, b) => Number(a) - Number(b))
    .map((k) => ({ type: 'text', text: String(vars[k]) }));
  return [{ json: { ...d, wa_payload: {
    messaging_product: 'whatsapp', to: d.wa_id, type: 'template',
    template: { name: d.template.name, language: { code: d.template.language },
      components: params.length ? [{ type: 'body', parameters: params }] : [] },
  } } }];
}
return [{ json: { ...d, wa_payload: { messaging_product: 'whatsapp', to: d.wa_id, type: 'text', text: { body: d.message } } } }];
```

n8n responde **202 de inmediato** y trabaja en segundo plano. Responde 401 si el secreto o el tenant no coinciden.

## n8n → CRM: `POST /api/webhooks/n8n`
Header `x-webhook-secret`. Si el tenant tiene secreto configurado, una llamada sin él responde 401.

| `action` | Uso | Campos |
|---|---|---|
| `inbound_message` | Mensaje del cliente | `wa_id, contact_name, wa_message_id, content, content_type, media_url?, media_mime_type?, media_filename?, button_text?, button_payload?` → responde `{ message_id, contact_id, conversation_id, ai_enabled, button_handled, duplicate }`. Para fotos, audios y documentos, `content` lleva una etiqueta en la primera línea y debajo la transcripción o descripción (ver [n8n-media-y-buffer.md](n8n-media-y-buffer.md)). Si el cliente pulsó un botón de respuesta rápida, envía `button_text` (y `button_payload` si viene): el CRM ejecuta las acciones configuradas en la plantilla (respuesta automática, etiquetas, etapa, IA, asignación). Si ya respondió, `ai_enabled` llega en `false` para que el bot no conteste también. |
| `media_upload_url` | Antes de guardar un archivo del cliente | `mime_type, filename?` → responde `{ upload_url, public_url, path, max_bytes }`. n8n sube el archivo con `PUT upload_url` (cuerpo = binario, header `Content-Type`) y manda `public_url` como `media_url` en `inbound_message` |
| `claim_pending` | Buffer: el bot, tras esperar unos segundos, reclama los mensajes sin responder | `conversation_id, message_id` → responde `{ is_latest, ai_enabled, count, messages[], text }`. Si `is_latest` es `false` llegó otro mensaje después y esa ejecución se detiene; si no, `text` trae todos los mensajes pendientes juntos |
| `message_sent` | Resultado de un envío manual o de reserva | `contact_id, conversation_id?, wa_message_id, content, content_type, sent_by_name, template_name?, status ('sent' \| 'failed'), error_code?, error_message?` (con `failed`, el chat muestra el error al agente) |
| `ai_response` | Respuesta del bot | `contact_id, conversation_id, wa_message_id, content, content_type?, media_url?, media_mime_type?, media_filename?` (para que una foto o PDF que envía el bot se vea en el chat) |
| `message_status` | Recibo del proveedor | `wa_message_id, status ('sent' \| 'delivered' \| 'read' \| 'failed'), error_code?, error_message?` (también actualiza campañas) |
| `campaign_message_status` | Resultado por destinatario de una campaña | `campaign_message_id, wa_message_id, status, error_*` (con `sent`, la plantilla aparece en el chat) |
| `campaign_status` | Opcional | `campaign_id, status ('running' \| 'completed' \| 'cancelled')` |
| `ai_note` | Nota interna de la IA (resumen, intención, datos capturados). No va a WhatsApp | `contact_id, conversation_id?, content` → aparece en el chat como "Nota de la IA" y en el panel lateral |
| `activity` | Acción a registrar en la línea de tiempo (p. ej. "IA transfirió a humano") | `contact_id, activity_type, description, performed_by_name? (por defecto 'IA'), metadata?` |
| `appointment` | El bot agenda, reprograma, confirma o cancela una cita (planes con módulo Citas) | `appointment: { id? (si viene, actualiza), contact_id? \| contact_phone?, title?, start_time, end_time (ISO), meeting_type ('virtual' \| 'presencial' \| 'llamada'), meeting_url?, location?, contact_name?, contact_email?, status ('scheduled' \| 'confirmed' \| 'completed' \| 'cancelled' \| 'no_show'), notes?, description? }` → responde `{ appointment }`. Si no hay `contact_id`, busca o crea el contacto por `contact_phone` |
| `template_created` | Resultado de `create_template` | `template_id, meta_id?, status ('PENDING' \| 'APPROVED' \| 'REJECTED'), error_message?` (con `error_message` queda rechazada y el CRM muestra el motivo) |
| `templates_sync` | Lista completa de plantillas del proveedor | `templates[{ id, name, language, category, status, components }]` |

Qué garantiza el CRM:
- **Sin duplicados:** los reintentos con el mismo `wa_message_id` no crean mensajes nuevos.
- **Sin retrocesos de estado:** un "entregado" que llega después de "leído" no lo pisa.
- **Respuestas a campañas:** si un contacto responde, su mensaje de campaña pasa a `replied`.
- **Conversaciones al día:** el resumen y los no leídos los actualizan triggers de la base de datos.

## Herramientas del agente de IA
El bot consulta y edita el CRM (contactos, etiquetas, etapa, campos, notas, citas, deals, pedidos, transferir a humano) con `/api/bot/<herramienta>` (REST) o el servidor MCP `/api/mcp/<tenant_id>`. Guía: [n8n-herramientas-bot.md](n8n-herramientas-bot.md).

## Archivos y buffer
Guía paso a paso y nodos: [n8n-media-y-buffer.md](n8n-media-y-buffer.md).
- Los archivos viven en el bucket `chat-media` bajo `<tenant>/inbound/<año-mes>/`. Cada noche se borran los que superan la
  retención del tenant (Configuración → Archivos, 90 días por defecto). El mensaje queda con su transcripción.
- Variable de entorno en Vercel: `CRON_SECRET` (cualquier texto largo) para la limpieza diaria.
