import { logger } from '../../config/logger.js';
import { cache, type ResultadoCache } from '../../shared/cache/cache.js';
import { claves } from '../../shared/cache/claves.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { Rol } from '../../shared/types/express.js';
import {
  hashearContrasena,
  verificarContraHashFicticio,
  verificarContrasena,
} from '../../shared/utils/contrasenas.js';
import { authRepository } from './auth.repository.js';
import {
  ROLES,
  type DatosRegistro,
  type FilaUsuario,
  type ResultadoRefresh,
  type ResultadoSesion,
  type Usuario,
  type UsuarioSesion,
} from './auth.types.js';
import { intentosStore } from './intentos.store.js';
import { exigirRedis } from './redisFailClosed.js';
import { revocacionStore } from './revocacion.store.js';
import { sesionesStore } from './sesiones.store.js';
import { firmarAccessToken, leerAccessTokenParaRevocar } from './tokens.js';

/** Vida de la caché shopcart:usuario:{id} (la usan refresh y /me). */
export const TTL_CACHE_USUARIO_SEG = 900;

const MENSAJE_CREDENCIALES = 'Correo o contraseña incorrectos.';
const MENSAJE_INACTIVO = 'El usuario está desactivado. Contacta al administrador.';
const MENSAJE_REFRESH = 'La sesión expiró o fue revocada. Inicia sesión de nuevo.';

function aRol(valor: string): Rol {
  if ((ROLES as readonly string[]).includes(valor)) return valor as Rol;
  throw new Error(`Rol desconocido devuelto por la base: ${valor}`);
}

export function aUsuario(fila: FilaUsuario): Usuario {
  return {
    idUsuario: fila.IDUsuario,
    correo: fila.Correo,
    nombre: fila.Nombre,
    apellido: fila.Apellido,
    telefono: fila.Telefono,
    rol: aRol(fila.Rol),
    activo: Boolean(fila.Activo),
    fechaCreacion: new Date(fila.FechaCreacion).toISOString(),
  };
}

function aUsuarioSesion(usuario: {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  rol: Rol;
}): UsuarioSesion {
  const { idUsuario, nombre, apellido, correo, rol } = usuario;
  return { idUsuario, nombre, apellido, correo, rol };
}

