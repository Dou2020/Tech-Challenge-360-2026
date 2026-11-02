import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exigirRedis } from '../../../../src/modules/auth/redisFailClosed.js';
import { revocacionStore } from '../../../../src/modules/auth/revocacion.store.js';
import { perfilRepository } from '../../../../src/modules/perfil/perfil.repository.js';
import { perfilService } from '../../../../src/modules/perfil/perfil.service.js';
import { cache } from '../../../../src/shared/cache/cache.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';
import {
  hashearContrasena,
  verificarContrasena,
} from '../../../../src/shared/utils/contrasenas.js';

vi.mock('../../../../src/modules/auth/auth.repository.js', () => ({ authRepository: {} }));
vi.mock('../../../../src/modules/perfil/perfil.repository.js', () => ({
  perfilRepository: {
    obtenerCredencial: vi.fn(),
    actualizarPerfil: vi.fn(),
    cambiarContrasena: vi.fn(),
  },
}));
vi.mock('../../../../src/modules/auth/revocacion.store.js', () => ({
  revocacionStore: { revocarAccesoDelUsuario: vi.fn() },
}));
vi.mock('../../../../src/modules/auth/redisFailClosed.js', () => ({ exigirRedis: vi.fn() }));
vi.mock('../../../../src/shared/utils/contrasenas.js', () => ({
  hashearContrasena: vi.fn(),
  verificarContrasena: vi.fn(),
}));
vi.mock('../../../../src/shared/cache/cache.js', () => ({ cache: { borrar: vi.fn() } }));

const repo = vi.mocked(perfilRepository);
const ID = 7;
const SID = 'sid-actual';

beforeEach(() => {
  vi.resetAllMocks();
  repo.obtenerCredencial.mockResolvedValue({ IDUsuario: ID, HashContrasena: 'hash', Activo: true });
  vi.mocked(hashearContrasena).mockResolvedValue('hash-nuevo');
});

describe('perfilService.cambiarContrasena', () => {
  it('guarda el hash nuevo, revoca las demás sesiones y borra la caché', async () => {
    // Arrange
    vi.mocked(verificarContrasena).mockResolvedValue(true);

    // Act
    await perfilService.cambiarContrasena(ID, SID, {
      contrasenaActual: 'Actual123',
      contrasenaNueva: 'Nueva12345',
    });

    // Assert
    expect(repo.cambiarContrasena).toHaveBeenCalledWith(ID, 'hash-nuevo');
    expect(revocacionStore.revocarAccesoDelUsuario).toHaveBeenCalledWith(ID, SID);
    expect(cache.borrar).toHaveBeenCalledWith(`shopcart:usuario:${ID}`);
  });

  it('una contraseña actual incorrecta es 400 VALIDACION y no escribe ni revoca', async () => {
    // Arrange
    vi.mocked(verificarContrasena).mockResolvedValue(false);

    // Act
    const resultado = perfilService.cambiarContrasena(ID, SID, {
      contrasenaActual: 'mala',
      contrasenaNueva: 'Nueva12345',
    });

    // Assert
    await expect(resultado).rejects.toMatchObject({ code: 'VALIDACION', status: 400 });
    expect(repo.cambiarContrasena).not.toHaveBeenCalled();
    expect(revocacionStore.revocarAccesoDelUsuario).not.toHaveBeenCalled();
  });

  it('rechaza una contraseña nueva igual a la actual', async () => {
    // Arrange
    vi.mocked(verificarContrasena).mockResolvedValue(true);

    // Act
    const resultado = perfilService.cambiarContrasena(ID, SID, {
      contrasenaActual: 'Misma12345',
      contrasenaNueva: 'Misma12345',
    });

    // Assert
    await expect(resultado).rejects.toBeInstanceOf(AppError);
    expect(repo.cambiarContrasena).not.toHaveBeenCalled();
  });

  it('sin Redis falla antes de tocar la base', async () => {
    // Arrange
    vi.mocked(exigirRedis).mockImplementation(() => {
      throw new AppError('SERVICIO_NO_DISPONIBLE', 'sin redis');
    });

    // Act
    const resultado = perfilService.cambiarContrasena(ID, SID, {
      contrasenaActual: 'a',
      contrasenaNueva: 'b',
    });

    // Assert
    await expect(resultado).rejects.toMatchObject({ status: 503 });
    expect(repo.obtenerCredencial).not.toHaveBeenCalled();
  });
});
