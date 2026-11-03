import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../services/api/auth';
import { carritoApi } from '../services/api/carrito';
import type { Usuario } from '../types/auth';
import { guestCart } from '../utils/guestCart';
import { AuthProvider } from './AuthProvider';
import { tokenStore } from './tokenStore';
import { useAuth } from './useAuth';

vi.mock('../services/api/auth', () => ({
  authApi: { login: vi.fn(), renovar: vi.fn(), me: vi.fn(), logout: vi.fn() },
}));
vi.mock('../services/api/carrito', () => ({
  carritoApi: { fusionar: vi.fn(), obtener: vi.fn(), agregarItem: vi.fn() },
}));

const cliente: Usuario = {
  idUsuario: 7,
  nombre: 'Ana',
  correo: 'cliente@shopcart.gt',
  rol: 'Cliente',
};
const admin: Usuario = {
  idUsuario: 1,
  nombre: 'Admin',
  correo: 'admin@shopcart.gt',
  rol: 'Administrador',
};

function Entrar() {
  const [resultado, setResultado] = useState('');
  const { iniciarSesion, cerrarSesion, actualizarUsuario, usuario } = useAuth();
  return (
    <>
      <button onClick={() => void iniciarSesion('a@b.gt', 'x').catch(() => undefined)}>
        entrar
      </button>
      <button onClick={() => void cerrarSesion()}>salir</button>
      <button
        onClick={() =>
          void cerrarSesion().then(
            () => setResultado('cerró sin error'),
            () => setResultado('cerrar sesión rechazó'),
          )
        }
      >
        salir capturando
      </button>
      <p>{resultado}</p>
      <button onClick={() => actualizarUsuario({ nombre: 'Ana María' })}>renombrar</button>
      <p>{usuario ? `sesión de ${usuario.nombre}` : 'anónimo'}</p>
    </>
  );
}

