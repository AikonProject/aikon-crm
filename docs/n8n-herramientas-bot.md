# API del CRM para el agente de IA (n8n)

El bot nunca escribe en Supabase: todo pasa por el CRM, que valida, guarda y deja registro.
- **Consultar** (`get_*`, `list_*`, `search_*`): no cambia nada.
- **Crear / actualizar** (el resto): cada llamada queda en *Configuración → Agente IA → Acciones de la IA* (con motivo y errores) y en la línea de tiempo del contacto ("IA movió el contacto a…").

Autenticación: header `x-webhook-secret` (el mismo secreto del tenant que usa `/api/webhooks/n8n`).
El cliente se identifica con su WhatsApp (`wa_id`, con indicativo) o `contact_id`.

## Opción A (recomendada): un solo nodo MCP
El agente descubre solo todas las herramientas (nombre, para qué sirve y qué datos pide).

1. En el nodo **AI Agent**, agrega la herramienta **MCP Client Tool**.
2. **Endpoint:** `https://crm.aikonintelligence.com/api/mcp/<TENANT_ID>?wa_id={{ $('Webhook').first().json.body.wa_id }}`
   (el `wa_id` en la URL hace que todas las acciones apliquen al cliente del chat).
3. **Server Transport:** HTTP Streamable.
4. **Authentication:** Header Auth → nombre `x-webhook-secret`, valor = el secreto del tenant.
5. **Tools to Include:** All (o elige solo las de lectura para empezar).

## Opción B: un HTTP Request Tool por acción (REST)
- Leer: `GET https://crm.aikonintelligence.com/api/bot/<herramienta>?tenant_id=…&wa_id=…` (o POST).
- Escribir: `POST https://crm.aikonintelligence.com/api/bot/<herramienta>` con body
  `{ "tenant_id": "…", "wa_id": "…", "reason": "…", …parámetros }`.
- Catálogo con los parámetros exactos de cada herramienta (según el plan del negocio): `GET /api/bot?tenant_id=…`.

Respuesta: `{ "ok": true, "summary": "…", "data": {…} }` o `{ "ok": false, "error": "…" }`.
Los errores de datos (etapa que no existe, opción inválida, falta precio) llegan con `ok: false` para que el agente corrija; no inventes valores.

## Herramientas

### Consultar
| Herramienta | Qué devuelve | Parámetros |
|---|---|---|
| `get_contact` | Ficha completa: datos, etapa, etiquetas, campos, notas, deals, pedidos, citas próximas y catálogos válidos | — |
| `list_tags` | Todas las etiquetas del negocio, con `assigned: true` en las que ya tiene el cliente | — |
| `list_stages` | Etapas del funnel en orden, con `current: true` en la del cliente | — |
| `list_custom_fields` | Campos personalizados (clave, nombre, tipo, opciones) con el valor del cliente | — |
| `list_products` | Productos activos con precio | `q?` (buscar), `limit?` |
| `list_team` | Personas del equipo (para asignar) | — |
| `list_appointments` | Citas del cliente (próximas) | `include_past?` |
| `list_deals` | Deals del cliente | — |
| `list_orders` | Pedidos del cliente con sus productos | — |
| `list_notes` | Notas internas sobre el cliente | `limit?` |
| `get_messages` | Últimos mensajes del chat (incluye transcripciones de audios e imágenes) | `limit?` |
| `search_contacts` | Buscar contactos por nombre, teléfono o email | `q` |

### Crear / actualizar
| Herramienta | Qué hace | Parámetros |
|---|---|---|
| `create_contact` | Crea un contacto (ej. un referido). Si el número existe, devuelve el existente | `nombre`, `phone` (con indicativo), `email?` |
| `update_contact` | Nombre, email o cargo del cliente | `nombre?`, `email?`, `job_title?` |
| `add_tags` | **Agrega** etiquetas (no quita). Las que no existen se crean | `tags: ["Interesado maíz"]` |
| `remove_tags` | **Quita** etiquetas (no agrega) | `tags: ["Cliente frío"]` |
| `set_stage` | Mueve al cliente de etapa | `stage` (nombre de `list_stages`) |
| `set_fields` | Guarda campos personalizados (vacío = borrar) | `fields: { "Ciudad": "Bogotá" }` |
| `add_note` | Nota interna para el equipo (no va al cliente) | `content` |
| `create_appointment` | Agenda una cita | `start_time`, `end_time` (ISO con zona, ej. `2026-10-20T15:00:00-05:00`), `meeting_type` (`virtual`/`presencial`/`llamada`), `title?`, `location?`, `meeting_url?`, `notes?` |
| `update_appointment` | Reprograma o confirma | `id` + lo que cambia; `status: "confirmed"` para confirmar |
| `cancel_appointment` | Cancela | `id` |
| `create_deal` | Crea un deal | `name`, `price?` (acepta "950.000"), `currency?` (COP), `quantity?`, `status?`, `notes?` |
| `update_deal` | Actualiza un deal | `id` + `price?`, `status?` (`pending` negociación, `paid` pagado, `completed` entregado, `cancelled` perdido), `notes?` |
| `create_order` | Crea un pedido (precio del catálogo) | `items: [{ product_name, quantity, unit_price? }]`, `discount?`, `notes?` |
| `update_order_status` | Cambia el estado de un pedido | `id`, `status` (`pending, confirmed, preparing, ready, delivered, completed, cancelled`) |
| `assign_contact` | Asigna a una persona sin apagar la IA | `assign_to` (nombre o email) |
| `handoff` | Pasa a humano: apaga la IA, deja el motivo y (opcional) asigna | `reason`, `assign_to?` |

Todas aceptan `reason` (por qué lo hace la IA; queda en el registro).
Los nombres anteriores (`context`, `tags`, `stage`, `fields`, `note`, `appointment`, `deal`, `order`) siguen funcionando.

## Sección para el prompt del sistema
```
## CRM
Tienes herramientas para consultar y actualizar el CRM. Úsalas tú mismo, sin pedir permiso al cliente, para mantener su ficha al día.
- Al empezar, consulta get_contact. Usa siempre nombres que existan (list_stages, list_tags, list_custom_fields, list_products).
- Registra lo que el cliente te cuenta: nombre/email con update_contact, datos como ciudad o cultivo con set_fields, intereses con add_tags.
- Quita etiquetas que ya no apliquen con remove_tags.
- Mueve la etapa con set_stage solo cuando haya un avance real (pidió cotización, pagó, agendó).
- Antes de crear un pedido o una cita, confirma con el cliente productos, cantidades, fecha y hora.
- Al terminar algo importante, deja un resumen con add_note.
- Si pide hablar con una persona, está molesto o no puedes resolverlo, usa handoff con el motivo.
- Si una herramienta responde ok:false, lee el error y corrige; no inventes valores.
- En "reason" explica en una frase por qué haces cada acción.
```
