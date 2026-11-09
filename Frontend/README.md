# ShopCart — Frontend

Aplicación React de ShopCart (Fase 2 del Tech Challenge 360). Tiene la **tienda**, las **vistas del Cliente** y la **consola** de Operador y Administrador:

- Tienda: inicio, catálogo con filtros y paginación, detalle de producto con selección de variante y carrito (de invitado con `X-Cart-Token`, o del Cliente con su sesión).
  - El detalle de producto refleja el carrito: arranca en la variante de ese producto agregada al final, muestra "En tu carrito: N · Ver carrito" y limita el contador a lo disponible menos lo que ya está en el carrito, porque `POST /carrito/items` suma. Tras agregar, el contador vuelve a 1.
- Autenticación: login, registro sin contraseña, recuperar contraseña y crear/restablecer contraseña desde el enlace del correo.
- Cliente (rutas protegidas por rol): checkout con reserva de 15 min, `Idempotency-Key` y tarjetas guardadas, pedido confirmado, Mis pedidos con detalle y cancelación, Mis direcciones, Mis tarjetas y Mi perfil.
- Consola (`/consola`, ver [Rutas de la consola](#rutas-de-la-consola)): panel de operación (inicio del Operador), pedidos, inventario con kardex y perfil para Operador y Administrador; dashboard, reportes, categorías, productos, cupones, usuarios, bitácora y configuración solo para Administrador.
- Páginas 403, 404 y de error inesperado.

- API que consume (endpoints, roles y códigos de error): [Backend/API.md](../Backend/API.md); cómo levantar el backend: [Backend/README.md](../Backend/README.md#ejecutar-en-local).
- Levantar todo el proyecto con Docker Compose, CI/despliegue y credenciales de prueba: [README principal](../README.md).

## Índice

1. [Stack](#stack)
2. [Librerías](#librerías)
   - [Librerías de la aplicación y del build](#librerías-de-la-aplicación-y-del-build)
   - [Librerías de pruebas](#librerías-de-pruebas)
3. [Ejecutar](#ejecutar)
   - [Con Docker Compose](#con-docker-compose)
   - [En desarrollo](#en-desarrollo)
4. [Estructura](#estructura)
5. [Rutas de la consola](#rutas-de-la-consola)
6. [Tiempo real de pedidos](#tiempo-real-de-pedidos)
7. [Tema y tokens de diseño](#tema-y-tokens-de-diseño)

---

## Stack

React 19 · TypeScript 6 (strict) · Vite 8 · React Router 8 · TanStack Query 5 · recharts 3 · react-hook-form + zod · Tailwind CSS 4 · lucide-react · Vitest + Testing Library.

Versiones exactas en `package.json`. Se usa TypeScript 6.0 y no 7.0 porque `typescript-eslint` 8.72 solo soporta TypeScript `< 6.1`.

## Librerías

La columna **Línea** indica la versión mayor.menor elegida. Las versiones exactas se fijan al instalar (`npm install --save-exact`) y quedan en `package-lock.json`, así que `npm ci` instala siempre lo mismo.

### Librerías de la aplicación y del build

| Librería | Línea | Uso y motivo |
| :--- | :--- | :--- |
| `react`, `react-dom` | 19.3 | Interfaz |
| `react-router` | 8.5 | Rutas y rutas protegidas por rol |
| `@tanstack/react-query` | 5.105 | Datos del servidor: caché, estados de carga y error, invalidación |
| `react-hook-form`, `@hookform/resolvers`, `zod` | 7.91 / 6.0 / 4.6 | Formularios con validación y mensajes por campo |
| `recharts` | 3.10 | Gráficas del dashboard |
| `tailwindcss`, `@tailwindcss/vite` | 4.3 | Estilos |
| `lucide-react` | 1.63 | Íconos |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | 6.3 / 10.0 / 3.2 | Reordenar las imágenes del producto arrastrando (también con teclado); la primera es la principal. Tablero de pedidos de la consola (`OrdersBoard`). Ninguno de los dos entra al barrel de organismos, para que dnd-kit quede fuera del bundle inicial |
| `@fontsource-variable/inter` | 5.3 | Tipografía Inter variable, servida desde el propio sitio (sin CDN ni peticiones a terceros) |
| `vite`, `@vitejs/plugin-react` | 8.3 / 6.1 | Servidor de desarrollo y build (desarrollo) |
| `typescript`, `eslint` | 6.0 / 10.13 | Tipado y análisis estático (desarrollo) |
| `jspdf`, `jspdf-autotable`, `exceljs` | 4.2 / 5.0 / 4.4 | Exportación de reportes a PDF y Excel (extra opcional); se cargan solo al exportar (ver [Exportar reportes](#exportar-reportes)) |

`recharts` se carga solo en las páginas con gráficas, en su propio chunk (`graficas-*.js`): los organismos de gráficas no se reexportan desde `components/organisms/index.ts` para que no entren al bundle inicial. `jspdf`, `jspdf-autotable` y `exceljs` tampoco entran al bundle inicial: `services/exportacion/index.ts` carga los generadores con `import()` al pulsar Excel o PDF, y quedan en sus propios chunks (`excel-*.js`, ~0.9 MB, y `pdf-*.js`). Por el de Excel, `vite.config.ts` sube `build.chunkSizeWarningLimit` a 1000 kB.

### Librerías de pruebas

| Librería | Línea | Uso y motivo |
| :--- | :--- | :--- |
| `vitest`, `@vitest/coverage-v8` | 5.0 | Runner de pruebas (el mismo del backend) y reporte de cobertura |
| `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` | 16.3 / 14.6 / 7.0 | Renderizar componentes y probarlos como los usa una persona (roles, textos, clics), con aserciones sobre el DOM |
| `jsdom` | 30.1 | DOM simulado para correr las pruebas en Node |

## Ejecutar

### Con Docker Compose

Desde la raíz del repositorio, con el perfil `app` (ver [Opción rápida: Docker Compose](../README.md#opción-rápida-docker-compose) en el README principal):

```bash
docker compose --profile app up -d --build
```

nginx sirve el build en `FRONTEND_PORT` (8080) y reenvía `/api` al servicio `backend`. `CORS_ORIGIN` del `.env` debe ser el mismo origen (`http://localhost:<FRONTEND_PORT>`).

La sección `/api/` de `nginx.conf` acepta cuerpos de hasta 6 MB (`client_max_body_size 6m`), por encima de `IMAGENES_MAX_MB` (5) del backend, para que un archivo demasiado grande lo rechace el backend con su 413 `ARCHIVO_DEMASIADO_GRANDE`; si se sube `IMAGENES_MAX_MB`, hay que subir también ese límite.

### En desarrollo

Requiere Node 24 (`nvm use`) y el backend corriendo en `http://localhost:4000`.

```bash
nvm use
npm ci
npm run dev        # http://localhost:5173 (debe coincidir con CORS_ORIGIN del backend)
```

Vite reenvía `/api` al backend (`VITE_PROXY_TARGET`, por defecto `http://localhost:4000`), así la app y la API comparten origen y la cookie del refresh token funciona. En Docker hace lo mismo nginx.

| Script | Para |
| :--- | :--- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build de producción en `dist/` |
| `npm run preview` | Sirve el build |
| `npm run typecheck` | Solo tipos |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Pruebas (Vitest + jsdom) |
| `npm run test:watch` | Pruebas en modo observación |
| `npm run test:coverage` | Pruebas con cobertura en `coverage/` |

Una sola prueba: `npx vitest run src/services/http.test.ts` o `npx vitest run -t "renueva la sesión"`.

## Estructura

```
src/
├── main.tsx              QueryClientProvider + AuthProvider + RouterProvider
├── router.tsx            rutas con lazy: tienda (/, /catalogo, /productos/:id, /carrito), auth (/login, /registro,
│                         /recuperar-contrasena, /crear-contrasena, /restablecer-contrasena), Cliente (/checkout,
│                         /pedido-confirmado/:id, /cuenta/*), consola (/consola/*, por rol), /403 y 404
├── queryClient.ts        no reintenta errores 4xx
├── styles.css            Tailwind, variante dark, color de marca (marca-50 … marca-950) y tokens semánticos
├── services/
│   ├── http.ts           request(): Bearer en memoria, ApiError, renovación única compartida ante 401
│   ├── exportacion/      exportarReporte(): generadores de Excel (exceljs) y PDF (jspdf + jspdf-autotable), con carga diferida
│   └── api/              una función por endpoint (sistema, auth, catálogo, carrito, checkout, pedidos, direcciones, perfil,
│                         tarjetas, sucursales, inventario, gestión del catálogo, reportes y administración)
├── auth/                 tokenStore (token en memoria), AuthProvider (fusiona el carrito de invitado al iniciar sesión), useAuth,
│                         ProtectedRoute (sin sesión → /login?redirect=…, rol no permitido → /403)
├── hooks/                useServerTable, useSeleccionVariante, useTema, useCuentaRegresiva, useRangoFechas, useAgrupacion
│                         (día/semana/mes en la URL) y queries/ (las de la tienda y la cuenta, más sucursales, inventario, gestión,
│                         reportes, administración y estado del sistema)
├── config/               navegación por rol, estados de pedido, etiquetas de tarjetas, columnas de exportación de cada reporte
│                         y graficas (estilos de recharts con las variables crudas del tema, p. ej. var(--primario))
├── types/                api (ApiErrorBody, Page<T>), auth, catálogo, carrito, checkout, pedidos, direcciones, sucursales, perfil, tarjetas,
│                         inventario, gestión, reportes y administración
├── utils/                formato GTQ/fechas, token del carrito de invitado, avisos, accesibilidad y clases de campos, chunks lazy,
│                         variantes, tema, Idempotency-Key del checkout, errores de la API → campos del formulario,
│                         política de contraseñas, datos de pago, departamentos/municipios, rango de fechas y
│                         formularios de producto, cupón y configuración, y exportación (nombres de archivo, encabezado, celdas)
├── data/                 guatemala-locations.json (22 departamentos, 340 municipios)
├── components/           atoms, molecules, organisms de la tienda, de la cuenta del Cliente y de la consola
├── templates/            StoreLayout, AuthLayout y ConsoleLayout
├── pages/                tienda/, auth/, cuenta/, consola/ y errores/
└── test/                 setup de Vitest y renderizar() con proveedores de prueba
```

Cada componente, layout, hook o módulo de configuración nuevo se reexporta desde el `index.ts` de su carpeta. La excepción es `pages/`: `router.tsx` carga las páginas con `lazy` desde su propio archivo y reexportarlas las metería en el bundle inicial.

Al cargar, `AuthProvider` intenta restaurar la sesión con `POST /api/auth/refresh`; sin cookie de refresh, la app sigue como invitado.

## Rutas de la consola

Todas viven dentro de `ConsoleLayout`, con el menú filtrado por rol (`config/navigation.ts`). Sin sesión, `ProtectedRoute` lleva a `/login?redirect=…`; con un rol no permitido, a `/403`.

| Ruta | Página | Acceso |
| :--- | :--- | :--- |
| `/consola` | Dashboard: indicadores y gráficas (recharts, carga diferida) con rango de fechas y agrupación en la URL | Administrador |
| `/consola/reportes` | Reportes en tablas y carritos abandonados paginados; cada reporte se exporta a Excel y PDF | Administrador |
| `/consola/categorias` | Categorías: crear, editar, activar y eliminar | Administrador |
| `/consola/sucursales` | Sucursales de retiro: lista con filtros `q`, `activo` y orden en la URL, crear, editar, activar/desactivar y eliminar (con `EN_USO` sugiere desactivar) | Administrador |
| `/consola/productos`, `/consola/productos/nuevo`, `/consola/productos/:id` | Productos: lista, alta con variantes, edición (imágenes, variantes, cambio de precio, atributos) | Administrador |
| `/consola/cupones`, `/consola/cupones/nuevo`, `/consola/cupones/:id` | Cupones: lista con estado, alta, edición, estado, baja y usos paginados | Administrador |
| `/consola/usuarios` | Usuarios: alta de Operador o Administrador (sin contraseña, con invitación por correo), edición y activación | Administrador |
| `/consola/bitacora` | Bitácora de auditoría (solo lectura), con valores anterior y nuevo | Administrador |
| `/consola/configuracion` | Parámetros del sistema editables con validación | Administrador |
| `/consola/operacion` | Panel de operación: pedidos que esperan en cada etapa y variantes en bajo stock, con enlaces a las listas filtradas. Es el inicio del Operador | Operador, Administrador |
| `/consola/perfil` | Mi perfil del personal (la misma página que `/cuenta/perfil`) | Operador, Administrador |
| `/consola/pedidos` | Pedidos: filtros `estado`, `q`, `desde`, `hasta`, `idCliente` y orden en la URL. Con `?vista=tablero` se ven como tablero kanban (Pagado, En preparación, Despachado, Entregado, Cancelado; 20 por columna, con "Ver todos" a la lista filtrada). Arrastrar una tarjeta (puntero o teclado) o usar su selector "Mover a" pide confirmación y ejecuta el cambio por `PATCH /estado` o `POST /cancelar`, solo hacia los destinos con `permitida` en `GET /api/pedidos/estados`. Las devoluciones siguen en el detalle | Operador, Administrador |
| `/consola/pedidos/:id` | Gestión del pedido: avanzar estado, cancelar y registrar devolución según `transiciones[].via` | Operador, Administrador |
| `/consola/inventario` | Existencias con filtros. Cada fila muestra la descripción de la variante (atributos), marca variante, producto o categoría inactivos y distingue "Agotado" (disponible 0) de "Bajo stock"; el umbral se ve en el encabezado y en el filtro. Entradas y ajustes se registran en un diálogo modal con vista previa de la existencia resultante (el 422 del backend sigue mandando) | Operador, Administrador |
| `/consola/inventario/:idVariante/kardex` | Kardex de la variante con filtros `desde`, `hasta`, `tipo` | Operador, Administrador |
| otra ruta de `/consola/…` | No encontrada, dentro del layout de la consola | Operador, Administrador |

Todas las tablas de la consola usan el organismo `DataTable` (columnas declarativas, orden con `aria-sort`, página y estados de carga, vacío y error); el estado vive en la URL vía `useServerTable`. Los montos se muestran tal como los envía el backend, nunca se recalculan.

## Exportar reportes

Cada reporte de `/consola/reportes` (ventas por día/semana/mes, ventas por categoría, productos más vendidos y carritos abandonados) tiene botones **Excel** y **PDF** (`ExportButtons`). El archivo se genera en el navegador con los mismos datos que devuelve la API; no hay endpoint de exportación.

- Exporta lo que se ve: mismo rango de fechas, agrupación y, en carritos, el orden de la tabla. Carritos va paginado, así que antes de exportar se piden todas las páginas del periodo de 100 en 100 (`reportesApi.todosLosCarritosAbandonados`, el máximo `pageSize` de la API).
- Los montos no se recalculan ni se suman: no hay fila de totales. En Excel van como número con formato `"Q" #,##0.00` (se pueden sumar en la hoja); días y fechas van como texto ya en hora de Guatemala, para que Excel no los corra de zona.
- Encabezado: título, periodo ("Del 01/11/2026 al 30/11/2026"), línea extra si aplica (agrupación) y fecha de generación. El Excel lleva filtro y la cabecera inmovilizada; el PDF es tamaño carta (horizontal con más de 5 columnas), con páginas numeradas.
- Nombre del archivo: `<reporte>_<desde>_<hasta>.xlsx|pdf`, p. ej. `ventas-por-semana_2026-11-01_2026-11-30.xlsx`.
- Las columnas de cada reporte están en `config/exportacionReportes.ts`. Los botones solo aparecen con datos (`ReportSection` → `acciones`); en carritos se deshabilitan sin rango válido o sin resultados. Un fallo se muestra como aviso con la referencia de la API.

## Tiempo real de pedidos

Cuando alguien crea, cancela, cambia de estado o devuelve un pedido, las demás pestañas y los demás usuarios lo ven sin recargar.

- `services/eventosPedidos.ts` lee `GET /api/pedidos/stream` (SSE) con `fetch` y el `Authorization` del `tokenStore` (`EventSource` no admite headers). Reconecta solo:
  - `fin` `TOKEN_EXPIRADO` o 401: renueva con la renovación compartida de `http.ts` y reconecta.
  - `REVOCADO` o 403: se detiene.
  - Corte, 5xx o `SERVIDOR_DETENIDO`: backoff de 5 s a 60 s.
  - 429 (más de 5 conexiones del usuario): espera 60 s.
- `hooks/useTiempoRealPedidos.ts` abre una conexión por pestaña:
  - Lo llaman `ConsoleLayout` (personal) y `StoreLayout` (solo con un Cliente).
  - Con cada evento, agrupado en 300 ms, invalida `['pedidos']`: lista, tablero, detalle, historial, devoluciones y totales del panel de operación.
  - Para el personal, también `['inventario']` si el evento mueve existencia (todo menos `ESTADO`). Para el Administrador, también `['reportes']`, así que el dashboard queda en vivo.
  - Al reconectar refresca todo, porque el stream no repite los eventos perdidos.
- El Cliente solo recibe eventos de sus pedidos (el backend filtra por el dueño).

## Tema y tokens de diseño

Estilo minimal con tipografía Inter, neutros zinc y el verde azulado de la marca. Hay tema claro, oscuro y "sistema" (sigue a `prefers-color-scheme`):

- **Tokens semánticos.** Los componentes no usan colores directos de la paleta (`bg-white`, `text-slate-600`…) sino tokens de `styles.css`: `fondo`, `superficie`, `superficie-suave`, `borde`, `borde-fuerte`, `texto`, `texto-suave`, `texto-tenue`, `primario` (+ `primario-hover`, `sobre-primario`), `acento`, `acento-suave` y los de estado `exito`, `peligro`, `aviso` e `info` (cada uno con `-suave`, `-borde` y `-texto`). Se usan como cualquier color de Tailwind: `bg-superficie`, `text-texto-suave`, `ring-borde`. El modo oscuro solo redefine sus variables bajo `.dark`.
- **Contraste.** `primario` con `sobre-primario` y los textos `texto-suave`/`texto-tenue` cumplen AA (4.5:1) sobre `superficie` y `fondo` en ambos temas.
- **Utilidades.** `tarjeta` (contenedor con borde y sombra suave; el padding va en cada uso) y `tarjeta-interactiva` (además se eleva al pasar el cursor).
- **Cómo se aplica.** El script de `index.html` pone la clase `dark` en `<html>` antes de pintar, para que no haya destello. Después la cambia `useTema` (`hooks/useTema.ts`), que guarda la preferencia en `localStorage` (`shopcart:tema`; "sistema" no guarda nada), sigue los cambios del sistema operativo y de otras pestañas. `ThemeToggle` es el selector: está en el pie de la tienda y en la barra superior de la consola.