function montar() {
  const queryClient = new QueryClient();
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Entrar />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { invalidar, queryClient };
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(authApi.renovar).mockReset().mockResolvedValue(false);
    vi.mocked(authApi.login).mockReset();
    vi.mocked(authApi.me).mockReset();
    vi.mocked(authApi.logout).mockReset();
    vi.mocked(carritoApi.fusionar)
      .mockReset()
      .mockResolvedValue({} as never);
  });

  afterEach(() => {
    localStorage.clear();
    tokenStore.clear();
  });

  it('al iniciar sesión fusiona el carrito de invitado y luego borra su token', async () => {
    // Arrange
    guestCart.guardar('token-invitado');
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'jwt',
      expiraEn: 900,
      usuario: cliente,
    });
    const { invalidar } = montar();
    await screen.findByText('anónimo');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));

    // Assert
    expect(await screen.findByText('sesión de Ana')).toBeInTheDocument();
    await waitFor(() => expect(guestCart.obtener()).toBeNull());
    expect(carritoApi.fusionar).toHaveBeenCalledWith('token-invitado');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['carrito'] });
  });

  it('sin token de invitado no llama a fusionar', async () => {
    // Arrange
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'jwt',
      expiraEn: 900,
      usuario: cliente,
    });
    montar();
    await screen.findByText('anónimo');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));

    // Assert
    await screen.findByText('sesión de Ana');
    expect(carritoApi.fusionar).not.toHaveBeenCalled();
  });

  it('el personal no fusiona el carrito y conserva el token', async () => {
    // Arrange
    guestCart.guardar('token-invitado');
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'jwt',
      expiraEn: 900,
      usuario: admin,
    });
    montar();
    await screen.findByText('anónimo');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));

    // Assert
    await screen.findByText('sesión de Admin');
    expect(carritoApi.fusionar).not.toHaveBeenCalled();
    expect(guestCart.obtener()).toBe('token-invitado');
  });

  it('si la fusión falla conserva el token de invitado', async () => {
    // Arrange
    guestCart.guardar('token-invitado');
    vi.mocked(carritoApi.fusionar).mockRejectedValue(new Error('red'));
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'jwt',
      expiraEn: 900,
      usuario: cliente,
    });
    montar();
    await screen.findByText('anónimo');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));

    // Assert
    await screen.findByText('sesión de Ana');
    expect(guestCart.obtener()).toBe('token-invitado');
  });

  it('al cargar con cookie de refresh válida → restaura la sesión del usuario', async () => {
    // Arrange
    vi.mocked(authApi.renovar).mockResolvedValue(true);
    vi.mocked(authApi.me).mockResolvedValue(cliente);

    // Act
    montar();

    // Assert
    expect(await screen.findByText('sesión de Ana')).toBeInTheDocument();
    expect(authApi.me).toHaveBeenCalledTimes(1);
  });

  it('al cargar sin sesión renovable → queda anónimo sin pedir el usuario', async () => {
    // Arrange
    vi.mocked(authApi.renovar).mockResolvedValue(false);

    // Act
    montar();

    // Assert
    expect(await screen.findByText('anónimo')).toBeInTheDocument();
    expect(authApi.me).not.toHaveBeenCalled();
  });

  it('al cargar, si /auth/me falla → queda anónimo', async () => {
    // Arrange
    vi.mocked(authApi.renovar).mockResolvedValue(true);
    vi.mocked(authApi.me).mockRejectedValue(new Error('red'));

    // Act
    montar();

    // Assert
    expect(await screen.findByText('anónimo')).toBeInTheDocument();
  });

  it('la sesión expira (refresh fallido) → vuelve a anónimo y vacía la caché de consultas', async () => {
    // Arrange
    vi.mocked(authApi.renovar).mockResolvedValue(true);
    vi.mocked(authApi.me).mockResolvedValue(cliente);
    const { queryClient } = montar();
    queryClient.setQueryData(['carrito'], { items: [] });
    await screen.findByText('sesión de Ana');

    // Act
    act(() => tokenStore.notificarSesionExpirada());

    // Assert
    expect(await screen.findByText('anónimo')).toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
    expect(queryClient.getQueryData(['carrito'])).toBeUndefined();
  });

  it('cerrar sesión → llama a logout, borra el token y deja la vista anónima', async () => {
    // Arrange
    vi.mocked(authApi.renovar).mockResolvedValue(true);
    vi.mocked(authApi.me).mockResolvedValue(cliente);
    vi.mocked(authApi.logout).mockResolvedValue(undefined);
    montar();
    await screen.findByText('sesión de Ana');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'salir' }));

    // Assert
    expect(await screen.findByText('anónimo')).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(tokenStore.get()).toBeNull();
  });

  it('cerrar sesión con el logout fallando → igualmente limpia la sesión local', async () => {
    // Arrange
    vi.mocked(authApi.renovar).mockResolvedValue(true);
    vi.mocked(authApi.me).mockResolvedValue(cliente);
    vi.mocked(authApi.logout).mockRejectedValue(new Error('red'));
    montar();
    await screen.findByText('sesión de Ana');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'salir capturando' }));

    // Assert
    expect(await screen.findByText('anónimo')).toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
  });

  it('cerrar sesión con el logout fallando → igualmente limpia la sesión local', async () => {
    // Arrange
    vi.mocked(authApi.renovar).mockResolvedValue(true);
    vi.mocked(authApi.me).mockResolvedValue(cliente);
    vi.mocked(authApi.logout).mockRejectedValue(new Error('red'));
    montar();
    await screen.findByText('sesión de Ana');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'salir capturando' }));

    // Assert
    expect(await screen.findByText('anónimo')).toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
  });

  // BUG: cerrarSesion usa try/finally sin catch, así que si POST /auth/logout falla (red caída) la
  // promesa se rechaza; AccountMenu la llama con `void cerrarSesion()` y queda un unhandled rejection.
  // Esperado: la sesión local se cierra y la promesa resuelve (el logout es de mejor esfuerzo).
  it('cerrar sesión con el logout fallando → la promesa no se rechaza', async () => {
    // Arrange
    vi.mocked(authApi.renovar).mockResolvedValue(true);
    vi.mocked(authApi.me).mockResolvedValue(cliente);
    vi.mocked(authApi.logout).mockRejectedValue(new Error('red'));
    montar();
    await screen.findByText('sesión de Ana');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'salir capturando' }));

    // Assert
    expect(await screen.findByText('cerró sin error')).toBeInTheDocument();
  });

  it('actualizarUsuario → cambia el nombre mostrado sin tocar el resto', async () => {
    // Arrange
    vi.mocked(authApi.renovar).mockResolvedValue(true);
    vi.mocked(authApi.me).mockResolvedValue(cliente);
    montar();
    await screen.findByText('sesión de Ana');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'renombrar' }));

    // Assert
    expect(await screen.findByText('sesión de Ana María')).toBeInTheDocument();
  });

  it('iniciar sesión sin usuario previo y con login fallido → sigue anónimo y propaga el error', async () => {
    // Arrange
    vi.mocked(authApi.login).mockRejectedValue(new Error('credenciales'));
    montar();
    await screen.findByText('anónimo');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));

    // Assert
    await waitFor(() => expect(authApi.login).toHaveBeenCalledTimes(1));
    expect(screen.getByText('anónimo')).toBeInTheDocument();
  });
});
