import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PantallaCarga } from './components/molecules';
import ErrorInesperadoPage from './pages/errores/ErrorInesperadoPage';
import { AuthLayout, StoreLayout } from './templates';

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
          {
            element: <ProtectedRoute roles={['Cliente']} />,
            children: [
              {
                path: 'cuenta/direcciones',
                lazy: pagina(() => import('./pages/cuenta/MisDireccionesPage')),
              },
              {
                path: 'cuenta/tarjetas',
                lazy: pagina(() => import('./pages/cuenta/MisTarjetasPage')),
              },
              { path: 'cuenta/perfil', lazy: pagina(() => import('./pages/cuenta/PerfilPage')) },
              {
                path: 'cuenta/pedidos',
                lazy: pagina(() => import('./pages/cuenta/MisPedidosPage')),
              },
              {
                path: 'cuenta/pedidos/:id',
                lazy: pagina(() => import('./pages/cuenta/PedidoDetallePage')),
              },
              { path: 'checkout', lazy: pagina(() => import('./pages/tienda/CheckoutPage')) },
              {
                path: 'pedido-confirmado/:id',
                lazy: pagina(() => import('./pages/tienda/PedidoConfirmadoPage')),
              },
            ],
          },
          { path: '403', lazy: pagina(() => import('./pages/errores/NoAutorizadoPage')) },
          { path: '*', lazy: pagina(() => import('./pages/errores/NoEncontradoPage')) },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          { path: 'login', lazy: pagina(() => import('./pages/auth/LoginPage')) },
          { path: 'registro', lazy: pagina(() => import('./pages/auth/RegistroPage')) },
          {
            path: 'recuperar-contrasena',
            lazy: pagina(() => import('./pages/auth/RecuperarContrasenaPage')),
          },
          // Los enlaces del correo (CREAR y RESTABLECER) comparten página: el token va en #token=…
          {
            path: 'crear-contrasena',
            lazy: pagina(() => import('./pages/auth/EstablecerContrasenaPage')),
          },
          {
            path: 'restablecer-contrasena',
            lazy: pagina(() => import('./pages/auth/EstablecerContrasenaPage')),
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(rutas);
