import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { PantallaCarga } from '../components/molecules/PantallaCarga';
import type { Rol } from '../types/auth';
import { useAuth } from './useAuth';

interface Props {
  /** Roles que pueden entrar; sin roles basta con tener sesión. */
  roles?: Rol[];
  children?: ReactNode;
}

/**
 * Sin sesión → /login?redirect=<ruta actual>; con un rol no permitido → /403.
 * La autorización real la hace el backend; esto solo evita mostrar pantallas que no aplican.
 */
export function ProtectedRoute({ roles, children }: Props) {
  const { estado, usuario } = useAuth();
  const location = useLocation();

  if (estado === 'cargando') return <PantallaCarga />;

  if (!usuario) {
    const destino = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${destino}`} replace />;
  }

  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/403" replace />;

  return children ?? <Outlet />;
}
