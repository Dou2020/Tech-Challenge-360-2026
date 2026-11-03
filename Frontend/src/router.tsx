import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { PantallaCarga } from './components/molecules';
import ErrorInesperadoPage from './pages/errores/ErrorInesperadoPage';
import { StoreLayout } from './templates';

/** Carga diferida: cada página se descarga al visitarla por primera vez. */
const pagina = (importar: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await importar()).default,
});

export const rutas: RouteObject[] = [
  {
    hydrateFallbackElement: <PantallaCarga />,
    errorElement: <ErrorInesperadoPage />,
    children: [
      {
        element: <StoreLayout />,
        children: [
          { index: true, lazy: pagina(() => import('./pages/tienda/HomePage')) },
          { path: 'catalogo', lazy: pagina(() => import('./pages/tienda/CatalogoPage')) },
          { path: 'productos/:id', lazy: pagina(() => import('./pages/tienda/ProductoPage')) },
          // Público: el invitado usa su token de carrito; el Cliente, su sesión.
          { path: 'carrito', lazy: pagina(() => import('./pages/tienda/CarritoPage')) },
          { path: '403', lazy: pagina(() => import('./pages/errores/NoAutorizadoPage')) },
          { path: '*', lazy: pagina(() => import('./pages/errores/NoEncontradoPage')) },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(rutas);
