# Pruebas con TestSprite

Archivos de esta carpeta:

| Archivo | Para qué |
|---|---|
| `standard_prd.md` | Describe el producto, los planes y las pantallas. Se le da a TestSprite como PRD. |
| `testsprite_frontend_test_plan.json` | 42 casos de UI (botones, flujos y acceso según el plan). |
| `testsprite_backend_test_plan.json` | 13 casos de API (401 y 403 por plan, webhooks, aislamiento entre tenants). |
| `../docs/auditoria-funcional.md` | Huecos ya detectados en el código. Cada uno apunta a su caso de prueba. |

## 1. Clave de API (nunca en el repo)

La clave se lee de la variable `TESTSPRITE_API_KEY` (ver `../.mcp.json`):

```bash
export TESTSPRITE_API_KEY="sk-user-..."   # en tu terminal, o como secreto del entorno
```

## 2. Cuentas de prueba (una por plan)

TestSprite entra por `/sign-in` (Clerk). Crea un usuario de prueba **con contraseña** (sin 2FA ni login social)
en cada organización:

| Organización | Plan | Uso |
|---|---|---|
| Sebastian's Organization | `crm_basic` | acceso restringido, dashboard sin ventas |
| CRM Prueba | `crm_pro` | productos, ventas, campañas, reportes |
| Salario de Zipa | `restaurant_basic` | reservas, restaurante, página pública `/salario-de-zipa` |
| AiKon Restaurant | `restaurant_pro` | todo, envío de mensajes (tiene webhook de n8n) |
| (tu usuario) | super_admin | `/admin` |

> Recomendado: usar la instancia **de desarrollo** de Clerk o un preview de Vercel, porque las pruebas crean y borran datos
> (contactos "TS Prueba", productos "TS Producto"…).

## 3. Ejecutar

### Opción A: desde Claude Code o Cursor (MCP)
1. `npm install` y luego `npm run dev` (necesitas `.env.local` con las claves de Clerk y Supabase), **o** apunta al preview de Vercel.
2. Con `TESTSPRITE_API_KEY` exportada, abre el proyecto. `.mcp.json` registra el servidor `TestSprite`.
3. Pide: *"Ayúdame a probar este proyecto con TestSprite"*. Cuando pregunte, indica:
   - tipo: `frontend` (y luego `backend`), puerto `3000` o la URL del preview,
   - alcance: `codebase`,
   - las credenciales de la cuenta del plan que vas a probar,
   - el PRD: `testsprite_tests/standard_prd.md`.
4. TestSprite genera su propio plan en `testsprite_tests/tmp/`. Puedes sustituirlo o completarlo con los JSON de esta carpeta.

### Opción B: portal web (testsprite.com)
Crea un test de tipo *Frontend*, pega la URL de Vercel, sube `standard_prd.md` y añade las credenciales.

## 4. Lo que debería fallar hoy
Los casos TC008, TC010, TC016, TC024, TC028, TC029, TC030, TC035, TC036, TC038, BE008 y BE009 cubren los huecos
listados en `docs/auditoria-funcional.md`. Están pensados para fallar ahora y pasar cuando se corrijan.
