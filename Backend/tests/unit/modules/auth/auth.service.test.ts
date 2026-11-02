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
import { enviarEnlaceContrasena } from '../../../../src/modules/auth/enlacesContrasena.js';
import { tokensContrasenaStore } from '../../../../src/modules/auth/tokensContrasena.store.js';
import { cache } from '../../../../src/shared/cache/cache.js';
import { correo as correoSaliente } from '../../../../src/shared/correo/correo.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';
import {
  hashearContrasena,
  verificarContraHashFicticio,
  verificarContrasena,
} from '../../../../src/shared/utils/contrasenas.js';

vi.mock('../../../../src/modules/auth/auth.repository.js', () => ({
  authRepository: {
    registrarCliente: vi.fn(),
    obtenerPorCorreo: vi.fn(),
    obtenerPorId: vi.fn(),
    cambiarContrasena: vi.fn(),
  },
}));
vi.mock('../../../../src/modules/auth/enlacesContrasena.js', () => ({
  enviarEnlaceContrasena: vi.fn(),
  enlaceRecuperar: () => 'http://localhost:5173/recuperar-contrasena',
}));
vi.mock('../../../../src/modules/auth/tokensContrasena.store.js', () => ({
  tokensContrasenaStore: { consultar: vi.fn(), canjear: vi.fn() },
}));
vi.mock('../../../../src/shared/correo/correo.js', () => ({
  correo: { enviarEnSegundoPlano: vi.fn() },
}));
vi.mock('../../../../src/modules/auth/sesiones.store.js', () => ({
  sesionesStore: { crear: vi.fn(), obtener: vi.fn(), rotar: vi.fn(), revocarFamilia: vi.fn() },
}));
vi.mock('../../../../src/modules/auth/revocacion.store.js', () => ({
  revocacionStore: { revocarAccessToken: vi.fn(), revocarAccesoDelUsuario: vi.fn() },
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
    borrar: vi.fn(),
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
  ContrasenaPendiente: false,
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
  ContrasenaPendiente: false,
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

  it('con la contraseña pendiente (hash NULL) usa el hash ficticio y responde lo mismo que un correo inexistente', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValue({
      ...credencialesCliente,
      HashContrasena: null,
      ContrasenaPendiente: true,
    });

    // Act
    const error = await capturar(authService.login('ana@shopcart.gt', 'Cliente#2026'));

    // Assert
    expect(error.code).toBe('CREDENCIALES_INVALIDAS');
    expect(error.message).toBe('Correo o contraseña incorrectos.');
    expect(verificarContraHashFicticio).toHaveBeenCalledWith('Cliente#2026');
    expect(verificarContrasena).not.toHaveBeenCalled();
    expect(intentos.registrarFallo).toHaveBeenCalledWith('ana@shopcart.gt');
    expect(sesiones.crear).not.toHaveBeenCalled();
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
    nombre: 'Ana',
    apellido: 'López',
    telefono: '5555-1234',
  };
  const existente: FilaCredenciales = { ...credencialesCliente };

  beforeEach(() => {
    vi.mocked(enviarEnlaceContrasena).mockResolvedValue();
  });

  it('con un correo nuevo crea el Cliente sin contraseña y manda la bienvenida', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValue(undefined);
    repo.registrarCliente.mockResolvedValue(filaUsuario);

    // Act
    await authService.registrar(datos);

    // Assert
    expect(repo.registrarCliente).toHaveBeenCalledWith(datos);
    expect(enviarEnlaceContrasena).toHaveBeenCalledWith('bienvenida', {
      idUsuario: 12,
      correo: 'ana@shopcart.gt',
      nombre: 'Ana',
    });
    expect(sesiones.crear).not.toHaveBeenCalled();
  });

  it('con un correo pendiente reenvía el enlace sin crear otro usuario', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValue({
      ...existente,
      HashContrasena: null,
      ContrasenaPendiente: true,
    });

    // Act
    await authService.registrar(datos);

    // Assert
    expect(repo.registrarCliente).not.toHaveBeenCalled();
    expect(enviarEnlaceContrasena).toHaveBeenCalledWith(
      'bienvenida',
      expect.objectContaining({ idUsuario: 12 }),
    );
  });

  it('con un correo que ya tiene contraseña avisa "ya tienes cuenta" y no emite token', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValue(existente);

    // Act
    await authService.registrar(datos);

    // Assert
    expect(repo.registrarCliente).not.toHaveBeenCalled();
    expect(enviarEnlaceContrasena).not.toHaveBeenCalled();
    const mensaje = vi.mocked(correoSaliente.enviarEnSegundoPlano).mock.calls[0]![0];
    expect(mensaje.para).toBe('ana@shopcart.gt');
    expect(mensaje.texto).toContain('/recuperar-contrasena');
    expect(mensaje.texto).not.toContain('#token=');
  });

  it('con un usuario desactivado no manda nada', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValue({ ...existente, Activo: false });

    // Act
    await authService.registrar(datos);

    // Assert
    expect(enviarEnlaceContrasena).not.toHaveBeenCalled();
    expect(correoSaliente.enviarEnSegundoPlano).not.toHaveBeenCalled();
  });

  it('si otro registro se adelantó (DUPLICADO) sigue el camino de "ya existe" sin error', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValueOnce(undefined).mockResolvedValueOnce(existente);
    repo.registrarCliente.mockRejectedValue(new AppError('DUPLICADO', 'Ya existe.'));

    // Act
    await authService.registrar(datos);

    // Assert
    expect(correoSaliente.enviarEnSegundoPlano).toHaveBeenCalledTimes(1);
    expect(enviarEnlaceContrasena).not.toHaveBeenCalled();
  });

  it('propaga un error distinto de DUPLICADO', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValue(undefined);
    repo.registrarCliente.mockRejectedValue(new AppError('ERROR_INTERNO', 'Falló.'));

    // Act
    const error = await capturar(authService.registrar(datos));

    // Assert
    expect(error.code).toBe('ERROR_INTERNO');
  });

  it('sin Redis responde 503 antes de tocar la base', async () => {
    // Arrange
    vi.mocked(exigirRedis).mockImplementationOnce(() => {
      throw new AppError('SERVICIO_NO_DISPONIBLE', 'Redis caído');
    });

    // Act
    const error = await capturar(authService.registrar(datos));

    // Assert
    expect(error.code).toBe('SERVICIO_NO_DISPONIBLE');
    expect(repo.obtenerPorCorreo).not.toHaveBeenCalled();
    expect(repo.registrarCliente).not.toHaveBeenCalled();
  });
});

