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
    actualizarUsuario: vi.fn(),
    cerrarSesion: vi.fn(),
    ...parcial,
  };
}

interface Opciones {
  auth?: ContextoAuth;
  /** Ruta inicial del router en memoria. */
  ruta?: string;
  /** Patrón de la ruta del elemento (p. ej. '/productos/:id'); por defecto, la ruta inicial sin query. */
  patron?: string;
  /** Rutas adicionales (p. ej. destinos de una redirección). */
  rutas?: RouteObject[];
  /** `state` de la navegación inicial (p. ej. el aviso con el que otra pantalla redirige). */
  estadoRuta?: unknown;
  /** Fragmento de la URL inicial (p. ej. '#token=abc'). */
  hash?: string;
}

/** Renderiza un elemento con QueryClient, contexto de autenticación y router en memoria. */
export function renderizar(elemento: ReactElement, opciones: Opciones = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ruta = opciones.ruta ?? '/';
  const router = createMemoryRouter(
    [{ path: opciones.patron ?? ruta.split('?')[0], element: elemento }, ...(opciones.rutas ?? [])],
    {
      initialEntries: [
        opciones.estadoRuta === undefined && opciones.hash === undefined
          ? ruta
          : {
              pathname: ruta.split('?')[0]!,
              search: ruta.includes('?') ? `?${ruta.split('?')[1]}` : '',
              hash: opciones.hash ?? '',
              state: opciones.estadoRuta,
            },
      ],
    },
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
