# ShopCart — Frontend

Aplicación React de ShopCart (Fase 2 del Tech Challenge 360). Por ahora tiene la **vista de invitado de la tienda**: inicio, catálogo con filtros y paginación, detalle de producto con selección de variante y carrito (de invitado con `X-Cart-Token`, o del Cliente con su sesión), más las páginas 403, 404 y de error inesperado. Login, registro, cuenta del Cliente, checkout y consola se agregan en los siguientes pasos; hasta entonces sus rutas muestran la página 404.

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
5. [Tema y tokens de diseño](#tema-y-tokens-de-diseño)

---

## Stack

React 19 · TypeScript 6 (strict) · Vite 8 · React Router 8 · TanStack Query 5 · react-hook-form + zod · Tailwind CSS 4 · lucide-react · Vitest + Testing Library.

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
| `@fontsource-variable/inter` | 5.3 | Tipografía Inter variable, servida desde el propio sitio (sin CDN ni peticiones a terceros) |
| `vite`, `@vitejs/plugin-react` | 8.3 / 6.1 | Servidor de desarrollo y build (desarrollo) |
| `typescript`, `eslint` | 6.0 / 10.13 | Tipado y análisis estático (desarrollo) |
| `jspdf`, `jspdf-autotable`, `exceljs` | 4.2 / 5.0 / 4.4 | Exportación de reportes a PDF y Excel (extra opcional); se cargan solo al exportar |

`recharts`, `jspdf`, `jspdf-autotable` y `exceljs` todavía no están en `package.json`: se instalan al implementar el dashboard y la exportación de reportes.

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
├── router.tsx            rutas: tienda (/, /catalogo, /productos/:id, /carrito), /403 y 404, páginas con lazy
├── queryClient.ts        no reintenta errores 4xx
├── styles.css            Tailwind, variante dark, color de marca (marca-50 … marca-950) y tokens semánticos
├── services/
│   ├── http.ts           request(): Bearer en memoria, ApiError, renovación única compartida ante 401
│   └── api/              una función por endpoint (sistema, auth, catálogo, carrito)
├── auth/                 tokenStore (token en memoria), AuthProvider (fusiona el carrito de invitado al iniciar sesión), useAuth
├── hooks/                useServerTable, useSeleccionVariante, useTema y queries/ (carrito, categorías, productos)
├── config/               navegación por rol y estados de pedido
├── types/                api (ApiErrorBody, Page<T>), auth, catálogo y carrito
├── utils/                formato GTQ/fechas, token del carrito de invitado, avisos, accesibilidad y clases de campos, chunks lazy, variantes, tema
├── components/           atoms, molecules, organisms de la tienda
├── templates/            StoreLayout
├── pages/                tienda/ y errores/
└── test/                 setup de Vitest y renderizar() con proveedores de prueba
```

Cada componente, layout, hook o módulo de configuración nuevo se reexporta desde el `index.ts` de su carpeta. La excepción es `pages/`: `router.tsx` carga las páginas con `lazy` desde su propio archivo y reexportarlas las metería en el bundle inicial.

Al cargar, `AuthProvider` intenta restaurar la sesión con `POST /api/auth/refresh`; sin cookie de refresh, la app sigue como invitado.

## Tema y tokens de diseño

Estilo minimal con tipografía Inter, neutros zinc y el verde azulado de la marca. Hay tema claro, oscuro y "sistema" (sigue a `prefers-color-scheme`):

- **Tokens semánticos.** Los componentes no usan colores directos de la paleta (`bg-white`, `text-slate-600`…) sino tokens de `styles.css`: `fondo`, `superficie`, `superficie-suave`, `borde`, `borde-fuerte`, `texto`, `texto-suave`, `texto-tenue`, `primario` (+ `primario-hover`, `sobre-primario`), `acento`, `acento-suave` y los de estado `exito`, `peligro`, `aviso` e `info` (cada uno con `-suave`, `-borde` y `-texto`). Se usan como cualquier color de Tailwind: `bg-superficie`, `text-texto-suave`, `ring-borde`. El modo oscuro solo redefine sus variables bajo `.dark`.
- **Contraste.** `primario` con `sobre-primario` y los textos `texto-suave`/`texto-tenue` cumplen AA (4.5:1) sobre `superficie` y `fondo` en ambos temas.
- **Utilidades.** `tarjeta` (contenedor con borde y sombra suave; el padding va en cada uso) y `tarjeta-interactiva` (además se eleva al pasar el cursor).
- **Cómo se aplica.** El script de `index.html` pone la clase `dark` en `<html>` antes de pintar, para que no haya destello. Después la cambia `useTema` (`hooks/useTema.ts`), que guarda la preferencia en `localStorage` (`shopcart:tema`; "sistema" no guarda nada), sigue los cambios del sistema operativo y de otras pestañas. `ThemeToggle` es el selector y está en el pie de la tienda.
