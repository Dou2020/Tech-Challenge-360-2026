import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { crearAuth, renderizar } from '../../test/renderizar';
import type { Usuario } from '../../types/auth';
import LoginPage from './LoginPage';

const administrador: Usuario = {
  idUsuario: 1,
  nombre: 'Admin',
  correo: 'admin@shopcart.gt',
  rol: 'Administrador',
};

const destinos = [
  { path: '/consola', element: <p>Consola</p> },
  { path: '/consola/pedidos', element: <p>Pedidos</p> },
];

describe('LoginPage', () => {
  it('valida el formulario sin llamar a la API', async () => {
    const auth = crearAuth();
    renderizar(<LoginPage />, { auth, ruta: '/login' });

    await userEvent.type(screen.getByLabelText('Correo'), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Ingresa un correo válido.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
    expect(auth.iniciarSesion).not.toHaveBeenCalled();
  });

  it('inicia sesión y lleva al inicio del rol', async () => {
    const auth = crearAuth({ iniciarSesion: vi.fn().mockResolvedValue(administrador) });
    renderizar(<LoginPage />, { auth, ruta: '/login', rutas: destinos });

    await userEvent.type(screen.getByLabelText('Correo'), 'admin@shopcart.gt');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Admin#2026');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Consola')).toBeInTheDocument();
    expect(auth.iniciarSesion).toHaveBeenCalledWith('admin@shopcart.gt', 'Admin#2026');
  });

  it('vuelve a la ruta indicada en redirect', async () => {
    const auth = crearAuth({ iniciarSesion: vi.fn().mockResolvedValue(administrador) });
    renderizar(<LoginPage />, {
      auth,
      ruta: '/login?redirect=%2Fconsola%2Fpedidos',
      rutas: destinos,
    });

    await userEvent.type(screen.getByLabelText('Correo'), 'admin@shopcart.gt');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Admin#2026');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Pedidos')).toBeInTheDocument();
  });

  it('muestra el mensaje de error de la API', async () => {
    const auth = crearAuth({
      iniciarSesion: vi
        .fn()
        .mockRejectedValue(
          new ApiError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.'),
        ),
    });
    renderizar(<LoginPage />, { auth, ruta: '/login' });

    await userEvent.type(screen.getByLabelText('Correo'), 'admin@shopcart.gt');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  });

  it.each([
    [
      'CUENTA_BLOQUEADA',
      'Demasiados intentos fallidos. Tu acceso está bloqueado temporalmente; inténtalo de nuevo en unos 15 minutos.',
    ],
    ['USUARIO_INACTIVO', 'Tu cuenta está desactivada. Contacta a un administrador.'],
  ])('código %s → muestra el mensaje específico', async (codigo, mensaje) => {
    // Arrange
    const auth = crearAuth({
      iniciarSesion: vi.fn().mockRejectedValue(new ApiError(429, codigo, 'Mensaje del backend.')),
    });
    renderizar(<LoginPage />, { auth, ruta: '/login' });
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.gt');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje);
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Arrange
    const auth = crearAuth({ iniciarSesion: vi.fn().mockRejectedValue(new Error('red')) });
    renderizar(<LoginPage />, { auth, ruta: '/login' });
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.gt');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo iniciar sesión.');
  });

  it.each(['//evil.com', 'https://evil.com', 'consola'])(
    'redirect externo o inválido (%s) → ignora el destino y va al inicio del rol',
    async (redirect) => {
      // Arrange
      const auth = crearAuth({ iniciarSesion: vi.fn().mockResolvedValue(administrador) });
      const { router } = renderizar(<LoginPage />, {
        auth,
        ruta: `/login?redirect=${encodeURIComponent(redirect)}`,
        rutas: destinos,
      });
      await userEvent.type(screen.getByLabelText('Correo'), 'admin@shopcart.gt');
      await userEvent.type(screen.getByLabelText('Contraseña'), 'Admin#2026');

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

      // Assert
      expect(await screen.findByText('Consola')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/consola');
    },
  );

  it('mientras entra → el botón queda deshabilitado', async () => {
    // Arrange
    let terminar: (u: Usuario) => void = () => undefined;
    const auth = crearAuth({
      iniciarSesion: vi.fn(() => new Promise<Usuario>((resolver) => (terminar = resolver))),
    });
    renderizar(<LoginPage />, { auth, ruta: '/login', rutas: destinos });
    await userEvent.type(screen.getByLabelText('Correo'), 'admin@shopcart.gt');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Admin#2026');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    // Assert
    expect(await screen.findByRole('button', { name: /Entrar/ })).toBeDisabled();
    terminar(administrador);
    await screen.findByText('Consola');
  });

  it('el enlace a crear cuenta conserva el redirect', () => {
    // Act
    renderizar(<LoginPage />, { ruta: '/login?redirect=%2Fcheckout' });

    // Assert
    expect(screen.getByRole('link', { name: 'Crear una cuenta' })).toHaveAttribute(
      'href',
      '/registro?redirect=%2Fcheckout',
    );
  });

  it('llega con un aviso en location.state → lo muestra', () => {
    // Act
    renderizar(<LoginPage />, {
      ruta: '/login',
      estadoRuta: {
        aviso: { tipo: 'exito', mensaje: 'Contraseña guardada. Ya puedes iniciar sesión.' },
      },
    });

    // Assert
    expect(screen.getByText('Contraseña guardada. Ya puedes iniciar sesión.')).toBeInTheDocument();
  });

  it('sin aviso en location.state → no muestra ningún aviso', () => {
    // Act
    renderizar(<LoginPage />, { ruta: '/login' });

    // Assert
    expect(screen.queryByText(/Contraseña guardada/)).not.toBeInTheDocument();
  });

  it('ofrece el enlace a /recuperar-contrasena', () => {
    // Act
    renderizar(<LoginPage />, { ruta: '/login' });

    // Assert
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/recuperar-contrasena',
    );
  });
});
