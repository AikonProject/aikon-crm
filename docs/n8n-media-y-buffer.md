# Archivos del cliente y buffer de mensajes (n8n)

Dos cambios en los workflows de cada cliente:

1. **Entrada**: cuando el cliente manda audio, imagen o documento, n8n descarga el archivo, lo sube al CRM y
   genera la transcripción o descripción. Guarda todo en `inbound_message`. Así el agente lo ve en el chat y la IA lo entiende.
2. **Bot**: espera unos segundos y reclama todos los mensajes sin responder (`claim_pending`). Si el cliente
   escribe 3 mensajes seguidos, la IA responde una sola vez a los 3.

Nombres usados abajo (cámbialos por los de tu workflow): `CONFIG` (crm_url, tenant_id, webhook_secret),
`Normalizar` (el nodo que deja el mensaje en campos planos) y `Guardar en CRM` (el HTTP que llama a `inbound_message`).

---

## 1. Workflow de entrada

### Campos que debe dejar `Normalizar`
| Campo | YCloud (`whatsappInboundMessage`) | Meta (`messages[0]`) |
|---|---|---|
| `content_type` | `type` | `type` |
| `content` | `text.body` o el `caption` del archivo | `text.body` o `caption` |
| `media_link` | `image.link` / `audio.link` / `document.link` / `video.link` | (no hay link: ver nota Meta) |
| `media_id` | `<tipo>.id` | `<tipo>.id` |
| `media_mime_type` | `<tipo>.mime_type` | `<tipo>.mime_type` |
| `media_filename` | `document.filename` | `document.filename` |

### Nodos nuevos (entre `Normalizar` y `Guardar en CRM`)

```
Normalizar → ¿Tiene archivo? ─sí→ Descargar archivo → Subir archivo al CRM → Tipo de archivo ┬ audio     → Transcribir audio ┐
                           │                                                                  ├ image     → Describir imagen  ├→ Armar contenido → Guardar en CRM
                           │                                                                  ├ document  → Leer PDF          │
                           │                                                                  └ (otro)    ────────────────────┘
                           └no→ Guardar en CRM (como hoy)
```

**¿Tiene archivo?** (IF): `{{ ['image','audio','video','document','sticker'].includes($json.content_type) && !!($json.media_link || $json.media_id) }}` es verdadero.

**Descargar archivo** (HTTP Request)
- GET `{{ $json.media_link }}`
- Authentication: *Generic → Header Auth* → la credencial de YCloud (la misma de los envíos, `X-API-Key`).
- Options → Response → Response Format: **File** (campo `data`).
- Settings → On Error: *Continue (using error output)*. Conecta la salida de error a `Guardar en CRM` para que el mensaje
  se guarde aunque el archivo no baje.

> **Meta**: son dos pasos. `GET https://graph.facebook.com/v21.0/{{ $json.media_id }}` (con el token) devuelve `url`;
> luego `GET {{ $json.url }}` con el mismo token y Response Format **File**.

**Subir archivo al CRM** (Code, *Run Once for All Items*, JavaScript)
```js
const cfg = $('CONFIG').first().json;
const items = $input.all();
const out = [];
for (let i = 0; i < items.length; i++) {
  const d = $('Normalizar').all()[i]?.json ?? $('Normalizar').first().json;
  const bin = items[i].binary?.data;
  const mime = String(bin?.mimeType || d.media_mime_type || 'application/octet-stream').split(';')[0];
  const buffer = await this.helpers.getBinaryDataBuffer(i, 'data');

  const up = await this.helpers.httpRequest({
    method: 'POST',
    url: `${cfg.crm_url}/api/webhooks/n8n`,
    headers: { 'x-webhook-secret': cfg.webhook_secret },
    body: { action: 'media_upload_url', tenant_id: cfg.tenant_id, mime_type: mime, filename: d.media_filename || bin?.fileName },
    json: true,
  });

  let media_url = null;
  if (buffer.length <= up.max_bytes) {
    await this.helpers.httpRequest({ method: 'PUT', url: up.upload_url, body: buffer, headers: { 'Content-Type': mime } });
    media_url = up.public_url;
  }

  out.push({
    json: {
      ...d,
      media_url,
      media_mime_type: mime,
      // the image description request needs the file as a data URL
      image_data_url: d.content_type === 'image' ? `data:${mime};base64,${buffer.toString('base64')}` : undefined,
    },
    binary: items[i].binary,
  });
}
return out;
```

**Tipo de archivo** (Switch, Rules sobre `{{ $json.content_type }}`): `audio`, `image`, `document` y salida *Fallback* (video, sticker…).
Para `document` agrega la condición `{{ $json.media_mime_type }}` = `application/pdf`; los Word/Excel van al fallback.

**Transcribir audio** (HTTP Request)
- POST `https://api.openai.com/v1/audio/transcriptions`
- Authentication: *Predefined Credential Type → OpenAI*
- Body: **Form-Data**
  - `file` → tipo *n8n Binary File*, Input Data Field Name `data`
  - `model` → `gpt-4o-mini-transcribe`
  - `language` → `es`
