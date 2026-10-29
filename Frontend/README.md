# ShopCart — Frontend

Aplicación React de ShopCart (Fase 2 del Tech Challenge 360). Por ahora es solo el **esqueleto**: configuración, cliente HTTP, autenticación en memoria y la estructura de carpetas. Todavía no tiene vistas; la única ruta muestra el estado de `GET /api/health` para comprobar que la app llega al backend.

## Stack

React 19 · TypeScript 6 (strict) · Vite 8 · React Router 8 · TanStack Query 5 · react-hook-form + zod · Tailwind CSS 4 · lucide-react · Vitest + Testing Library.

Versiones exactas en `package.json`. Se usa TypeScript 6.0 y no 7.0 porque `typescript-eslint` 8.72 solo soporta TypeScript `< 6.1`.

## Ejecutar

### Con Docker Compose

Desde `Entregable/`, con el perfil `app` (ver `README.md` de la raíz del entregable):

```bash
docker compose --profile app up -d --build
```

nginx sirve el build en `FRONTEND_PORT` (8080) y reenvía `/api` al servicio `backend`. `CORS_ORIGIN` del `.env` debe ser el mismo origen (`http://localhost:<FRONTEND_PORT>`).

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
├── router.tsx            rutas; hoy solo el marcador provisional con el estado de la API
├── queryClient.ts        no reintenta errores 4xx
├── styles.css            Tailwind y color de marca (marca-50 … marca-800)
├── services/
│   ├── http.ts           request(): Bearer en memoria, ApiError, renovación única compartida ante 401
│   └── api/              una función por endpoint (sistema, auth)
├── auth/                 tokenStore (token en memoria), AuthProvider, useAuth
├── hooks/queries/        hooks de TanStack Query (vacío)
├── config/               navegación por rol (vacío)
├── types/                api (ApiErrorBody, Page<T>) y auth (Rol, Usuario)
├── utils/format.ts       montos en GTQ y fechas en America/Guatemala
├── components/           atoms, molecules, organisms (vacíos)
├── templates/            layouts de tienda, consola y auth (vacío)
├── pages/                páginas (vacío)
└── test/                 setup de Vitest y renderizar() con proveedores de prueba
```

Las carpetas marcadas "(vacío)" solo tienen un `index.ts` barril con un comentario sobre lo que va ahí. Cada componente, layout, hook o módulo de configuración nuevo se reexporta desde el `index.ts` de su carpeta. La excepción es `pages/`: `router.tsx` carga las páginas con `lazy` desde su propio archivo y reexportarlas las metería en el bundle inicial.

Al cargar, `AuthProvider` intenta restaurar la sesión con `POST /api/auth/refresh`. Mientras el backend no implemente la autenticación, ese endpoint responde 404 y la app sigue como anónima.
