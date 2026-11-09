import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PantallaCarga } from './components/molecules';
import ErrorInesperadoPage from './pages/errores/ErrorInesperadoPage';
import { AuthLayout, ConsoleLayout, StoreLayout } from './templates';

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
      {
        path: 'consola',
        element: (
          <ProtectedRoute roles={['Operador', 'Administrador']}>
            <ConsoleLayout />
          </ProtectedRoute>
        ),
        children: [
          {
            // Dashboard, reportes, categorías y productos: solo Administrador.
            element: <ProtectedRoute roles={['Administrador']} />,
            children: [
              { index: true, lazy: pagina(() => import('./pages/consola/DashboardPage')) },
              { path: 'reportes', lazy: pagina(() => import('./pages/consola/ReportesPage')) },
              { path: 'categorias', lazy: pagina(() => import('./pages/consola/CategoriasPage')) },
              {
                path: 'sucursales',
                lazy: pagina(() => import('./pages/consola/SucursalesPage')),
              },
              { path: 'productos', lazy: pagina(() => import('./pages/consola/ProductosPage')) },
              {
                path: 'productos/nuevo',
                lazy: pagina(() => import('./pages/consola/ProductoNuevoPage')),
              },
              {
                path: 'productos/:id',
                lazy: pagina(() => import('./pages/consola/ProductoEditarPage')),
              },
              { path: 'cupones', lazy: pagina(() => import('./pages/consola/CuponesPage')) },
              {
                path: 'cupones/nuevo',
                lazy: pagina(() => import('./pages/consola/CuponNuevoPage')),
              },
              {
                path: 'cupones/:id',
                lazy: pagina(() => import('./pages/consola/CuponDetallePage')),
              },
              { path: 'usuarios', lazy: pagina(() => import('./pages/consola/UsuariosPage')) },
              { path: 'bitacora', lazy: pagina(() => import('./pages/consola/BitacoraPage')) },
              {
                path: 'configuracion',
                lazy: pagina(() => import('./pages/consola/ConfiguracionPage')),
              },
            ],
          },
          // Operación, pedidos, inventario y perfil: Operador y Administrador (los dos entran a la consola).
          {
            path: 'operacion',
            lazy: pagina(() => import('./pages/consola/OperacionPage')),
          },
          // Mi perfil del personal: la misma página que /cuenta/perfil, dentro de la consola.
          { path: 'perfil', lazy: pagina(() => import('./pages/cuenta/PerfilPage')) },
          { path: 'pedidos', lazy: pagina(() => import('./pages/consola/PedidosPage')) },
          {
            path: 'pedidos/:id',
            lazy: pagina(() => import('./pages/consola/PedidoGestionPage')),
          },
          { path: 'inventario', lazy: pagina(() => import('./pages/consola/InventarioPage')) },
          {
            path: 'inventario/:idVariante/kardex',
            lazy: pagina(() => import('./pages/consola/KardexPage')),
          },
          // Cualquier otra ruta de la consola: no encontrada, dentro del layout de la consola.
          { path: '*', lazy: pagina(() => import('./pages/errores/NoEncontradoPage')) },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(rutas);