- On Error: *Continue*. Responde `{ text }`.

**Describir imagen** (HTTP Request)
- POST `https://api.openai.com/v1/chat/completions`, misma credencial OpenAI
- Body: JSON, *Using JSON*:
```
={{ JSON.stringify({
  model: 'gpt-4o-mini',
  max_tokens: 350,
  messages: [{ role: 'user', content: [
    { type: 'text', text: 'Un cliente envió esta imagen por WhatsApp a un negocio. Descríbela en español en 2 a 4 frases. Si tiene texto (precios, referencias, comprobante de pago, dirección, números), transcríbelo exacto.' },
    { type: 'image_url', image_url: { url: $json.image_data_url } }
  ] }]
}) }}
```
- On Error: *Continue*.

**Leer PDF** (Extract From File → *Extract From PDF*, Input Binary Field `data`). Responde `{ text }`. On Error: *Continue*.

**Armar contenido** (Code, *Run Once for All Items*). Las cuatro salidas del Switch se conectan aquí.
```js
const d = $('Subir archivo al CRM').first().json;
const r = $input.first().json ?? {};
const caption = String(d.content || '').trim();
const withCaption = (t) => (caption ? `Texto del cliente: ${caption}\n${t}` : t);

let label = null;
let body = caption;
switch (d.content_type) {
  case 'audio':
    label = 'Nota de voz del cliente (transcripción automática)';
    body = String(r.text || '').trim();
    break;
  case 'image':
    label = 'Imagen enviada por el cliente (descripción automática)';
    body = withCaption(String(r.choices?.[0]?.message?.content || '').trim());
    break;
  case 'document':
    label = `Documento enviado por el cliente: ${d.media_filename || 'archivo'}`;
    body = withCaption(String(r.text || '').replace(/\s+\n/g, '\n').trim().slice(0, 4000));
    break;
  case 'video':
    label = 'Video enviado por el cliente (no se analiza el contenido)';
    break;
  case 'sticker':
    label = 'Sticker enviado por el cliente';
    break;
}
if (label && !body) body = '(no se pudo leer el contenido)';

const { image_data_url, ...rest } = d;
return [{ json: { ...rest, content: label ? `[${label}]\n${body}` : body } }];
```

**Guardar en CRM**: agrega al body `media_url: {{ $json.media_url }}`, `media_mime_type`, `media_filename` (ya los tiene si
usas los mismos nombres). `content` ahora llega con la etiqueta.

**Enviar al bot**: además de lo que ya manda, agrega
`message_id: {{ $('Guardar en CRM').item.json.message_id }}` y `conversation_id: {{ $('Guardar en CRM').item.json.conversation_id }}`.

---

## 2. Workflow del bot (buffer)

```
Webhook → Esperar (8 s) → Reclamar mensajes → ¿Responder? ─sí→ Agente IA → (envío y ai_response como hoy)
                                                        └no→ (fin)
```

**Esperar** (Wait): *After Time Interval*, 8 segundos.

**Reclamar mensajes** (HTTP Request)
- POST `{{ $('CONFIG').first().json.crm_url }}/api/webhooks/n8n`
- Header `x-webhook-secret`: `{{ $('CONFIG').first().json.webhook_secret }}`
- Body JSON:
```
={{ JSON.stringify({
  action: 'claim_pending',
  tenant_id: $('CONFIG').first().json.tenant_id,
  conversation_id: $('Webhook').first().json.body.conversation_id,
  message_id: $('Webhook').first().json.body.message_id
}) }}
```

**¿Responder?** (IF): `{{ $json.is_latest && $json.ai_enabled && $json.count > 0 }}` es verdadero.

**Agente IA**: el mensaje del usuario pasa a ser `{{ $('Reclamar mensajes').first().json.text }}` (todos los mensajes
pendientes, separados por una línea en blanco). La memoria sigue con la misma clave (`wa_id`).

Cómo funciona: cada mensaje dispara una ejecución del bot. Todas esperan 8 s; solo sigue la del **último** mensaje
(`is_latest`). Las demás terminan sin responder. Si el agente humano ya contestó o la IA está apagada, no responde.

---

## 3. Sección para el prompt del sistema

```
## Mensajes que no son texto
Algunos mensajes del cliente empiezan con una etiqueta entre corchetes, por ejemplo:
[Nota de voz del cliente (transcripción automática)]
[Imagen enviada por el cliente (descripción automática)]
[Documento enviado por el cliente: cotizacion.pdf]
- El texto debajo de la etiqueta NO lo escribió el cliente: es una transcripción o descripción automática de lo que envió.
- Responde a lo que el cliente quiso decir o mostrar, con naturalidad ("Vi la foto del producto…", "Escuché tu audio…").
  No menciones que hubo una transcripción automática.
- Si la transcripción parece incompleta o la descripción no alcanza para responder, pide amablemente que lo escriba o lo aclare.
- "(no se pudo leer el contenido)" significa que no se pudo procesar el archivo: pide al cliente que lo escriba.
- Varios mensajes seguidos llegan juntos, separados por una línea en blanco: respóndelos en un solo mensaje.
```
