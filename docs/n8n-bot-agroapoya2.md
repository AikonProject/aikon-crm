# Bot Agroapoya2 en el CRM (n8n)

Flujo: [`docs/n8n/crm-bot-agroapoya2.json`](n8n/crm-bot-agroapoya2.json). Reemplaza al bot de ManyChat y mantiene su lógica:
router Jev, tres agentes (Ventas, Embajadores, Posventa), plantillas sin LLM y post-proceso. Ya no usa ManyChat, Redis
ni las tablas `bot_estado` y `n8n_chat_histories_aa2`.

```
Entrada (enrutador: guarda en el CRM, transcribe audio/imagen/video)
   └─► Mensaje del CRM → CONFIG → Esperar 8 s → Reclamar mensajes (buffer del CRM) → ¿Responder?
        → Contexto del contacto + Historial (CRM) → Oferta + Productos (Sheets) → Catálogo → Mensaje para la ia
        → Router Jev → Decidir ruta → Ventas | Embajadores | Posventa | Plantilla
        → Post-proceso → Enviar por WhatsApp (YCloud) → Guardar respuesta en el CRM
             ├─► ¿Hay fotos? → Enviar foto → Guardar foto en el CRM
             ├─► ¿Cambió el carril? → set_fields carril
             └─► Jev CRM → Acciones para el CRM → /api/bot/<tool> (etapa y etiquetas)
```

## Qué cambió respecto al bot de ManyChat
| Antes | Ahora |
|---|---|
| Redis (`_buffer`, push/get/delete y Switch de 10 s) | `claim_pending` del CRM: solo responde la ejecución del último mensaje; si un humano ya respondió o apagó la IA, no responde |
| Descargar y analizar audio/imagen en el bot | Lo hace el flujo de Entrada; el texto llega listo |
| `n8n_chat_histories_aa2` (memoria Postgres) | Historial del CRM (`get_messages`), que incluye lo que escribió una persona del equipo |
| `bot_estado` (carril, localidad) | Campos del CRM: `carril`, `localidad_entrega`, `direccion_entrega`, `barrio`, `primera_compra` |
| `setCustomField` + `sendFlow` de ManyChat | YCloud `sendDirectly` + `ai_response` (la respuesta aparece en el chat del CRM) |
| Tool `humano` (etiqueta ManyChat) | `handoff` del CRM: apaga la IA en ese chat y avisa al equipo |
| `enviar_imagen` (campo ManyChat) | El agente escribe `[IMAGEN: producto]`; el flujo envía la foto de la columna `Imagen` de la hoja |

## Puesta en marcha
1. Importa el JSON en el n8n de Agroapoya2.
2. **CONFIG**: pon `ycloud_from` (número de WhatsApp en YCloud). `webhook_secret` va vacío mientras el tenant no tenga secreto.
3. **Enviar por WhatsApp** y **Enviar foto**: credencial *Header Auth* de YCloud (nombre `X-API-Key`).
4. Revisa las credenciales de Gemini, Google Sheets y Jev (son las mismas del bot actual).
5. En el flujo de Entrada, `bot_webhook_url` = URL de producción del nodo **Mensaje del CRM** (`/webhook/crm/bot/agroapoya2`).
6. Opcional: agrega una columna `Imagen` (URL pública) a la hoja de productos para que el bot mande fotos.
7. Publica y apaga el bot de ManyChat para ese número.

## Agente Embajadores
Atiende a embajadores ya registrados (etiqueta `Embajador`, sincronizada desde Apoya2):
- Les da la oferta activa (hoja "Información Oferta" + catálogo) y les arma un mensaje listo para reenviar con su link único.
- Usa sus datos del CRM: `link_referido`, `clientes_referidos`, `localidad`, `fecha_registro_apoya2`.
- Les explica comisiones, el descuento propio, la primicia de 24 horas y cómo cobrar (según los términos).
- Ante pagos que no llegan, compras no contadas o cambios de datos: deja una nota y hace handoff.

En **CONFIG** completa `grupo_embajadores_url` (link de invitación al grupo de WhatsApp) y, si quieres, `embajadores_soporte`.
Sin link de grupo, el bot no lo inventa: dice que alguien del equipo se lo envía.
El router manda a este agente las preguntas de un embajador sobre la oferta *para compartir*; si compra para su casa, va a Ventas.

## Cómo ajustar
- **Router (qué agente responde)**: `Armar router Jev` (criterios) y `Decidir ruta` (umbrales y seguros con código).
- **Etapa y etiquetas automáticas**: `Armar Jev CRM` (preguntas) y `Acciones para el CRM` (reglas). Cada item que sale es
  una llamada a `/api/bot/<tool>`; por ejemplo, para marcar VIP:
  `out.push({ tool: 'add_tags', body: { ...base, tags: ['VIP'], reason: '...' } })`.
  La etapa solo avanza; para cerrar (ganado o perdido) Jev necesita 85 % de confianza.
- **Acciones que decide el agente** (deal del pedido, datos del cliente, handoff): nodos `CRM · <agente>` (MCP Client).
  En *Tools to Include* eliges qué herramientas ve cada agente.
- **Pedidos**: el plan del tenant no incluye el módulo Pedidos. Cada pedido queda como *deal* (`create_deal`) en el embudo,
  además de la hoja de Google.
