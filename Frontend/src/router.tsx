import { useQuery } from '@tanstack/react-query';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { sistemaApi } from './services/api/sistema';

/**
 * Marcador provisional mientras se agregan las vistas: confirma que /api llega al backend
 * (proxy de Vite en desarrollo, nginx en Docker). Se reemplaza por las rutas reales.
 */
export function Inicio() {
  const { data, error, isPending } = useQuery({
    queryKey: ['sistema', 'estado'],
    queryFn: sistemaApi.obtenerEstado,
  });

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-marca-700">ShopCart</h1>
      {isPending && <p role="status">Consultando la API…</p>}
      {error && <p role="alert">{error.message}</p>}
      {data && (
        <ul className="mt-4 space-y-1 text-sm">
          <li>API: {data.status}</li>
          <li>SQL Server: {data.sqlServer}</li>
          <li>Redis: {data.redis}</li>
        </ul>
      )}
    </main>
  );
}

export const rutas: RouteObject[] = [{ path: '*', element: <Inicio /> }];

export const router = createBrowserRouter(rutas);
