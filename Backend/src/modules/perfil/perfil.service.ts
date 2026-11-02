import { cache } from '../../shared/cache/cache.js';
import { claves } from '../../shared/cache/claves.js';
import { AppError } from '../../shared/errors/AppError.js';
import { hashearContrasena, verificarContrasena } from '../../shared/utils/contrasenas.js';
import { authRepository } from '../auth/auth.repository.js';
import { aUsuario } from '../auth/auth.service.js';
import { exigirRedis } from '../auth/redisFailClosed.js';
import { revocacionStore } from '../auth/revocacion.store.js';
import type { Usuario } from '../auth/auth.types.js';
import { perfilRepository } from './perfil.repository.js';
import type { DatosCambioContrasena, DatosPerfil } from './perfil.types.js';

/*
 * Una contraseña actual equivocada responde 400 VALIDACION (campo contrasenaActual), no 401:
 * el frontend interpreta un 401 como access token vencido y trataría de renovar la sesión.
 */
const MENSAJE_ACTUAL = 'La contraseña actual no es correcta.';
const MENSAJE_IGUAL = 'La contraseña nueva debe ser distinta de la actual.';

function errorCampo(campo: string, mensaje: string): AppError {
  return new AppError('VALIDACION', 'La solicitud tiene datos inválidos.', [
    { field: campo, message: mensaje },
  ]);
}

export const perfilService = {
  /** Lee siempre de la base: el perfil es lo que el usuario acaba de editar. */
  async obtener(idUsuario: number): Promise<Usuario> {
    return aUsuario(await authRepository.obtenerPorId(idUsuario));
  },

  async actualizar(idUsuario: number, datos: DatosPerfil): Promise<Usuario> {
    const usuario = aUsuario(await perfilRepository.actualizarPerfil(idUsuario, datos));
    // La caché del usuario (GET /auth/me, refresh) lleva el nombre: se borra tras confirmar.
    await cache.borrar(claves.usuario(idUsuario));
    return usuario;
  },

  /**
   * Verifica la contraseña actual con argon2, guarda el hash nuevo y revoca las demás sesiones
   * del usuario. La sesión actual (`sidActual`) se conserva.
   */
  async cambiarContrasena(
    idUsuario: number,
    sidActual: string,
    datos: DatosCambioContrasena,
  ): Promise<void> {
    // Sin Redis no se pueden revocar las otras sesiones: se rechaza antes de tocar la base.
    exigirRedis();
    const credencial = await perfilRepository.obtenerCredencial(idUsuario);
    if (!(await verificarContrasena(credencial.HashContrasena, datos.contrasenaActual))) {
      throw errorCampo('contrasenaActual', MENSAJE_ACTUAL);
    }
    if (datos.contrasenaActual === datos.contrasenaNueva) {
      throw errorCampo('contrasenaNueva', MENSAJE_IGUAL);
    }

    await perfilRepository.cambiarContrasena(idUsuario, await hashearContrasena(datos.contrasenaNueva));
    await revocacionStore.revocarAccesoDelUsuario(idUsuario, sidActual);
    await cache.borrar(claves.usuario(idUsuario));
  },
};
