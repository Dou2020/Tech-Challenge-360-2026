import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../http';
import { authApi } from './auth';

vi.mock('../http', () => ({ request: vi.fn(), renovarSesion: vi.fn() }));
const pedir = vi.mocked(request);

describe('authApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('login → POST con correo y contraseña, sin intentar renovar ante un 401', async () => {
    // Act
    await authApi.login('cliente@shopcart.gt', 'Cliente#2026');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { correo: 'cliente@shopcart.gt', contrasena: 'Cliente#2026' },
      sinRenovar: true,
    });
  });

  it('registro → POST con los datos, sin intentar renovar', async () => {
    // Arrange
    const datos = { correo: 'a@b.gt', nombre: 'Ana', apellido: 'López' };

    // Act
    await authApi.registro(datos);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/auth/registro', {
      method: 'POST',
      body: datos,
      sinRenovar: true,
    });
  });

  it('olvido → POST con el correo, sin renovar', async () => {
    // Act
    await authApi.olvido('a@b.gt');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/auth/contrasena/olvido', {
      method: 'POST',
      body: { correo: 'a@b.gt' },
      sinRenovar: true,
    });
  });

  it('verificarToken → POST con el token, sin renovar', async () => {
    // Act
    await authApi.verificarToken('tok');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/auth/contrasena/verificar', {
      method: 'POST',
      body: { token: 'tok' },
      sinRenovar: true,
    });
  });

  it('establecerContrasena → POST con token y contraseña, sin renovar', async () => {
    // Act
    await authApi.establecerContrasena('tok', 'Clave1234');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/auth/contrasena/establecer', {
      method: 'POST',
      body: { token: 'tok', contrasena: 'Clave1234' },
      sinRenovar: true,
    });
  });

  it('me → GET /auth/me', async () => {
    // Act
    await authApi.me();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/auth/me');
  });

  it('logout → POST sin intentar renovar', async () => {
    // Act
    await authApi.logout();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/auth/logout', { method: 'POST', sinRenovar: true });
  });
});
