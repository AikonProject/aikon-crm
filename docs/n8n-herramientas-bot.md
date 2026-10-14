# Herramientas del CRM para el agente de IA (n8n)

El bot nunca escribe en Supabase. Llama a `POST {crm_url}/api/bot/<herramienta>` y el CRM valida, guarda y deja registro:
- **ai_actions**: auditoría completa de cada llamada (herramienta, datos, resultado, motivo, éxito o error).
- **Línea de tiempo del contacto y del chat**: "IA movió el contacto a…", "IA creó un pedido…".

## Autenticación y datos comunes
- Header `x-webhook-secret`: el mismo secreto del tenant que usa `/api/webhooks/n8n`.
- Body JSON, siempre con:
  - `tenant_id`
  - `contact_id` o `wa_id` (el número del cliente)
  - `conversation_id` (opcional)
  - `reason` (opcional, recomendado): por qué lo hace la IA. Queda en el registro.

**Respuesta:** `{ "ok": true, "summary": "...", "data": {...} }` o `{ "ok": false, "error": "..." }`.
Los errores de datos (etapa que no existe, opción inválida, falta precio) llegan con HTTP 200 y `ok: false`, así el agente lee el mensaje y corrige. Solo los fallos del servidor devuelven 500.

Las herramientas de módulos que el plan no incluye responden "El plan de este negocio no incluye el módulo …".

## Herramientas

| Herramienta | Para qué | Campos |
|---|---|---|
| `context` | Leer todo antes de actuar: datos del contacto, etapa, etiquetas, campos, notas, deals, pedidos, citas próximas y catálogos (etapas, etiquetas, campos con sus opciones, productos) | — (también `GET /api/bot/context?tenant_id=…&wa_id=…`) |
| `update_contact` | Datos que dio el cliente | `nombre?`, `email?`, `job_title?` |
| `tags` | Agregar o quitar etiquetas por nombre. Las que no existen se crean, salvo con `create_missing: false` | `add: ["Interesado maíz"]`, `remove: ["Frío"]` |
| `stage` | Mover en el funnel (nombre de la etapa, sin importar tildes ni mayúsculas) | `stage: "Cotización enviada"` |
| `fields` | Campos personalizados por clave o etiqueta. Vacío = borrar. Las listas validan contra sus opciones | `fields: { "Ciudad": "Bogotá", "plan": "Pro" }` |
| `note` | Nota interna (no va a WhatsApp): sale en el chat como "Nota de la IA" y en las notas del contacto | `content` |
| `appointment` | Crear cita; con `id`, reprogramar, confirmar o cancelar | `title?`, `start_time`, `end_time` (ISO con zona, ej. `2026-10-20T15:00:00-05:00`), `meeting_type` (`virtual`/`presencial`/`llamada`), `location?`, `meeting_url?`, `notes?`, `status?` (`scheduled`/`confirmed`/`cancelled`…), `id?` |
| `deal` | Crear oportunidad; con `id`, actualizarla | `name`, `price?` (acepta "950.000"), `currency?` (COP por defecto), `quantity?`, `status?` (`pending` en negociación, `paid` pagado, `completed` entregado, `cancelled` perdido), `notes?`, `id?` |
| `order` | Crear pedido; con `id` + `status`, cambiar su estado | `items: [{ product_name o product_id, quantity, unit_price? }]` (sin `unit_price` toma el precio del catálogo), `discount?`, `notes?` · estados: `pending, confirmed, preparing, ready, delivered, completed, cancelled` |
| `handoff` | Pasar a una persona: apaga la IA del contacto y su chat, asigna (opcional) y deja la razón como nota | `reason`, `assign_to?` (nombre o email del agente) |

## Cómo conectarlas en el bot de n8n

En el nodo **AI Agent**, agrega un **HTTP Request Tool** por cada herramienta que quieras darle. Ejemplo para `tags`:

- **Description** (la lee el modelo): `Agrega o quita etiquetas del cliente en el CRM. Úsala cuando el cliente muestre interés en un producto o cambie su situación.`
- **Method:** POST
- **URL:** `{{ $('Configuración').first().json.crm_url }}/api/bot/tags`
- **Headers:** `x-webhook-secret` = `{{ $('Configuración').first().json.webhook_secret }}`
- **Body (JSON):**
```
{
  "tenant_id": "{{ $('Configuración').first().json.tenant_id }}",
  "wa_id": "{{ $('Webhook').first().json.body.wa_id }}",
  "conversation_id": "{{ $('Webhook').first().json.body.conversation_id }}",
  "add": {{ $fromAI('add', 'Etiquetas a agregar, lista de textos', 'json') }},
  "remove": {{ $fromAI('remove', 'Etiquetas a quitar, lista de textos (puede ser [])', 'json') }},
  "reason": "{{ $fromAI('reason', 'Por qué', 'string') }}"
}
```

Cambia la ruta y los `$fromAI` según la tabla:
- **stage:** `"stage": "{{ $fromAI('stage', 'Nombre exacto de la etapa', 'string') }}"`
- **fields:** `"fields": {{ $fromAI('fields', 'Objeto { campo: valor }', 'json') }}`
- **note:** `"content": "{{ $fromAI('content', 'Resumen para el equipo', 'string') }}"`
- **appointment:** `"title"`, `"start_time"`, `"end_time"`, `"meeting_type"` con `$fromAI`. Dale al agente la fecha y hora actuales en el prompt.
- **order:** `"items": {{ $fromAI('items', 'Lista [{product_name, quantity}] usando nombres del catálogo', 'json') }}`
- **handoff:** `"reason": "{{ $fromAI('reason', 'Motivo de la transferencia', 'string') }}"`

Una herramienta `context` (GET o POST, sin `$fromAI`) le da al agente las etapas, etiquetas, campos y productos válidos. Llámala al empezar la conversación o antes de hacer cambios.

## Sección para el prompt del sistema
```
## Herramientas del CRM
- Antes de cambiar algo en el CRM, consulta "context" para conocer las etapas, etiquetas, campos y productos válidos.
- Usa los nombres tal como aparecen en el catálogo. Si una herramienta responde ok:false, lee el error y corrige; no inventes valores.
- Registra en el CRM lo que el cliente te dice (nombre, email, ciudad, interés) con update_contact, fields y tags.
- Mueve la etapa del funnel solo cuando haya un avance real (pidió cotización, pagó, agendó).
- Crea pedidos o citas solo después de confirmar con el cliente los productos, cantidades, fecha y hora.
- Si el cliente pide hablar con una persona, está molesto o pide algo que no puedes resolver, usa handoff con el motivo.
- En "reason" explica en una frase por qué haces cada acción.
```
