# ShopCart — Frontend

Aplicación React de ShopCart (Fase 2 del Tech Challenge 360). Por ahora es solo el **esqueleto**: configuración, cliente HTTP, autenticación en memoria y la estructura de carpetas. Todavía no tiene vistas; la única ruta muestra el estado de `GET /api/health` para comprobar que la app llega al backend.

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
