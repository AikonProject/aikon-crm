# Configuración de autenticación: Clerk ↔ Supabase

El CRM usa Clerk para el login y Supabase como base de datos. Para que el
navegador (chat en tiempo real, contador de no leídos) pueda leer datos, Supabase
debe aceptar el token de sesión de Clerk. Las políticas RLS sacan el tenant del
claim de organización de ese token.

## 1. Activar Clerk como proveedor en Supabase

1. En Clerk: **Dashboard → Configure → Integrations → Supabase** (o
   `https://dashboard.clerk.com/setup/supabase`) → **Activate Supabase integration**.
   Esto agrega el claim `role: "authenticated"` al token. Copia el **Clerk domain**
   que muestra (ej. `xxx.clerk.accounts.dev` o tu dominio de producción).
2. En Supabase (proyecto **CRM-AiKon**): **Authentication → Sign In / Providers →
   Third-Party Auth → Add provider → Clerk** y pega el dominio.
3. Si tienes instancias de Clerk de desarrollo y producción, repite con ambos dominios.

## 2. Webhook de Clerk

1. En Clerk: **Configure → Webhooks → Add Endpoint**.
2. URL: `https://<tu-dominio-del-crm>/api/webhooks/clerk`
3. Eventos:
   - `organization.created`, `organization.updated`
   - `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`
   - `user.created`, `user.updated`, `user.deleted`
4. Copia el **Signing Secret** (`whsec_...`) y guárdalo en Vercel como
   `CLERK_WEBHOOK_SECRET`. Redeploy.

El webhook no es obligatorio para entrar al CRM: si se pierde un evento, el
primer acceso del usuario crea el tenant y su fila en `users` automáticamente.
Sí es necesario para desactivar usuarios cuando los sacas de la organización.

## 3. SQL pendiente

Ejecuta `supabase/migrations/20261002160000_security_hardening.sql` en
**Supabase → SQL Editor**. Cierra RPCs y tablas que hoy se pueden usar con la
llave pública `anon`.

## 4. Super admins

Un usuario es super admin si tiene `publicMetadata.role = "super_admin"` en
Clerk **o** una fila activa en la tabla `super_admins`. La variable
`SUPER_ADMIN_EMAILS` ya no se usa y puedes borrarla de Vercel.

## 5. Planes

`tenants.plan_id → plans` define los módulos de cada tenant
(`plans.features.modules`). Se cambia desde `/admin`. La columna `tenants.plan`
quedó obsoleta.

| Módulo | Rutas |
|---|---|
| `chat` | `/conversations`, `/settings/templates` |
| `campaigns` | `/campaigns` |
| `orders` | `/orders`, `/settings/products` |
| `reservations` | `/reservations` |
| `restaurant` | `/settings/restaurant` |
| `reports` | `/reports` |
| `funnel` | `/funnel` |

Dashboard, contactos y configuración están en todos los planes.

## Cómo probar

1. Entra al CRM con una organización activa.
2. Abre `/conversations` en dos pestañas y envía un mensaje desde una: debe
   aparecer en la otra sin recargar.
3. El badge de no leídos del sidebar debe actualizarse solo.
