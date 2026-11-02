import { logger } from '../../config/logger.js';
import { cache, type ResultadoCache } from '../../shared/cache/cache.js';
import { claves } from '../../shared/cache/claves.js';
import { correo as correoSaliente } from '../../shared/correo/correo.js';
import { cuentaExistente } from '../../shared/correo/plantillas.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { Rol } from '../../shared/types/express.js';
import {
  hashearContrasena,
  verificarContraHashFicticio,
  verificarContrasena,
} from '../../shared/utils/contrasenas.js';
import { enlaceRecuperar, enviarEnlaceContrasena } from './enlacesContrasena.js';
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
import { tokensContrasenaStore, type PropositoToken } from './tokensContrasena.store.js';
import { firmarAccessToken, leerAccessTokenParaRevocar } from './tokens.js';

/** Vida de la caché shopcart:usuario:{id} (la usan refresh y /me). */
export const TTL_CACHE_USUARIO_SEG = 900;

const MENSAJE_CREDENCIALES = 'Correo o contraseña incorrectos.';
const MENSAJE_INACTIVO = 'El usuario está desactivado. Contacta al administrador.';
const MENSAJE_TOKEN = 'El enlace no es válido o ya venció. Solicita uno nuevo.';
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
    contrasenaPendiente: Boolean(fila.ContrasenaPendiente),
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
  /**
   * Registro sin contraseña: la cuenta se crea pendiente y el correo lleva el enlace para
   * crearla. El resultado es el mismo en todos los casos (el controlador responde 202 igual),
   * para no revelar qué correos ya existen:
   *   - correo nuevo: crea el Cliente y manda la bienvenida;
   *   - existe y sigue pendiente: reenvía el enlace para crear la contraseña;
   *   - existe con contraseña: avisa "ya tienes una cuenta" con el enlace a recuperar;
   *   - desactivado: no manda nada.
   * El envío es en segundo plano, y los tokens viven en Redis: sin Redis se rechaza antes de
   * crear el usuario en la base.
   */
  async registrar(datos: DatosRegistro): Promise<void> {
    exigirRedis();
    let existente = await authRepository.obtenerPorCorreo(datos.correo);

    if (!existente) {
      try {
        const fila = await authRepository.registrarCliente(datos);
        await enviarEnlaceContrasena('bienvenida', {
          idUsuario: fila.IDUsuario,
          correo: fila.Correo,
          nombre: fila.Nombre,
        });
        return;
      } catch (error) {
        // Dos registros simultáneos del mismo correo: el perdedor sigue el camino de "ya existe".
        if (!(error instanceof AppError && error.code === 'DUPLICADO')) throw error;
        existente = await authRepository.obtenerPorCorreo(datos.correo);
        if (!existente) return;
      }
    }

    if (!existente.Activo) return;
    if (existente.ContrasenaPendiente) {
      await enviarEnlaceContrasena('bienvenida', {
        idUsuario: existente.IDUsuario,
        correo: existente.Correo,
        nombre: existente.Nombre,
      });
      return;
    }
    correoSaliente.enviarEnSegundoPlano(
      cuentaExistente({
        para: existente.Correo,
        nombre: existente.Nombre,
        enlace: enlaceRecuperar(),
      }),
    );
  },

  /**
   * Recuperación de contraseña: solo emite si el usuario existe y está activo. Si todavía no
   * había creado su contraseña, le manda el enlace de creación en lugar del de restablecer.
   * No mira el bloqueo por intentos: recuperar la contraseña es justo lo que necesita quien
   * se bloqueó, y establecer la nueva limpia el bloqueo. Siempre termina sin error: el
   * controlador responde 202 igual exista o no el correo.
   */
  async solicitarRestablecimiento(correoUsuario: string): Promise<void> {
    exigirRedis();
    const usuario = await authRepository.obtenerPorCorreo(correoUsuario);
    if (!usuario?.Activo) return;
    await enviarEnlaceContrasena(usuario.ContrasenaPendiente ? 'bienvenida' : 'restablecer', {
      idUsuario: usuario.IDUsuario,
      correo: usuario.Correo,
      nombre: usuario.Nombre,
    });
  },

  /** Dice para qué sirve el token y de quién es, sin consumirlo. 400 TOKEN_CONTRASENA_INVALIDO. */
  async verificarToken(token: string): Promise<{ proposito: PropositoToken; correo: string }> {
    const datos = await tokensContrasenaStore.consultar(token);
    if (!datos) throw new AppError('TOKEN_CONTRASENA_INVALIDO', MENSAJE_TOKEN);
    try {
      const usuario = await authRepository.obtenerPorId(datos.idUsuario);
      return { proposito: datos.proposito, correo: usuario.Correo };
    } catch (error) {
      if (error instanceof AppError && error.code === 'NO_ENCONTRADO') {
        throw new AppError('TOKEN_CONTRASENA_INVALIDO', MENSAJE_TOKEN);
      }
      throw error;
    }
  },

  /**
   * Canjea el token (un solo uso), guarda la contraseña con el dueño del token como solicitante
   * y corta todo su acceso: sesiones abiertas, access tokens vigentes, caché y bloqueo de login.
   *
   * El token se consume antes de guardar: si el SP rechaza después (p. ej. 403 USUARIO_INACTIVO
   * porque lo desactivaron tras pedir el enlace) el enlace ya no sirve y hay que pedir otro.
   */
  async establecerContrasena(token: string, contrasena: string): Promise<void> {
    exigirRedis();
    const datos = await tokensContrasenaStore.canjear(token);
    if (!datos) throw new AppError('TOKEN_CONTRASENA_INVALIDO', MENSAJE_TOKEN);

    await authRepository.cambiarContrasena(datos.idUsuario, await hashearContrasena(contrasena));
    await revocacionStore.revocarAccesoDelUsuario(datos.idUsuario);
    await cache.borrar(claves.usuario(datos.idUsuario));
    const usuario = await authRepository.obtenerPorId(datos.idUsuario);
    await intentosStore.limpiar(usuario.Correo);
  },

  async login(correo: string, contrasena: string): Promise<ResultadoSesion> {
    const bloqueo = await intentosStore.segundosBloqueo(correo);
    if (bloqueo > 0) throw cuentaBloqueada(bloqueo);

    const credenciales = await authRepository.obtenerPorCorreo(correo);
    // Si el correo no existe se verifica igual contra un hash ficticio: misma demora.
    // Lo mismo si la contraseña está pendiente (hash NULL): no se revela que la cuenta existe.
    const valida = credenciales?.HashContrasena
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
