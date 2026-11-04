import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { crearAuth, renderizar } from '../test/renderizar';
import type { Rol } from '../types/auth';
import { ProtectedRoute } from './ProtectedRoute';

const destinos = [
  { path: '/login', element: <p>Pantalla de login</p> },
  { path: '/403', element: <p>Sin acceso</p> },
];

function renderizarConUsuario(rol: Rol | null) {
  const auth = crearAuth(
    rol
      ? {
          estado: 'autenticado',
          usuario: { idUsuario: 1, nombre: 'Ana', correo: 'ana@shopcart.gt', rol },
        }
      : {},
  );
  return renderizar(
    <ProtectedRoute roles={['Administrador']}>
      <p>Contenido privado</p>
    </ProtectedRoute>,
    { auth, ruta: '/consola', rutas: destinos },
  );
}

describe('ProtectedRoute', () => {
  it('sin sesión redirige a /login con la ruta original en redirect', async () => {
    const { router } = renderizarConUsuario(null);

    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?redirect=%2Fconsola');
  });

  it('con un rol sin permiso redirige a /403', async () => {
    renderizarConUsuario('Cliente');

    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });

  it('con un rol permitido muestra el contenido', async () => {
    renderizarConUsuario('Administrador');

    expect(await screen.findByText('Contenido privado')).toBeInTheDocument();
  });

  it('mientras se restaura la sesión muestra un indicador de carga', async () => {
    renderizar(
      <ProtectedRoute>
        <p>Contenido privado</p>
      </ProtectedRoute>,
      { auth: crearAuth({ estado: 'cargando' }) },
    );

    expect(await screen.findByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    expect(screen.queryByText('Contenido privado')).not.toBeInTheDocument();
  });
});