function cuentaBloqueada(segundos: number): AppError {
  const minutos = Math.ceil(segundos / 60);
  return new AppError(
    'CUENTA_BLOQUEADA',
    `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
    undefined,
    { retryAfterSeg: segundos },
  );
}

/** Abre una sesión en Redis y emite el primer par de tokens. */
async function abrirSesion(usuario: UsuarioSesion): Promise<ResultadoSesion> {
  const { refreshToken, sid } = await sesionesStore.crear(usuario.idUsuario);
  const access = firmarAccessToken({ idUsuario: usuario.idUsuario, rol: usuario.rol, sid });
  return { ...access, usuario, refreshToken };
}

/** Usuario con rol y estado actuales, desde la caché o SP_Usuarios_ObtenerPorId. */
function obtenerUsuario(idUsuario: number): Promise<ResultadoCache<Usuario>> {
  return cache.getOrSet(claves.usuario(idUsuario), TTL_CACHE_USUARIO_SEG, async () =>
    aUsuario(await authRepository.obtenerPorId(idUsuario)),
  );
}

export const authService = {
  /** Registra un Cliente y abre su sesión, igual que un login. */
  async registrar(datos: DatosRegistro): Promise<ResultadoSesion> {
    // Sin Redis no se puede abrir la sesión: se rechaza antes de crear el usuario en la base.
    exigirRedis();
    const hashContrasena = await hashearContrasena(datos.contrasena);
    const fila = await authRepository.registrarCliente({
      correo: datos.correo,
      hashContrasena,
      nombre: datos.nombre,
      apellido: datos.apellido,
      telefono: datos.telefono,
    });
    return abrirSesion(aUsuarioSesion(aUsuario(fila)));
  },

  async login(correo: string, contrasena: string): Promise<ResultadoSesion> {
    const bloqueo = await intentosStore.segundosBloqueo(correo);
    if (bloqueo > 0) throw cuentaBloqueada(bloqueo);

    const credenciales = await authRepository.obtenerPorCorreo(correo);
    // Si el correo no existe se verifica igual contra un hash ficticio: misma demora.
    const valida = credenciales
      ? await verificarContrasena(credenciales.HashContrasena, contrasena)
      : await verificarContraHashFicticio(contrasena);

    if (!credenciales || !valida) {
      const { segundosBloqueo } = await intentosStore.registrarFallo(correo);
      if (segundosBloqueo > 0) throw cuentaBloqueada(segundosBloqueo);
      throw new AppError('CREDENCIALES_INVALIDAS', MENSAJE_CREDENCIALES);
    }

    // El estado se revela solo a quien conoce la contraseña.
    await intentosStore.limpiar(correo);
    if (!credenciales.Activo) throw new AppError('USUARIO_INACTIVO', MENSAJE_INACTIVO);

    return abrirSesion(
      aUsuarioSesion({
        idUsuario: credenciales.IDUsuario,
        nombre: credenciales.Nombre,
        apellido: credenciales.Apellido,
        correo: credenciales.Correo,
        rol: aRol(credenciales.Rol),
      }),
    );
  },

  /**
   * Rota el refresh token y emite un access token con el rol y estado actuales del usuario.
   * Primero lee la sesión y el usuario, y solo al final rota: si la base falla, el refresh
   * token sigue sin usar y el cliente puede reintentar.
   */
  async refrescar(refreshToken: string | undefined): Promise<ResultadoRefresh> {
    if (!refreshToken) throw new AppError('REFRESH_INVALIDO', MENSAJE_REFRESH);

    const sesion = await sesionesStore.obtener(refreshToken);
    if (!sesion) throw new AppError('REFRESH_INVALIDO', MENSAJE_REFRESH);

    let usuario: Usuario;
    try {
      usuario = (await obtenerUsuario(sesion.idUsuario)).valor;
    } catch (error) {
      if (error instanceof AppError && error.code === 'NO_ENCONTRADO') {
        await sesionesStore.revocarFamilia(sesion.sid, sesion.idUsuario);
        throw new AppError('REFRESH_INVALIDO', MENSAJE_REFRESH);
      }
      throw error;
    }
    if (!usuario.activo) {
      await sesionesStore.revocarFamilia(sesion.sid, sesion.idUsuario);
      throw new AppError('USUARIO_INACTIVO', MENSAJE_INACTIVO);
    }

    const rotacion = await sesionesStore.rotar(refreshToken);
    if (rotacion.estado === 'reutilizado') {
      logger.warn(
        { idUsuario: rotacion.idUsuario, sid: rotacion.sid },
        'Refresh token reutilizado: se revocó la sesión completa',
      );
    }
    if (rotacion.estado !== 'rotado') throw new AppError('REFRESH_INVALIDO', MENSAJE_REFRESH);

    const access = firmarAccessToken({
      idUsuario: usuario.idUsuario,
      rol: usuario.rol,
      sid: rotacion.sid,
    });
    return { ...access, refreshToken: rotacion.refreshToken };
  },

  /**
   * Cierra la sesión: revoca el access token presentado (si tiene firma válida) y la sesión
   * del refresh token. Es idempotente: sin tokens, o con tokens ya revocados, no falla.
   */
  async logout(tokens: { refreshToken?: string; accessToken?: string }): Promise<void> {
    if (tokens.accessToken) {
      const claims = leerAccessTokenParaRevocar(tokens.accessToken);
      if (claims) {
        await revocacionStore.revocarAccessToken(claims.jti, claims.exp);
        await sesionesStore.revocarFamilia(claims.sid, claims.idUsuario);
      }
    }
    if (tokens.refreshToken) {
      const sesion = await sesionesStore.obtener(tokens.refreshToken);
      if (sesion) await sesionesStore.revocarFamilia(sesion.sid, sesion.idUsuario);
    }
  },

  /** Usuario de la sesión para GET /auth/me. `hit` alimenta el header X-Cache. */
  async obtenerUsuarioActual(idUsuario: number): Promise<ResultadoCache<UsuarioSesion>> {
    const { valor, hit } = await obtenerUsuario(idUsuario);
    if (!valor.activo) throw new AppError('USUARIO_INACTIVO', MENSAJE_INACTIVO);
    return { valor: aUsuarioSesion(valor), hit };
  },
};