describe('authService.solicitarRestablecimiento', () => {
  beforeEach(() => {
    vi.mocked(enviarEnlaceContrasena).mockResolvedValue();
  });

  it('con un usuario activo con contraseña emite el enlace de restablecer', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValue(credencialesCliente);

    // Act
    await authService.solicitarRestablecimiento('ana@shopcart.gt');

    // Assert
    expect(enviarEnlaceContrasena).toHaveBeenCalledWith(
      'restablecer',
      expect.objectContaining({ idUsuario: 12, correo: 'ana@shopcart.gt' }),
    );
  });

  it('con un usuario que aún no creó su contraseña le manda el enlace de creación', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValue({
      ...credencialesCliente,
      HashContrasena: null,
      ContrasenaPendiente: true,
    });

    // Act
    await authService.solicitarRestablecimiento('ana@shopcart.gt');

    // Assert
    expect(enviarEnlaceContrasena).toHaveBeenCalledWith('bienvenida', expect.anything());
  });

  it('con un correo inexistente o desactivado no emite nada y no falla', async () => {
    // Arrange
    repo.obtenerPorCorreo.mockResolvedValueOnce(undefined);
    repo.obtenerPorCorreo.mockResolvedValueOnce({ ...credencialesCliente, Activo: false });

    // Act
    await authService.solicitarRestablecimiento('nadie@shopcart.gt');
    await authService.solicitarRestablecimiento('ana@shopcart.gt');

    // Assert
    expect(enviarEnlaceContrasena).not.toHaveBeenCalled();
  });
});

