import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authRepository } from '../../../../src/modules/auth/auth.repository.js';
import { authService } from '../../../../src/modules/auth/auth.service.js';
import type { FilaCredenciales, FilaUsuario } from '../../../../src/modules/auth/auth.types.js';
import { intentosStore } from '../../../../src/modules/auth/intentos.store.js';
import { exigirRedis } from '../../../../src/modules/auth/redisFailClosed.js';
import { revocacionStore } from '../../../../src/modules/auth/revocacion.store.js';
import { sesionesStore } from '../../../../src/modules/auth/sesiones.store.js';
import {
  firmarAccessToken,
  generarRefreshToken,
  verificarAccessToken,
} from '../../../../src/modules/auth/tokens.js';
import { cache } from '../../../../src/shared/cache/cache.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';
import {
  hashearContrasena,
  verificarContraHashFicticio,
  verificarContrasena,
} from '../../../../src/shared/utils/contrasenas.js';

vi.mock('../../../../src/modules/auth/auth.repository.js', () => ({
  authRepository: { registrarCliente: vi.fn(), obtenerPorCorreo: vi.fn(), obtenerPorId: vi.fn() },
}));
vi.mock('../../../../src/modules/auth/sesiones.store.js', () => ({
  sesionesStore: { crear: vi.fn(), obtener: vi.fn(), rotar: vi.fn(), revocarFamilia: vi.fn() },
}));
vi.mock('../../../../src/modules/auth/revocacion.store.js', () => ({
  revocacionStore: { revocarAccessToken: vi.fn() },
}));
vi.mock('../../../../src/modules/auth/intentos.store.js', () => ({
  intentosStore: { segundosBloqueo: vi.fn(), registrarFallo: vi.fn(), limpiar: vi.fn() },
}));
vi.mock('../../../../src/modules/auth/redisFailClosed.js', () => ({ exigirRedis: vi.fn() }));
vi.mock('../../../../src/shared/utils/contrasenas.js', () => ({
  hashearContrasena: vi.fn(),
  verificarContrasena: vi.fn(),
  verificarContraHashFicticio: vi.fn(),
}));
// Caché sin Redis: siempre carga de la base y lo informa como MISS.
vi.mock('../../../../src/shared/cache/cache.js', () => ({
  cache: {
    getOrSet: vi.fn(async (_clave: string, _ttl: number, cargar: () => Promise<unknown>) => ({
      valor: await cargar(),
      hit: false,
    })),
  },
}));

const repo = vi.mocked(authRepository);
const sesiones = vi.mocked(sesionesStore);
const intentos = vi.mocked(intentosStore);

const SID = '7b0c1f7e-2a54-4f11-9a0b-3a1c5d7e9f20';
const REFRESH = generarRefreshToken(SID);
const REFRESH_NUEVO = generarRefreshToken(SID);

const credencialesCliente: FilaCredenciales = {
  IDUsuario: 12,
  Correo: 'ana@shopcart.gt',
  HashContrasena: '$argon2id$v=19$m=65536,t=3,p=4$sal$hash',
  Nombre: 'Ana',
  Apellido: 'López',
  Rol: 'Cliente',
  Activo: true,
};

const filaUsuario: FilaUsuario = {
  IDUsuario: 12,
  Correo: 'ana@shopcart.gt',
  Nombre: 'Ana',
  Apellido: 'López',
  Telefono: '5555-1234',
  Rol: 'Cliente',
  Activo: true,
  FechaCreacion: new Date('2026-10-01T15:00:00Z'),
};

