import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revocacionStore } from '../../../../src/modules/auth/revocacion.store.js';
import { usuariosRepository } from '../../../../src/modules/usuarios/usuarios.repository.js';
import { usuariosService } from '../../../../src/modules/usuarios/usuarios.service.js';
import type { FilaUsuarioModificado } from '../../../../src/modules/usuarios/usuarios.types.js';
import { cache } from '../../../../src/shared/cache/cache.js';
import { hashearContrasena } from '../../../../src/shared/utils/contrasenas.js';

vi.mock('../../../../src/modules/auth/auth.repository.js', () => ({ authRepository: {} }));
vi.mock('../../../../src/modules/usuarios/usuarios.repository.js', () => ({
  usuariosRepository: {
    listar: vi.fn(),
    obtenerPorId: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
  },
}));
vi.mock('../../../../src/modules/auth/revocacion.store.js', () => ({
  revocacionStore: { revocarAccesoDelUsuario: vi.fn() },
}));
vi.mock('../../../../src/modules/auth/redisFailClosed.js', () => ({ exigirRedis: vi.fn() }));
vi.mock('../../../../src/shared/utils/contrasenas.js', () => ({ hashearContrasena: vi.fn() }));
vi.mock('../../../../src/shared/cache/cache.js', () => ({ cache: { borrar: vi.fn() } }));

const repo = vi.mocked(usuariosRepository);
const ADMIN = 1;

const fila = (cambios: Partial<FilaUsuarioModificado> = {}): FilaUsuarioModificado => ({
  IDUsuario: 9,
  Correo: 'o@shopcart.gt',
  Nombre: 'Op',
  Apellido: 'Erador',
  Telefono: null,
  Rol: 'Operador',
  Activo: true,
  FechaCreacion: new Date('2026-11-01T12:00:00Z'),
  RolCambio: false,
  ActivoCambio: false,
  ...cambios,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('usuariosService', () => {
  it('crea con el hash argon2 y sin la contraseña en claro', async () => {
    // Arrange
    vi.mocked(hashearContrasena).mockResolvedValue('hash');
    repo.crear.mockResolvedValue(fila());

    // Act
    const creado = await usuariosService.crear(ADMIN, {
      correo: 'o@shopcart.gt',
      contrasena: 'Clave12345',
      nombre: 'Op',
      apellido: 'Erador',
      telefono: null,
      rol: 'Operador',
    });

    // Assert
    const [, enviado] = repo.crear.mock.calls[0]!;
    expect(enviado).toMatchObject({ hashContrasena: 'hash' });
    expect(enviado).not.toHaveProperty('contrasena');
    expect(creado).toMatchObject({
      idUsuario: 9,
      rol: 'Operador',
      fechaCreacion: '2026-11-01T12:00:00.000Z',
    });
  });

  it('un cambio de estado revoca el acceso del usuario y borra su caché', async () => {
    // Arrange
    repo.cambiarEstado.mockResolvedValue(fila({ Activo: false, ActivoCambio: true }));

    // Act
    const usuario = await usuariosService.cambiarEstado(ADMIN, 9, false);

    // Assert
    expect(usuario.activo).toBe(false);
    expect(revocacionStore.revocarAccesoDelUsuario).toHaveBeenCalledWith(9);
    expect(cache.borrar).toHaveBeenCalledWith('shopcart:usuario:9');
  });

  it('un cambio de rol revoca el acceso', async () => {
    // Arrange
    repo.actualizar.mockResolvedValue(fila({ RolCambio: true }));

    // Act
    await usuariosService.actualizar(ADMIN, 9, {
      nombre: 'a',
      apellido: 'b',
      telefono: null,
      rol: 'Cliente',
    });

    // Assert
    expect(revocacionStore.revocarAccesoDelUsuario).toHaveBeenCalledWith(9);
  });

  it('un cambio sin efecto sobre rol o estado no revoca, pero sí borra la caché', async () => {
    // Arrange
    repo.actualizar.mockResolvedValue(fila());

    // Act
    await usuariosService.actualizar(ADMIN, 9, { nombre: 'a', apellido: 'b', telefono: null });

    // Assert
    expect(revocacionStore.revocarAccesoDelUsuario).not.toHaveBeenCalled();
    expect(cache.borrar).toHaveBeenCalledWith('shopcart:usuario:9');
  });

  it('lista con total y usuarios en camelCase', async () => {
    // Arrange
    repo.listar.mockResolvedValue({
      filas: [fila()],
      resultSets: [[fila()], [{ Total: 1 }]],
      returnValue: 0,
    });

    // Act
    const pagina = await usuariosService.listar({}, { page: 1, pageSize: 20, sort: 'nombre:asc' });

    // Assert
    expect(pagina).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(pagina.items[0]).toMatchObject({ correo: 'o@shopcart.gt', activo: true });
  });
});
