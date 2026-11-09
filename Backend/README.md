# ShopCart — Backend

API REST de ShopCart (Fase 1 del Tech Challenge 360): Node.js 24, TypeScript en modo `strict` (ESM) y Express 5. El backend no contiene SQL: todo el acceso a datos pasa por stored procedures de SQL Server, y Redis guarda sesiones, revocación de tokens, bloqueo de login, rate limiting y caché.

- Referencia de endpoints, roles, SP de cada endpoint y códigos de error: [API.md](API.md) (especificación OpenAPI en `src/docs/openapi.yaml`, servida en `/api/docs`).
- Base de datos (scripts, diagrama entidad-relación, reglas de integridad, stored procedures): [Database/README.md](../Database/README.md).
- Levantar todo el proyecto con Docker Compose, CI/despliegue y credenciales de prueba: [README principal](../README.md).

## Índice

1. [Librerías](#librerías)
   - [Librerías de producción](#librerías-de-producción)
   - [Librerías de desarrollo](#librerías-de-desarrollo)
   - [Librerías de pruebas](#librerías-de-pruebas)
2. [Ejecutar en local](#ejecutar-en-local)
   - [1. Requisitos previos](#1-requisitos-previos)
   - [2. Levantar SQL Server](#2-levantar-sql-server)
   - [3. Crear la base de datos](#3-crear-la-base-de-datos)
   - [4. Configurar el backend](#4-configurar-el-backend)
   - [5. Ejecutar el backend](#5-ejecutar-el-backend)
   - [6. Verificar](#6-verificar)
   - [Siguiente paso](#siguiente-paso)
3. [Problemas comunes](#problemas-comunes)
4. [Estructura del proyecto](#estructura-del-proyecto)
5. [Responsabilidad de cada capa](#responsabilidad-de-cada-capa)
6. [Flujo de una petición](#flujo-de-una-petición)
7. [Redis](#redis)
8. [Pruebas](#pruebas)
9. [Documentación de la API](#documentación-de-la-api)

---

## Librerías

La columna **Línea** indica la versión mayor.menor elegida. Las versiones exactas se fijan al instalar (`npm install --save-exact`) y quedan en `package-lock.json`, así que `npm ci` instala siempre lo mismo.

### Librerías de producción

| Librería | Línea | Uso y motivo |
| :--- | :--- | :--- |
| `express` | 5.3 | Servidor HTTP. Express 5 envía al `errorHandler` los errores de handlers `async` sin envolverlos |
| `mssql` | 12.7 | Conexión a SQL Server; `executeSp` la usa para ejecutar SPs con parámetros tipados |
| `zod` | 4.6 | Validación de body, query, params y de las variables de entorno |
| `jsonwebtoken` | 9.0 | Firma y verificación del access token |
| `argon2` | 0.45 | Hash de contraseñas con Argon2id |
| `helmet` | 8.3 | Cabeceras de seguridad básicas |
| `cors` | 2.8 | CORS con origen explícito y `credentials: true` para la cookie de refresh |
| `cookie-parser` | 1.4 | Lectura de la cookie del refresh token |
| `express-rate-limit` | 8.7 | Límite de intentos en login y registro (extra opcional) |
| `redis` | 6.3 | Cliente oficial de Redis (node-redis): sesiones, revocación, bloqueo de login y caché |
| `rate-limit-redis` | 6.0 | Guarda los contadores de `express-rate-limit` en Redis: sobreviven reinicios y se comparten entre instancias |
| `pino`, `pino-http` | 10.4 / 11.0 | Logs en JSON con un `requestId` por petición |
| `swagger-ui-express`, `yaml` | 5.0 / 2.9 | Sirven `openapi.yaml` en `/api/docs` |
| `nodemailer` | 10.1 | Envío SMTP de los correos de crear y recuperar contraseña. Trae sus propios tipos (no hace falta `@types/nodemailer`) |
| `multer` | 2.4 | Lee la subida multipart de imágenes de producto (en memoria: el archivo se escribe a disco solo después de comprobar su tipo) |

No se necesitan:
- **`dotenv`**: Node 24 carga el `.env` con `--env-file`.
- **Librería de UUID**: se usa `crypto.randomUUID()`.
- **Librería de cron**: el job de reservas usa `setInterval`.

### Librerías de desarrollo

| Librería | Línea | Uso y motivo |
| :--- | :--- | :--- |
| `typescript` | 6.0 | Compilador en modo `strict`. Se usa 6.0 y no 7.0 porque `typescript-eslint` 8.72 solo soporta TypeScript `< 6.1` |
| `tsx` | 4.23 | Ejecuta TypeScript con recarga automática en `npm run dev` |
| `@types/node` | 24 | Tipos de Node, en la misma línea que el runtime (Node 24 LTS) |
| `@types/express`, `@types/mssql`, `@types/jsonwebtoken`, `@types/cookie-parser`, `@types/cors`, `@types/multer`, `@types/swagger-ui-express` | — | Tipos de las librerías de producción |
| `eslint`, `@eslint/js`, `typescript-eslint` | 10.13 / 10.0 / 8.72 | Análisis estático con reglas para TypeScript |
| `prettier` | 3.9 | Formato del código |

### Librerías de pruebas

| Librería | Línea | Uso y motivo |
| :--- | :--- | :--- |
| `vitest` | 5.0 | Runner de pruebas unitarias y de integración; ejecuta TypeScript sin compilar y simula módulos con `vi.mock` |
| `@vitest/coverage-v8` | 5.0 | Reporte de cobertura |
| `supertest`, `@types/supertest` | 7.3 / 7.2 | Peticiones HTTP contra la app Express sin abrir un puerto |
| `testcontainers`, `@testcontainers/mssqlserver`, `@testcontainers/redis` | 12.2 | Levantan un SQL Server y un Redis desechables en Docker para las pruebas de integración; en SQL Server se ejecutan los scripts de `Database/` |

## Ejecutar en local

Estos pasos levantan SQL Server, la base y el backend sin Docker Compose (Node y `sqlcmd` instalados en la máquina). Para levantar todo con Docker Compose, ver [Opción rápida: Docker Compose](../README.md#opción-rápida-docker-compose) en el README principal. Cada bloque de comandos parte de la raíz del repositorio.

### 1. Requisitos previos

| Herramienta | Versión | Verificar con |
| :--- | :--- | :--- |
| Node.js | 24 LTS (definida en `Backend/.nvmrc`) | `node -v` |
| npm | La que trae Node 24 | `npm -v` |
| SQL Server | 2019 o superior (local o en Docker) | — |
| Redis | 7.4 o superior; lo más simple es `docker compose up -d redis` | `redis-cli ping` |
| sqlcmd | `mssql-tools18` o el `sqlcmd` (go) | `sqlcmd -?` |
| Docker | Para levantar SQL Server sin instalarlo y para las pruebas de integración | `docker -v` |

Si usas `nvm`, instala y activa la versión del proyecto:

```bash
cd Backend
nvm install   # lee .nvmrc
nvm use
```

### 2. Levantar SQL Server

Si ya tienes una instancia de SQL Server 2019 o superior, salta al paso 3. Si no, con Docker:

```bash
docker run -d --name shopcart-sql \
  -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=ShopCart#Local2026" \
  -p 1433:1433 \
  mcr.microsoft.com/mssql/server:2022-latest
```

Espera unos segundos a que el servidor arranque (`docker logs -f shopcart-sql` muestra *SQL Server is now ready for client connections*).

### 3. Crear la base de datos

El script `Database/docker-init.sh` (el mismo que usa docker compose) ejecuta en orden todos los archivos de `Database/scripts/`: crea la base `ShopCart`, sus objetos, el login de la aplicación y los datos semilla.

```bash
cd Database
DB_SERVER=localhost,1433 \
DB_USER=sa \
DB_PASSWORD='ShopCart#Local2026' \
APP_DB_PASSWORD='ShopCartApp#2026' \
./docker-init.sh
```

`APP_DB_PASSWORD` es la contraseña del login `shopcart_app` que usará el backend. Las demás variables (`DB_NAME`, `DB_RESET`, `DB_PRUEBAS`…), cómo ejecutarlo sin `sqlcmd` instalado y cómo crear la base con `Database/script.sql` desde SSMS están en [Database/README.md](../Database/README.md#crear-la-base-de-datos).

### 4. Configurar el backend

```bash
cd Backend
cp .env.example .env
npm ci
```

Edita `.env` con los datos de tu entorno:

| Variable | Ejemplo | Descripción |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | `development`, `test` o `production` |
| `PORT` | `4000` | Puerto del API |
| `DB_SERVER` | `localhost` | Host de SQL Server |
| `DB_PORT` | `1433` | Puerto de SQL Server |
| `DB_NAME` | `ShopCart` | Nombre de la base |
| `DB_USER` | `shopcart_app` | Login de la aplicación (solo tiene permiso `EXECUTE`) |
| `DB_PASSWORD` | `'ShopCartApp#2026'` | Debe coincidir con `APP_DB_PASSWORD` del paso 3. **Entre comillas**: sin ellas, Node toma lo que sigue a `#` como comentario |
| `DB_ENCRYPT` | `true` | Cifrado de la conexión |
| `DB_TRUST_SERVER_CERTIFICATE` | `true` | `true` solo en local (certificado autofirmado) |
| `JWT_ACCESS_SECRET` | *(cadena aleatoria de 64+ caracteres)* | Firma de los access tokens |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Vigencia del access token |
| `REFRESH_TOKEN_DAYS` | `7` | Vigencia del refresh token |
| `CORS_ORIGIN` | `http://localhost:5173` | Origen permitido del frontend |
| `RESERVAS_JOB_INTERVAL_MS` | `60000` | Cada cuánto se liberan las reservas vencidas |
| `REDIS_URL` | `redis://localhost:6379` | Conexión a Redis |
| `CACHE_ENABLED` | `true` | `false` desactiva la caché (las sesiones siguen en Redis) |
| `CACHE_TTL_REPORTES_SEG` | `300` | Vigencia de la caché de reportes |
| `CACHE_TTL_CATALOGO_SEG` | `600` | Vigencia de la caché del catálogo público |
| `LOGIN_MAX_INTENTOS` | `5` | Intentos fallidos antes de bloquear la cuenta |
| `LOGIN_BLOQUEO_MIN` | `15` | Minutos de bloqueo tras superar los intentos |
| `RATE_LIMIT_AUTH_MAX` | `10` | Solicitudes por IP a login y a registro en cada ventana; `0` desactiva el límite |
| `RATE_LIMIT_AUTH_VENTANA_MIN` | `15` | Duración de la ventana del rate limit |
| `RATE_LIMIT_CONTRASENA_MAX` | `10` | Solicitudes por IP a cada ruta de contraseña (`olvido`, `verificar`, `establecer`) por ventana; `0` desactiva el límite |
| `APP_URL_PUBLICA` | `http://localhost:5173` | URL pública del frontend, base de los enlaces de los correos (`/crear-contrasena#token=…`) |
| `TOKEN_CREAR_HORAS` | `72` | Vigencia del enlace para crear la contraseña (registro e invitación) |
| `TOKEN_RESTABLECER_MIN` | `60` | Vigencia del enlace para restablecer la contraseña |
| `CORREO_TRANSPORTE` | `smtp` | `smtp` envía por SMTP; `memoria` guarda los correos en una bandeja (solo pruebas) |
| `SMTP_HOST` | `localhost` | Servidor SMTP (Mailpit en desarrollo). Obligatoria con `smtp` |
| `SMTP_PORT` | `1025` | Puerto SMTP |
| `SMTP_SECURE` | `false` | `true` solo para TLS directo (puerto 465) |
| `SMTP_USER`, `SMTP_PASSWORD` | *(vacías)* | Credenciales del proveedor SMTP. **Entre comillas** si llevan `#` |
| `CORREO_REMITENTE` | `'ShopCart <no-reply@shopcart.local>'` | Remitente de los correos. Obligatoria con `smtp` |
| `IMAGENES_DIR` | `./datos/imagenes` | Directorio donde se guardan las imágenes de producto subidas (en Docker, el volumen `imagenes`) |
| `IMAGENES_MAX_MB` | `5` | Tamaño máximo de una imagen subida |

Para generar un secreto:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

`config/env.ts` valida estas variables al arrancar: si falta alguna o tiene un formato inválido, el servidor no inicia y muestra cuál es.

### 5. Ejecutar el backend

```bash
npm run dev
```

| Script | Descripción |
| :--- | :--- |
| `npm run dev` | Servidor en modo desarrollo con recarga automática (`tsx watch --env-file=.env src/server.ts`) |
| `npm run build` | Compila TypeScript a `dist/` (`tsconfig.build.json`) |
| `npm start` | Ejecuta la versión compilada (`node --env-file-if-exists=.env dist/server.js`; en Docker las variables vienen de compose) |
| `npm run typecheck` | Verifica tipos sin compilar |
| `npm run lint` | Revisa el código con ESLint |
| `npm run format` | Formatea el código con Prettier |
| `npm test` | Ejecuta las pruebas unitarias y de integración |
| `npm run test:unit` | Solo pruebas unitarias (no necesitan base de datos) |
| `npm run test:integration` | Solo pruebas de integración (necesitan Docker o `TEST_DB_SERVER`) |
| `npm run test:coverage` | Todas las pruebas con reporte de cobertura en `coverage/` |

### 6. Verificar

```bash
curl http://localhost:4000/api/health
```

Debe responder con el estado del servicio y de la conexión a la base. La documentación interactiva queda en `http://localhost:4000/api/docs`.

### Siguiente paso

Para iniciar sesión usa los usuarios de [Credenciales de prueba](../README.md#credenciales-de-prueba) del README principal. El frontend en desarrollo se levanta como indica [Frontend/README.md](../Frontend/README.md#en-desarrollo).

## Problemas comunes

| Síntoma | Solución |
| :--- | :--- |
| `self-signed certificate` al conectar | En local, `DB_TRUST_SERVER_CERTIFICATE=true` |
| `Login failed for user 'shopcart_app'` | `DB_PASSWORD` del `.env` no coincide con `APP_DB_PASSWORD` usado en el paso 3 |
| `ECONNREFUSED 127.0.0.1:1433` | SQL Server no está corriendo o aún está arrancando |
| Login y rutas autenticadas responden `503 SERVICIO_NO_DISPONIBLE` | Redis no responde; revisa `docker compose ps redis`. El catálogo público sigue funcionando sin caché |
| `Bind for 127.0.0.1:6379 failed: port is already allocated` | Otro Redis usa ese puerto; cambia `REDIS_PORT` en `.env` (y `REDIS_URL` si corres el backend fuera de Docker) |
| El servidor no inicia y lista variables | Falta o es inválida una variable del `.env` |

## Estructura del proyecto

El backend está organizado **por módulo de negocio** y, dentro de cada módulo, **por capas**.

```
Backend/
├── src/
│   ├── app.ts                    # Configura Express: helmet, cors, cookies, json, rutas y errorHandler
│   ├── server.ts                 # Arranque del servidor, del job de reservas y cierre ordenado del pool
│   ├── config/
│   │   ├── env.ts                # Variables de entorno validadas con zod
│   │   ├── logger.ts             # Logger pino (JSON); oculta Authorization y cookies
│   │   ├── database.ts           # Pool de conexiones mssql
│   │   └── redis.ts              # Cliente de Redis con reconexión automática
│   ├── db/
│   │   ├── executeSp.ts          # Único punto de ejecución de stored procedures
│   │   └── sqlErrorMapper.ts     # Traduce THROW 50xxx de SQL Server a errores HTTP
│   ├── middlewares/
│   │   ├── authenticate.ts       # Verifica el access token y que no esté revocado en Redis (401)
│   │   ├── authorize.ts          # Control por rol (403 si no tiene permiso)
│   │   ├── validate.ts           # Valida body/query/params con un esquema zod
│   │   ├── idempotencyKey.ts     # Exige el header Idempotency-Key en el pago
│   │   ├── guestCart.ts          # Lee el header X-Cart-Token del carrito de invitado
│   │   ├── rateLimit.ts          # Límite por IP en login, registro y rutas de contraseña, con store en Redis (extra)
│   │   ├── subirImagen.ts        # multer: recibe la imagen multipart (límite de tamaño, 1 archivo)
│   │   ├── errorHandler.ts       # Manejo centralizado de errores
│   │   └── notFound.ts
│   ├── modules/
│   │   ├── auth/                 # Registro, login, refresh con rotación, logout, crear y recuperar contraseña
│   │   │   ├── sesiones.store.ts   # Sesiones en Redis y script Lua de rotación atómica
│   │   │   ├── revocacion.store.ts # Lista de access tokens revocados
│   │   │   ├── intentos.store.ts   # Contador de intentos fallidos y bloqueo temporal
│   │   │   ├── tokensContrasena.store.ts # Tokens de un solo uso de los enlaces de contraseña
│   │   │   └── enlacesContrasena.ts      # Emite el token y manda el correo con el enlace
│   │   ├── perfil/               # Datos y contraseña del propio usuario
│   │   ├── usuarios/             # Gestión y desactivación de usuarios (Administrador)
│   │   ├── direcciones/          # Direcciones de entrega del cliente
│   │   ├── tarjetas/             # Tarjetas guardadas del cliente (titular, marca, tipo y últimos 4)
│   │   ├── catalogo/             # Catálogo público, categorías, productos, variantes, atributos
│   │   ├── sucursales/           # Sucursales de retiro: lista pública (/api/catalogo/sucursales) y gestión del Admin
│   │   ├── inventario/           # Existencias, kardex, entradas y ajustes
│   │   ├── carrito/              # Carrito de cliente e invitado, cupón aplicado
│   │   ├── cupones/              # CRUD de cupones (Administrador)
│   │   ├── checkout/             # Reserva de existencia y pago idempotente
│   │   ├── pedidos/              # Ciclo de vida, cancelación y devoluciones
│   │   ├── reportes/             # Dashboard y reportes de ventas
│   │   ├── bitacora/             # Consulta de la bitácora (Administrador)
│   │   ├── configuracion/        # Parámetros del sistema
│   │   └── sistema/              # Health check
│   ├── jobs/
│   │   └── liberarReservas.job.ts  # Ejecuta SP_Inventario_LiberarReservasVencidas periódicamente
│   ├── shared/
│   │   ├── cache/                # cache.ts (getOrSet, invalidar) y claves.ts (claves y namespaces)
│   │   ├── eventos/              # eventos.ts: aviso de cambios en pedidos por Redis pub/sub (publicar, suscribir)
│   │   ├── correo/               # correo.ts (SMTP con nodemailer o bandeja en memoria) y plantillas.ts (HTML y texto)
│   │   ├── almacenamiento/       # imagenes.ts: guarda imágenes en disco (bytes mágicos, nombre UUID) y las borra
│   │   ├── errors/               # AppError y catálogo de códigos de error
│   │   ├── utils/                # Paginación, montos, fechas (filtros desde/hasta), esquemas zod comunes
│   │   └── types/                # Extensiones de tipos de Express (usuario autenticado, token de carrito)
│   └── docs/
│       └── openapi.yaml          # Especificación OpenAPI servida en /api/docs
├── tests/                        # Ver "Pruebas"
│   ├── unit/
│   ├── integration/
│   ├── helpers/
│   └── setup/
├── API.md                        # Referencia de endpoints
├── Dockerfile                    # Imagen multi-stage (node:24-bookworm-slim) para docker compose
├── .env.example
├── .nvmrc                        # 24
├── .prettierrc
├── package.json
├── eslint.config.js
├── vitest.config.ts              # Proyectos de prueba: unit e integration
├── tsconfig.json                 # "strict": true, ESM (NodeNext); incluye src y tests
└── tsconfig.build.json           # Compilación a dist/ (solo src)
```

Cada módulo sigue la misma estructura:

```
modules/pedidos/
├── pedidos.routes.ts       # Endpoints, middlewares de auth, rol y validación
├── pedidos.controller.ts   # Lee la request, llama al servicio y responde
├── pedidos.service.ts      # Lógica de negocio
├── pedidos.repository.ts   # Llama a los stored procedures del módulo
├── pedidos.schemas.ts      # Esquemas zod de entrada
└── pedidos.types.ts        # Tipos y DTOs del módulo
```

## Responsabilidad de cada capa

| Capa | Responsabilidad | No debe |
| :--- | :--- | :--- |
| Rutas | Declarar endpoints, aplicar `authenticate`, `authorize` y `validate` | Contener lógica |
| Controlador | Traducir HTTP ↔ servicio (params, usuario autenticado, código de respuesta) | Contener reglas de negocio |
| Servicio | Reglas de negocio y orquestación entre repositorios | Conocer Express ni SQL |
| Repositorio | Invocar SPs con `executeSp('SP_Modulo_Proceso', params)` y mapear el resultado | Construir SQL |
| Stored procedure | Transacciones, bloqueos y reglas críticas de integridad | Concatenar SQL dinámico (solo `sp_executesql` con parámetros) |

## Flujo de una petición

```
Request → helmet/cors → authenticate → authorize(roles) → validate(schema)
        → controller → service → repository → executeSp → SQL Server (SP)
        ← respuesta JSON  ←  errorHandler (si algo falla: sqlErrorMapper → código HTTP)
```

**Regla:** el backend no contiene consultas SQL. Todo el acceso a datos pasa por `executeSp`, que solo acepta el nombre del SP y parámetros tipados. Además, el login `shopcart_app` solo tiene permiso `EXECUTE`: aunque alguien intentara ejecutar SQL directo, la base lo rechazaría.

## Redis

Redis guarda las sesiones, la revocación de tokens, el bloqueo de login, los contadores de rate limiting y la caché. **SQL Server sigue siendo la única fuente de verdad del negocio**: existencias, reservas, idempotencia del pago, cupones, pedidos y bitácora nunca pasan por Redis.

Todas las claves llevan el prefijo `shopcart:`.

| Uso | Claves | TTL |
| :--- | :--- | :--- |
| Sesión (refresh token) | `sesion:token:{sha256 del token}` → `{idUsuario, familia}` (se conserva tras rotar, para detectar la reutilización); `sesion:familia:{familia}` → `{idUsuario, tokenActual}`; `sesion:usuario:{idUsuario}` → familias activas del usuario | 7 días, renovados en cada rotación |
| Revocar un access token | `auth:revocado:jti:{jti}` (logout) | Vida restante del token (≤ 15 min) |
| Revocar todos los tokens de un usuario | `auth:revocado-desde:{idUsuario}` = segundo Unix; se rechazan los tokens emitidos en segundos anteriores (desactivación, cambio de contraseña o de rol) | 15 min |
| Bloqueo por intentos | `auth:intentos:{correo}`; con `LOGIN_MAX_INTENTOS` fallos → `429 CUENTA_BLOQUEADA` con `Retry-After`; se borra al iniciar sesión bien | `LOGIN_BLOQUEO_MIN` |
| Token de contraseña (crear o restablecer) | `auth:token-contrasena:{sha256}` → `{idUsuario, proposito}` y `auth:token-contrasena:usuario:{id}` → sha256 del único token vigente (emitir uno nuevo invalida el anterior). El enlace lleva el token en claro, solo se guarda su hash; el canje es de un solo uso (script Lua) | `TOKEN_CREAR_HORAS` (72 h) o `TOKEN_RESTABLECER_MIN` (60 min) |
| Rate limit por IP | `ratelimit:login:{ip}`, `ratelimit:registro:{ip}` y `ratelimit:contrasena-{olvido\|verificar\|establecer}:{ip}` (store de `rate-limit-redis`, 10 por IP cada 15 min) | 15 min |
| Caché del usuario | `usuario:{id}` → rol, estado, nombre y correo; la usan `refresh` y `/me` | 15 min |
| Caché de reportes | `reportes:v{n}:{endpoint}:{hash de filtros}` | `CACHE_TTL_REPORTES_SEG` |
| Caché del catálogo público | `catalogo:v{n}:categorias`, `catalogo:v{n}:metodos-envio`, `catalogo:v{n}:sucursales` | `CACHE_TTL_CATALOGO_SEG` |
| Caché de la configuración | `configuracion` | 1 h |

**Sesiones y tokens:**
- El access token JWT lleva `jti` (identificador único) y `sid` (familia de la sesión). `authenticate` verifica la firma y luego consulta en Redis, en una sola ida (`MULTI`), si el `jti` fue revocado, si la familia `sid` sigue existiendo y si el token es anterior a `revocado-desde` del usuario. Así, al terminar una sesión dejan de valer todos sus access tokens.
- El refresh token tiene la forma `<sid>.<secreto>`: la familia viaja en el token para que el script de rotación reciba todas sus claves.
- La rotación del refresh token es un **script Lua atómico**: si el token presentado es el `tokenActual` de su familia, emite uno nuevo y lo reemplaza; si no lo es (alguien reutilizó un token ya rotado), borra la familia completa y responde `401 REFRESH_INVALIDO`. Dos peticiones simultáneas con el mismo token no pueden rotarlo dos veces.
- Logout revoca el `jti` actual y borra la familia. Desactivar un usuario, cambiar su contraseña o su rol borra todas sus familias y fija `revocado-desde`.

**Caché:**
- Patrón *cache-aside*: el servicio llama `cache.getOrSet(clave, ttl, () => repositorio.consultar())`.
- **Invalidación por versión**: cada namespace (`reportes`, `catalogo`) tiene un contador. Invalidar es `INCR shopcart:reportes:version`; las claves anteriores dejan de leerse y expiran solas. Es atómico y no necesita recorrer claves.
- Se invalida en el servicio **después** de que el SP confirmó la transacción, nunca antes:

| Namespace | Se invalida al |
| :--- | :--- |
| `reportes` | Crear, cancelar o cambiar de estado un pedido, registrar una devolución, actualizar una categoría o un producto (la vista de ventas une su nombre y categoría actuales) y `PUT /api/configuracion/:clave` |
| `catalogo` | Crear, modificar, activar/desactivar o eliminar categorías, productos y sucursales; crear o activar/desactivar variantes (lo que cambia qué categorías y cuántos productos se ven). Precios, SKU, valores de atributo e imágenes no están en lo cacheado |
| `usuario:{id}` | Actualizar perfil, rol o estado del usuario |
| `configuracion` | `PUT /api/configuracion/:clave` |

- Los carritos abandonados se dejan con TTL a propósito: un carrito se vuelve abandonado por el paso del tiempo, sin ninguna escritura, e invalidar en cada escritura del carrito (muy frecuentes) anularía la caché. Queda acotado a `CACHE_TTL_REPORTES_SEG`.
- La existencia disponible **nunca** se cachea: la búsqueda y el detalle de productos del catálogo público traen `disponible` y `existenciaDisponible`, así que se leen de la base en cada petición.
- Las respuestas cacheadas llevan el header `X-Cache: HIT` o `X-Cache: MISS`.

**Si Redis falla:**

| Función | Comportamiento |
| :--- | :--- |
| Sesiones, revocación, bloqueo de login y tokens de contraseña | *Fail-closed*: login, registro, rutas de contraseña, refresh, logout y rutas autenticadas responden `503 SERVICIO_NO_DISPONIBLE` (no se puede verificar si un token fue revocado). El registro lo comprueba antes de crear el usuario. El cliente de Redis no encola comandos mientras reconecta (`disableOfflineQueue`), así que la respuesta es inmediata |
| Rate limit por IP | Deja pasar la solicitud; login y registro igual responden `503` por la fila anterior |
| Caché | *Fail-open*: se registra el error y se lee de la base |
| `GET /api/health` | Reporta `redis: "down"` |

**Eventos en tiempo real (pub/sub):** `POST` de pago, cancelación, cambio de estado y devolución publican un aviso en el canal `shopcart:eventos:reportes` después de invalidar la caché de reportes; `GET /api/reportes/stream` (SSE, solo Administrador) lo reenvía a los dashboards abiertos. El mensaje no guarda datos de negocio (solo `tipo`, `idPedido`, `estado` y `fecha`) y Redis no lo conserva. El publicador es *fail-open*: si Redis falla se registra el error y la escritura, ya confirmada en SQL Server, no falla. El suscriptor es una conexión dedicada (`duplicate()`) que se abre en la primera suscripción; si no conecta, el stream responde `503 SERVICIO_NO_DISPONIBLE`.

**Configuración del servidor** (en `docker-compose.yml`): persistencia AOF (`appendonly yes`, `appendfsync everysec`) para no perder sesiones al reiniciar, y `maxmemory 256mb` con `maxmemory-policy noeviction` para que Redis nunca expulse sesiones. Si la memoria se llena, fallan las escrituras de caché (que es fail-open) y no las sesiones existentes.

## Pruebas

Se usan **Vitest** como runner, **Supertest** para las peticiones HTTP y **Testcontainers** para levantar un SQL Server real durante las pruebas de integración.

```
Backend/tests/
├── unit/                         # Misma estructura que src/: src/x/y.ts se prueba en unit/x/y.test.ts
│   ├── config/                   # env: validación de las variables de correo y contraseñas
│   ├── db/                       # sqlErrorMapper
│   ├── jobs/                     # liberarReservas.job: sin solapamiento; un error no tumba el proceso
│   ├── middlewares/              # authenticate, authorize, validate, errorHandler, notFound, idempotencyKey, guestCart
│   ├── modules/<modulo>/         # <modulo>.service (repositorio simulado con vi.mock) y <modulo>.schemas (zod)
│   └── shared/                   # cache/, eventos/ y utils/ (paginación, montos, fechas, contraseñas)
├── integration/                  # Endpoints de punta a punta con supertest
│   ├── auth.test.ts
│   ├── contrasena.test.ts        # Registro sin contraseña, olvido, verificar y establecer
│   ├── contrasena.tokens.test.ts       # Vigencia en Redis, bitácora del canje, respuestas indistinguibles
│   ├── contrasena.concurrencia.test.ts # Doble canje del token y doble registro del mismo correo
│   ├── contrasena.ratelimit.test.ts    # Límite por IP de las 3 rutas de contraseña
│   ├── usuarios.pendiente.test.ts      # contrasenaPendiente e invitación a un Cliente
│   ├── catalogo.test.ts
│   ├── imagenes.test.ts          # Subida multipart y /api/imagenes
│   ├── imagenes.seguridad.test.ts # Tipo real, límites de multer, cabeceras, Range y rutas peligrosas
│   ├── direcciones.test.ts
│   ├── tarjetas.test.ts          # Tarjetas guardadas y pago con ellas
│   ├── tarjetas.concurrencia.test.ts # Doble guardado, doble alta y doble predeterminada
│   ├── carrito.test.ts
│   ├── cupones.test.ts
│   ├── checkout.concurrencia.test.ts
│   ├── pedidos.test.ts
│   ├── sucursales.test.ts        # CRUD de sucursales (roles, errores, bitácora, caché, listado) y retiro en el checkout
│   ├── sucursales.retiro.test.ts # Retiro en sucursal: validaciones, detalle del pedido, idempotencia, ciclo de vida y concurrencia
│   ├── inventario.test.ts
│   ├── reportes.test.ts
│   └── bitacora.test.ts
├── helpers/                      # Datos de prueba, login por rol y cliente HTTP autenticado
└── setup/
    └── globalSetup.ts            # Levanta el contenedor, crea la base con Database/, corre Database/pruebas y expone la conexión
```

| Tipo | Qué prueba | Base de datos |
| :--- | :--- | :--- |
| Unitarias | Reglas de los servicios (validación y cálculo de cupones, transiciones de estado, armado de respuestas), `sqlErrorMapper` y los middlewares `authorize`, `validate` e `idempotencyKey` | No; los repositorios se simulan |
| Integración | Los criterios de aceptación de punta a punta: petición HTTP → servicio → SP → SQL Server | Sí; SQL Server en Docker con los scripts y datos semilla |
| Base de datos | Que cada restricción rechace los datos que rompen su regla, aunque no se pase por un SP: FK compuestas, `CHECK`, índices únicos y triggers (58 casos) | Sí; `Database/pruebas/integridad.sql`, que `globalSetup` ejecuta antes de la suite de integración ([detalle](../Database/README.md#pruebas-de-integridad)) |

Casos de integración ligados a los criterios de aceptación:

| Requisito | Caso |
| :--- | :--- |
| RF-01 | Token expirado → 401; rol sin permiso → 403; un cliente pide el pedido, carrito o dirección de otro → 404; un cliente inicia el checkout con la dirección de otro → 404 |
| RF-02 | Cambiar el precio de una variante no altera el total de un pedido ya creado; una variante con dos valores del mismo atributo → 400 |
| RF-03 | La existencia coincide con la suma del kardex; un ajuste sin motivo o que deja negativo se rechaza |
| RF-04 | No se puede agregar más cantidad que la disponible |
| RF-05 | Cupón vencido, agotado o sin el mínimo se rechaza con su código; con usos en paralelo nunca se supera el límite total |
| RF-06 | Dos clientes pagan la última unidad al mismo tiempo → un `201` y un `409 STOCK_INSUFICIENTE`; dos pagos con la misma `Idempotency-Key` → un solo pedido y un solo cobro |
| RF-07 | Transición no permitida → 409; cancelar antes del despacho reintegra la existencia con un movimiento `CANCELACION` y libera el uso del cupón; devolver más de lo vendido → 422; devolver una línea de otro pedido → 400; una reserva vencida se libera al correr el job |
| RF-08 | Los reportes excluyen pedidos cancelados y descuentan devoluciones; una venta de las 20:00 hora de Guatemala (02:00 UTC del día siguiente) cuenta en el día local |
| RF-09 | Un `UPDATE` o `DELETE` sobre la bitácora falla (lo prueba `Database/pruebas/integridad.sql`, porque ninguna ruta escribe en la bitácora) |
| Retiro en sucursal | Retiro sin dirección → `201` y el detalle trae `retiroEnSucursal`, la sucursal y `direccion.idDireccion` null; retiro sin `idSucursal` → `400`; sucursal inactiva o inexistente → `404` (al iniciar y al pagar); domicilio sin `idDireccion` → `400`; `idDireccion` en un retiro y `idSucursal` en un domicilio se ignoran; `direccion.entrega` trae línea 2, horario y teléfono, y al renombrar la sucursal no cambia (`sucursal.nombre` sí); repetir la clave tras desactivar la sucursal → `200`; la misma clave con otra sucursal → `409 IDEMPOTENCIA_CONFLICTO`; cancelar o cambiar el estado de un retiro funciona; la última unidad con retiro entre dos clientes → un `201` y un `409 STOCK_INSUFICIENTE` |
| Gestión de sucursales | Sin token `401`, Operador y Cliente `403`; `404` en `GET/PUT/PATCH/DELETE` de un id inexistente; `DUPLICADO` en `POST` y `PUT`; `EN_USO` al eliminar una con pedidos; cuerpo inválido (teléfono, código postal, longitudes, `activo` no booleano) → `400`; la bitácora registra `CREAR`, `MODIFICAR`, `ACTIVAR`/`DESACTIVAR` y `ELIMINAR` con `Modulo=Sucursales`; cada escritura invalida la caché del catálogo (`X-Cache` HIT → MISS en sucursales y categorías); una desactivada sale del endpoint público; filtros `activo` y `q`, orden por `cantidadPedidos` y paginación con `total` |

Casos de integración de Redis:

| Caso | Resultado esperado |
| :--- | :--- |
| 5 logins fallidos seguidos con el mismo correo | El sexto responde `429 CUENTA_BLOQUEADA`, aun con la contraseña correcta |
| Logout y luego una petición con el mismo access token | `401` de inmediato, sin esperar a que el token expire |
| Reutilizar un refresh token ya rotado | `401 REFRESH_INVALIDO` y la sesión completa queda revocada |
| Dos refresh simultáneos con el mismo token | Solo uno obtiene un token nuevo |
| Desactivar un usuario con sesión abierta | Su access token y su refresh token dejan de funcionar |
| Consultar un reporte dos veces, cancelar un pedido y consultarlo otra vez | `MISS`, `HIT` y luego `MISS` con el dato actualizado |
| Redis detenido | Las rutas autenticadas responden `503`; el catálogo público responde sin caché |
| Registrar un correo, leer el token del correo y establecer la contraseña | `202`, `204` y el login funciona; reusar el token, usar uno vencido o el anterior a otro nuevo → `400 TOKEN_CONTRASENA_INVALIDO` |
| Registrar un correo nuevo, uno pendiente y uno que ya tiene contraseña | Siempre `202` con el mismo cuerpo; el correo enviado es bienvenida, reenvío del enlace y "ya tienes una cuenta" respectivamente |
| Olvidé mi contraseña con un correo que no existe o desactivado | `202` y no sale ningún correo |
| Establecer contraseña con sesiones abiertas | Sus access y refresh tokens dejan de funcionar |
| El Administrador crea un usuario | Llega la invitación y queda `contrasenaPendiente: true`; reenviarla sirve, y si ya creó la contraseña → `409 CONTRASENA_YA_CREADA` |
| Subir un PNG o WebP como Administrador | `201`, y el archivo se descarga con `GET /api/imagenes/productos/…`; un archivo `.png` que en realidad es texto → `415`; uno por encima del límite → `413`; borrar la imagen borra el archivo |
| 3 peticiones seguidas a `olvido`, `verificar` o `establecer` con `RATE_LIMIT_CONTRASENA_MAX=2` | La tercera responde `429 DEMASIADAS_SOLICITUDES` con `Retry-After`; cada ruta tiene su propio contador |
| Dos `establecer` simultáneos con el mismo token | Exactamente un `204` y un `400 TOKEN_CONTRASENA_INVALIDO` |
| Dos registros simultáneos del mismo correo | Ambos `202` y una sola cuenta |
| TTL del token en Redis | `CREAR` ≈ 259200 s, `RESTABLECER` ≈ 3600 s; al canjearlo la clave desaparece |
| Registro y olvido con cuenta nueva, pendiente, con contraseña y desactivada | Mismo status y cuerpo en todos; el correo es el que corresponde (o ninguno si está desactivada) |
| `CORREO_TRANSPORTE=smtp` sin `SMTP_HOST` o `CORREO_REMITENTE` | La validación del entorno falla y el proceso termina |
| Subir imagen: Content-Type falso, campos multipart inválidos, más de 1 archivo o 5 campos, producto inexistente | Se decide por los bytes (no por el Content-Type); `400 VALIDACION`; no queda archivo huérfano |
| `PUT /api/productos/:id/imagenes/orden` con el orden nuevo de todas las imágenes | `200`, `orden` = posición, la primera queda `esPrincipal` y las demás no; una bitácora `MODIFICAR` por imagen cambiada |
| `PUT …/imagenes/orden` con una imagen faltante, sobrante, de otro producto o repetida | `400 VALIDACION` y el orden no cambia |
| `PUT …/imagenes/orden` de un producto inexistente | `404 NO_ENCONTRADO` |
| `PUT …/imagenes/orden` sin token, como Operador y como Cliente | `401`; `403`; `403` |
| `PUT …/imagenes/orden` reenviando el orden que ya tiene | `200` sin escribir bitácora |
| Agregar una imagen sin `orden` a un producto que ya tiene imágenes | Queda al final de la lista |
| `GET`/`POST`/`PATCH`/`DELETE` en `/api/tarjetas` sin token, como Operador o Administrador, o con la tarjeta de otro cliente | `401`; `403`; `404 NO_ENCONTRADO` y la tarjeta ajena queda intacta |
| Guardar una tarjeta: la primera, una repetida, una con `0000` y una con `predeterminada: true` | La primera queda predeterminada; repetida → `409 DUPLICADO`; `0000` → `402 PAGO_RECHAZADO` sin guardar; la nueva predeterminada desmarca la anterior y eliminar la predeterminada promueve a la más reciente |
| Pagar con `guardar: true`, con `0000` y repitiendo la clave (también con `guardar` distinto) | La tarjeta aparece en la lista y el pedido trae `idTarjetaGuardada`; con `0000` → `402` sin guardar; la repetición → `200` con `idTarjetaGuardada: null` y sin duplicar |
| Pagar con `idTarjeta` propia, ajena, eliminada o junto con `guardar` | `201`; `404` (también al repetir la clave); `400 VALIDACION` |
| Dos pagos con `guardar: true` de la misma tarjeta nueva, dos `POST /api/tarjetas` iguales y dos `PATCH` de predeterminada a la vez | Una sola tarjeta guardada; un `201` y un `409 DUPLICADO`; exactamente una predeterminada |
| `GET`/`HEAD`/`Range` en `/api/imagenes`, archivos ocultos y rutas con `%2e%2e` | Cabeceras de caché, CSP, `nosniff` y CORP; `206` con rango; nunca se sirve nada fuera del directorio |

Las pruebas de integración necesitan Docker. Si defines `TEST_DB_SERVER` (con `TEST_DB_USER` y `TEST_DB_PASSWORD`), se usa ese SQL Server en lugar del contenedor; los scripts recrean la base `ShopCart_Test` antes de correr. En los dos casos `globalSetup` ejecuta `docker-init.sh` con `DB_PRUEBAS=true`: si una restricción de integridad deja de funcionar, la suite falla antes de empezar.

## Documentación de la API

La referencia completa de endpoints, con accesos por rol, stored procedure de cada uno, ejemplos de los flujos críticos y el catálogo de códigos de error, está en [API.md](API.md). Con el backend corriendo, la especificación interactiva (`src/docs/openapi.yaml`) está en `http://localhost:4000/api/docs`.
