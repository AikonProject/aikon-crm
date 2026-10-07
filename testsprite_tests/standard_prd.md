# Aikon CRM: PRD para TestSprite

## Producto
CRM multi-tenant que una agencia (Aikon) entrega a sus clientes. Cada cliente es una
**organización de Clerk** que se mapea a un `tenant` en Supabase. Por detrás, **n8n**
conecta la API de WhatsApp Cloud con un bot de IA. El frontend es Next.js 16 (App Router)
alojado en Vercel.

- Autenticación: Clerk (`/sign-in`, `/sign-up`). Todas las rutas son privadas menos
  `/sign-in`, `/sign-up`, `/api/public/*`, `/api/webhooks/*` y la página pública de reservas `/{slug}`.
- Si el usuario no tiene una organización activa en Clerk, el CRM no carga.

## Tipos de negocio y planes
El plan (`tenants.plan_id → plans.features.modules`) decide qué módulos se ven.
Si una ruta no está en el plan, el layout redirige a `/dashboard` y el ítem desaparece del sidebar.
Las APIs del módulo responden **403**.

| Plan | Tipo | Módulos |
|---|---|---|
| `crm_basic` (CRM Básico) | Servicios/productos | chat, contacts, funnel |
| `crm_pro` (CRM Pro) | Servicios/productos | chat, contacts, funnel, campaigns, orders, reports |
| `restaurant_basic` (Restaurante Básico) | Restaurante | chat, contacts, funnel, reservations, restaurant |
| `restaurant_pro` (Restaurante Pro) | Restaurante | todos los anteriores |

| Módulo | Rutas |
|---|---|
| chat | `/conversations`, `/settings/templates` |
| campaigns | `/campaigns`, `/campaigns/new` |
| orders | `/orders`, `/orders/{id}`, `/settings/products` |
| reservations | `/reservations`, `/reservations/calendar` |
| restaurant | `/settings/restaurant` |
| reports | `/reports` |
| funnel | `/funnel`, `/funnel/settings` |
| (todos los planes) | `/dashboard`, `/contacts`, `/contacts/{id}`, `/settings`, `/settings/ai`, `/settings/integrations` |
| super admin | `/admin` (solo usuarios con `publicMetadata.role = super_admin`) |

## Funcionalidades por pantalla

### Dashboard (`/dashboard`)
Métricas: contactos, conversaciones activas, pedidos de hoy, ingresos del mes y reservas de hoy (solo restaurante).
Accesos rápidos: "Nuevo Pedido", "Ver Conversaciones" y otros. Lista de pedidos recientes y reservas de hoy.

### Contactos (`/contacts`, `/contacts/{id}`)
- Tabla con búsqueda, filtro por etapa del funnel ("Todos" + una pestaña por etapa) y selección.
- "Nuevo contacto" (diálogo), "Importar CSV", "Exportar CSV" (`/api/contacts/export`).
- Detalle: editar contacto, activar o desactivar la IA para el contacto, botones "Llamar" y "Email",
  pestañas con notas, etiquetas, campos personalizados, conversación y deals.

### Conversaciones (`/conversations`)
Bandeja estilo WhatsApp con filtros Todos, Abiertos, Pendientes y Resueltos. Al abrir una conversación
se ven los mensajes. Permite enviar un mensaje (el CRM llama al webhook de n8n `n8n_send_message_webhook`),
enviar una plantilla, dejar una nota interna, activar o desactivar la IA de la conversación y cambiar el estado.
Hay tiempo real con Supabase y un badge de no leídos en el sidebar.

### Funnel (`/funnel`, `/funnel/settings`)
Kanban de deals con arrastrar y soltar entre etapas, "Nuevo Deal", "Agregar contacto" por etapa y
"Gestionar etapas" (crear, renombrar, reordenar arrastrando, color, ganada o perdida, eliminar).

### Productos y Ventas (`/settings/products`, `/orders`)
- Productos: pestañas Productos y Categorías, con CRUD y precio, stock e imagen.
- Ventas: lista de pedidos con filtros por estado (Pendiente, Confirmado, En preparación, Listo,
  Entregado, Completado, Cancelado), crear pedido, detalle `/orders/{id}` con cambio de estado y estadísticas.

### Plantillas (`/settings/templates`)
Plantillas de WhatsApp (Aprobada, Pendiente, Rechazada), sincronizar con Meta y crear plantillas.

### Campañas (`/campaigns`, `/campaigns/new`)
Asistente de 3 pasos: plantilla, segmento (etapa del funnel u origen, con conteo de contactos) y
programación ("Enviar ahora" o "Programar"). La lista muestra las métricas enviados, entregados, leídos y fallidos.

### Reservas (`/reservations`, `/reservations/calendar`)
Lista con filtros por estado, "Nueva reserva", detalle lateral con cambio de estado (Pendiente, Confirmada,
En mesa, Completada, No se presentó, Cancelada) y confirmación. Vista de calendario mensual.

### Restaurante (`/settings/restaurant`)
Pestañas Horarios, Mesas, Menús, Eventos y Página de reservas (imagen de fondo, textos), cada una con CRUD.

### Página pública de reservas (`/{slug}`, sin login)
El cliente final ve la información del restaurante, elige fecha, hora y personas (y mesa o espacio si está
configurado), deja sus datos y crea la reserva (`POST /api/public/{slug}/reservations`). Al final se muestra el menú.

### Configuración (`/settings`)
Pestañas General (nombre, slug, logo), Equipo (lista e "Invitar usuario"), Etiquetas, Campos personalizados,
Respuestas rápidas y Etapas del Funnel. Subpáginas: `/settings/ai` (prompt, tono, longitud y herramientas del bot)
y `/settings/integrations` (credenciales de WhatsApp, Meta y webhooks de n8n).

### Admin (`/admin`)
Solo super admin: lista de tenants, cambiar el plan, activar o desactivar tenants y gestionar usuarios.

## Integraciones (backend)
- `POST /api/webhooks/whatsapp`: Meta envía los mensajes entrantes y los estados. `GET` hace la verificación `hub.challenge`.
- `POST /api/webhooks/n8n`: n8n confirma con las acciones `message_sent`, `message_status`, `ai_response` y `buffer_processed`.
  Header `x-webhook-secret`.
- `POST /api/webhooks/clerk`: sincroniza organizaciones y usuarios (firma svix).
