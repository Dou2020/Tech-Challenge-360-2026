import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { vi } from 'vitest';
import { AuthContext, type ContextoAuth } from '../auth/authContext';

/** Contexto de autenticación de prueba (anónimo por defecto). */
export function crearAuth(parcial: Partial<ContextoAuth> = {}): ContextoAuth {
  return {
    usuario: null,
    estado: 'anonimo',
    iniciarSesion: vi.fn(),
    cerrarSesion: vi.fn(),
    ...parcial,
  };
}

interface Opciones {
  auth?: ContextoAuth;
  /** Ruta inicial del router en memoria. */
  ruta?: string;
  /** Rutas adicionales (p. ej. destinos de una redirección). */
  rutas?: RouteObject[];
}

/** Renderiza un elemento con QueryClient, contexto de autenticación y router en memoria. */
export function renderizar(elemento: ReactElement, opciones: Opciones = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ruta = opciones.ruta ?? '/';
  const router = createMemoryRouter(
    [{ path: ruta.split('?')[0], element: elemento }, ...(opciones.rutas ?? [])],
    { initialEntries: [ruta] },
  );

  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext value={opciones.auth ?? crearAuth()}>
        <RouterProvider router={router} />
      </AuthContext>
    </QueryClientProvider>,
  );
  return { ...resultado, router };
}