async function capturar(promesa: Promise<unknown>): Promise<AppError> {
  const error = await promesa.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

beforeEach(() => {
  vi.clearAllMocks();
  intentos.segundosBloqueo.mockResolvedValue(0);
  intentos.registrarFallo.mockResolvedValue({ intentos: 1, segundosBloqueo: 0 });
  intentos.limpiar.mockResolvedValue();
  sesiones.crear.mockResolvedValue({ refreshToken: REFRESH, sid: SID });
  sesiones.revocarFamilia.mockResolvedValue();
  vi.mocked(verificarContraHashFicticio).mockResolvedValue(false);
  vi.mocked(revocacionStore.revocarAccessToken).mockResolvedValue();
});

describe('authService.login', () => {
  it('con credenciales correctas abre la sesión, limpia los intentos y emite el access token', async () => {
    repo.obtenerPorCorreo.mockResolvedValue(credencialesCliente);
    vi.mocked(verificarContrasena).mockResolvedValue(true);

    const resultado = await authService.login('ana@shopcart.gt', 'Cliente#2026');

    expect(resultado.usuario).toEqual({
      idUsuario: 12,
      nombre: 'Ana',
      apellido: 'López',
      correo: 'ana@shopcart.gt',
      rol: 'Cliente',
    });
    expect(resultado.refreshToken).toBe(REFRESH);
    expect(resultado.expiraEn).toBe(900);
    expect(verificarAccessToken(resultado.accessToken)).toMatchObject({
      idUsuario: 12,
      rol: 'Cliente',
      sid: SID,
    });
    expect(intentos.limpiar).toHaveBeenCalledWith('ana@shopcart.gt');
    expect(sesiones.crear).toHaveBeenCalledWith(12);
  });

  it('con contraseña incorrecta responde 401 CREDENCIALES_INVALIDAS y cuenta el fallo', async () => {
    repo.obtenerPorCorreo.mockResolvedValue(credencialesCliente);
    vi.mocked(verificarContrasena).mockResolvedValue(false);

    const error = await capturar(authService.login('ana@shopcart.gt', 'mala'));

    expect(error.code).toBe('CREDENCIALES_INVALIDAS');
    expect(intentos.registrarFallo).toHaveBeenCalledWith('ana@shopcart.gt');
    expect(sesiones.crear).not.toHaveBeenCalled();
  });

  it('si el correo no existe verifica contra el hash ficticio y da el mismo error', async () => {
    repo.obtenerPorCorreo.mockResolvedValue(undefined);

    const error = await capturar(authService.login('nadie@shopcart.gt', 'Cliente#2026'));

    expect(error.code).toBe('CREDENCIALES_INVALIDAS');
    expect(error.message).toBe('Correo o contraseña incorrectos.');
    expect(verificarContraHashFicticio).toHaveBeenCalledWith('Cliente#2026');
    expect(verificarContrasena).not.toHaveBeenCalled();
    expect(intentos.registrarFallo).toHaveBeenCalledWith('nadie@shopcart.gt');
  });

  it('el fallo que alcanza el máximo responde 429 CUENTA_BLOQUEADA con Retry-After', async () => {
    repo.obtenerPorCorreo.mockResolvedValue(credencialesCliente);
    vi.mocked(verificarContrasena).mockResolvedValue(false);
    intentos.registrarFallo.mockResolvedValue({ intentos: 5, segundosBloqueo: 900 });

    const error = await capturar(authService.login('ana@shopcart.gt', 'mala'));

    expect(error.code).toBe('CUENTA_BLOQUEADA');
    expect(error.status).toBe(429);
    expect(error.retryAfterSeg).toBe(900);
  });

  it('con la cuenta bloqueada responde 429 sin consultar la base, aun con la contraseña correcta', async () => {
    intentos.segundosBloqueo.mockResolvedValue(420);

    const error = await capturar(authService.login('ana@shopcart.gt', 'Cliente#2026'));

    expect(error.code).toBe('CUENTA_BLOQUEADA');
    expect(error.retryAfterSeg).toBe(420);
    expect(repo.obtenerPorCorreo).not.toHaveBeenCalled();
    expect(verificarContrasena).not.toHaveBeenCalled();
  });

  it('un usuario inactivo con la contraseña correcta recibe 403 USUARIO_INACTIVO', async () => {
    repo.obtenerPorCorreo.mockResolvedValue({ ...credencialesCliente, Activo: false });
    vi.mocked(verificarContrasena).mockResolvedValue(true);

    const error = await capturar(authService.login('ana@shopcart.gt', 'Cliente#2026'));

    expect(error.code).toBe('USUARIO_INACTIVO');
    expect(sesiones.crear).not.toHaveBeenCalled();
  });

  it('un usuario inactivo con la contraseña incorrecta recibe 401: no se revela su estado', async () => {
    repo.obtenerPorCorreo.mockResolvedValue({ ...credencialesCliente, Activo: false });
    vi.mocked(verificarContrasena).mockResolvedValue(false);

    const error = await capturar(authService.login('ana@shopcart.gt', 'mala'));

    expect(error.code).toBe('CREDENCIALES_INVALIDAS');
  });

  it('propaga el 503 si Redis no responde al revisar el bloqueo', async () => {
    intentos.segundosBloqueo.mockRejectedValue(
      new AppError('SERVICIO_NO_DISPONIBLE', 'Redis caído'),
    );

    const error = await capturar(authService.login('ana@shopcart.gt', 'Cliente#2026'));

    expect(error.code).toBe('SERVICIO_NO_DISPONIBLE');
    expect(repo.obtenerPorCorreo).not.toHaveBeenCalled();
  });
});

describe('authService.registrar', () => {
  const datos = {
    correo: 'ana@shopcart.gt',
    contrasena: 'Segura2026',
    nombre: 'Ana',
    apellido: 'López',
    telefono: '5555-1234',
  };

  it('guarda el hash (nunca la contraseña) y abre la sesión como Cliente', async () => {
    vi.mocked(hashearContrasena).mockResolvedValue('$argon2id$hash');
    repo.registrarCliente.mockResolvedValue(filaUsuario);

    const resultado = await authService.registrar(datos);

    expect(repo.registrarCliente).toHaveBeenCalledWith({
      correo: 'ana@shopcart.gt',
      hashContrasena: '$argon2id$hash',
      nombre: 'Ana',
      apellido: 'López',
      telefono: '5555-1234',
    });
    expect(JSON.stringify(repo.registrarCliente.mock.calls)).not.toContain('Segura2026');
    expect(resultado.usuario.rol).toBe('Cliente');
    expect(resultado.refreshToken).toBe(REFRESH);
  });

  it('sin Redis responde 503 antes de crear el usuario en la base', async () => {
    vi.mocked(exigirRedis).mockImplementationOnce(() => {
      throw new AppError('SERVICIO_NO_DISPONIBLE', 'Redis caído');
    });

    const error = await capturar(authService.registrar(datos));

    expect(error.code).toBe('SERVICIO_NO_DISPONIBLE');
    expect(repo.registrarCliente).not.toHaveBeenCalled();
  });

  it('propaga DUPLICADO del SP (correo repetido)', async () => {
    vi.mocked(hashearContrasena).mockResolvedValue('$argon2id$hash');
    repo.registrarCliente.mockRejectedValue(new AppError('DUPLICADO', 'Ya existe.'));

    const error = await capturar(authService.registrar(datos));

    expect(error.code).toBe('DUPLICADO');
    expect(sesiones.crear).not.toHaveBeenCalled();
  });
});

describe('authService.refrescar', () => {
  beforeEach(() => {
    sesiones.obtener.mockResolvedValue({ idUsuario: 12, sid: SID });
    repo.obtenerPorId.mockResolvedValue(filaUsuario);
  });

  it('sin cookie responde 401 REFRESH_INVALIDO', async () => {
    const error = await capturar(authService.refrescar(undefined));

    expect(error.code).toBe('REFRESH_INVALIDO');
  });

  it('con un token desconocido o vencido responde 401 REFRESH_INVALIDO', async () => {
    sesiones.obtener.mockResolvedValue(undefined);

    const error = await capturar(authService.refrescar(REFRESH));

    expect(error.code).toBe('REFRESH_INVALIDO');
    expect(sesiones.rotar).not.toHaveBeenCalled();
  });

  it('rota el token y emite el access token con el rol actual de la base', async () => {
    repo.obtenerPorId.mockResolvedValue({ ...filaUsuario, Rol: 'Operador' });
    sesiones.rotar.mockResolvedValue({
      estado: 'rotado',
      idUsuario: 12,
      sid: SID,
      refreshToken: REFRESH_NUEVO,
    });

    const resultado = await authService.refrescar(REFRESH);

    expect(resultado.refreshToken).toBe(REFRESH_NUEVO);
    expect(verificarAccessToken(resultado.accessToken)).toMatchObject({
      idUsuario: 12,
      rol: 'Operador',
      sid: SID,
    });
    expect(cache.getOrSet).toHaveBeenCalledWith('shopcart:usuario:12', 900, expect.any(Function));
  });

  it('un token ya rotado (reutilizado) responde 401 REFRESH_INVALIDO', async () => {
    sesiones.rotar.mockResolvedValue({ estado: 'reutilizado', idUsuario: 12, sid: SID });

    const error = await capturar(authService.refrescar(REFRESH));

    expect(error.code).toBe('REFRESH_INVALIDO');
  });

  it('un usuario desactivado recibe 403 USUARIO_INACTIVO y su sesión se termina sin rotar', async () => {
    repo.obtenerPorId.mockResolvedValue({ ...filaUsuario, Activo: false });

    const error = await capturar(authService.refrescar(REFRESH));

    expect(error.code).toBe('USUARIO_INACTIVO');
    expect(sesiones.revocarFamilia).toHaveBeenCalledWith(SID, 12);
    expect(sesiones.rotar).not.toHaveBeenCalled();
  });

  it('un usuario que ya no existe termina la sesión con 401 REFRESH_INVALIDO', async () => {
    repo.obtenerPorId.mockRejectedValue(new AppError('NO_ENCONTRADO', 'No existe.'));

    const error = await capturar(authService.refrescar(REFRESH));

    expect(error.code).toBe('REFRESH_INVALIDO');
    expect(sesiones.revocarFamilia).toHaveBeenCalledWith(SID, 12);
  });

  it('si la base falla no rota: el refresh token sigue sirviendo para reintentar', async () => {
    repo.obtenerPorId.mockRejectedValue(new Error('ECONNRESET'));

    await expect(authService.refrescar(REFRESH)).rejects.toThrow('ECONNRESET');
    expect(sesiones.rotar).not.toHaveBeenCalled();
  });
});

describe('authService.logout', () => {
  it('revoca el jti del access token y la sesión', async () => {
    const { accessToken } = firmarAccessToken({ idUsuario: 12, rol: 'Cliente', sid: SID });
    sesiones.obtener.mockResolvedValue({ idUsuario: 12, sid: SID });

    await authService.logout({ accessToken, refreshToken: REFRESH });

    expect(revocacionStore.revocarAccessToken).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
    );
    expect(sesiones.revocarFamilia).toHaveBeenCalledWith(SID, 12);
  });

  it('sin tokens no falla (idempotente)', async () => {
    await expect(authService.logout({})).resolves.toBeUndefined();
    expect(sesiones.revocarFamilia).not.toHaveBeenCalled();
  });

  it('ignora un access token con firma inválida', async () => {
    await authService.logout({ accessToken: 'no.es.jwt' });

    expect(revocacionStore.revocarAccessToken).not.toHaveBeenCalled();
  });
});

describe('authService.obtenerUsuarioActual', () => {
  it('devuelve el usuario de la sesión e informa si vino de la caché', async () => {
    repo.obtenerPorId.mockResolvedValue(filaUsuario);

    const resultado = await authService.obtenerUsuarioActual(12);

    expect(resultado).toEqual({
      valor: {
        idUsuario: 12,
        nombre: 'Ana',
        apellido: 'López',
        correo: 'ana@shopcart.gt',
        rol: 'Cliente',
      },
      hit: false,
    });
  });

  it('un usuario desactivado recibe 403 USUARIO_INACTIVO', async () => {
    repo.obtenerPorId.mockResolvedValue({ ...filaUsuario, Activo: false });

    const error = await capturar(authService.obtenerUsuarioActual(12));

    expect(error.code).toBe('USUARIO_INACTIVO');
  });
});