describe('authService.verificarToken', () => {
  it('devuelve el propósito y el correo del dueño sin consumir el token', async () => {
    // Arrange
    vi.mocked(tokensContrasenaStore.consultar).mockResolvedValue({
      idUsuario: 12,
      proposito: 'CREAR',
    });
    repo.obtenerPorId.mockResolvedValue(filaUsuario);

    // Act
    const resultado = await authService.verificarToken('token');

    // Assert
    expect(resultado).toEqual({ proposito: 'CREAR', correo: 'ana@shopcart.gt' });
    expect(tokensContrasenaStore.canjear).not.toHaveBeenCalled();
  });

  it('un token desconocido responde 400 TOKEN_CONTRASENA_INVALIDO', async () => {
    // Arrange
    vi.mocked(tokensContrasenaStore.consultar).mockResolvedValue(undefined);

    // Act
    const error = await capturar(authService.verificarToken('token'));

    // Assert
    expect(error.code).toBe('TOKEN_CONTRASENA_INVALIDO');
    expect(error.status).toBe(400);
  });

  it('un token cuyo usuario ya no existe responde 400 TOKEN_CONTRASENA_INVALIDO', async () => {
    // Arrange
    vi.mocked(tokensContrasenaStore.consultar).mockResolvedValue({
      idUsuario: 12,
      proposito: 'RESTABLECER',
    });
    repo.obtenerPorId.mockRejectedValue(new AppError('NO_ENCONTRADO', 'No existe.'));

    // Act
    const error = await capturar(authService.verificarToken('token'));

    // Assert
    expect(error.code).toBe('TOKEN_CONTRASENA_INVALIDO');
  });
});

describe('authService.establecerContrasena', () => {
  it('canjea el token, guarda el hash, corta el acceso del usuario y limpia el bloqueo', async () => {
    // Arrange
    vi.mocked(tokensContrasenaStore.canjear).mockResolvedValue({
      idUsuario: 12,
      proposito: 'CREAR',
    });
    vi.mocked(hashearContrasena).mockResolvedValue('$argon2id$hash');
    repo.obtenerPorId.mockResolvedValue(filaUsuario);

    // Act
    await authService.establecerContrasena('token', 'Segura2026');

    // Assert
    expect(repo.cambiarContrasena).toHaveBeenCalledWith(12, '$argon2id$hash');
    expect(JSON.stringify(repo.cambiarContrasena.mock.calls)).not.toContain('Segura2026');
    expect(revocacionStore.revocarAccesoDelUsuario).toHaveBeenCalledWith(12);
    expect(cache.borrar).toHaveBeenCalledWith('shopcart:usuario:12');
    expect(intentos.limpiar).toHaveBeenCalledWith('ana@shopcart.gt');
  });

  it('un token inválido responde 400 sin tocar la base', async () => {
    // Arrange
    vi.mocked(tokensContrasenaStore.canjear).mockResolvedValue(undefined);

    // Act
    const error = await capturar(authService.establecerContrasena('token', 'Segura2026'));

    // Assert
    expect(error.code).toBe('TOKEN_CONTRASENA_INVALIDO');
    expect(repo.cambiarContrasena).not.toHaveBeenCalled();
    expect(revocacionStore.revocarAccesoDelUsuario).not.toHaveBeenCalled();
  });

  it('si el SP rechaza (usuario desactivado) propaga el error y no revoca nada', async () => {
    // Arrange
    vi.mocked(tokensContrasenaStore.canjear).mockResolvedValue({
      idUsuario: 12,
      proposito: 'RESTABLECER',
    });
    vi.mocked(hashearContrasena).mockResolvedValue('$argon2id$hash');
    repo.cambiarContrasena.mockRejectedValue(new AppError('USUARIO_INACTIVO', 'Desactivado.'));

    // Act
    const error = await capturar(authService.establecerContrasena('token', 'Segura2026'));

    // Assert
    expect(error.code).toBe('USUARIO_INACTIVO');
    expect(revocacionStore.revocarAccesoDelUsuario).not.toHaveBeenCalled();
  });

  it('sin Redis responde 503 antes de consumir el token', async () => {
    // Arrange
    vi.mocked(exigirRedis).mockImplementationOnce(() => {
      throw new AppError('SERVICIO_NO_DISPONIBLE', 'Redis caído');
    });

    // Act
    const error = await capturar(authService.establecerContrasena('token', 'Segura2026'));

    // Assert
    expect(error.code).toBe('SERVICIO_NO_DISPONIBLE');
    expect(tokensContrasenaStore.canjear).not.toHaveBeenCalled();
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
