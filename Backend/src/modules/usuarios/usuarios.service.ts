import { cache } from '../../shared/cache/cache.js';
import { claves } from '../../shared/cache/claves.js';
import {
  respuestaPaginada,
  type Paginacion,
  type RespuestaPaginada,
} from '../../shared/utils/paginacion.js';
import { AppError } from '../../shared/errors/AppError.js';
import { aUsuario } from '../auth/auth.service.js';
import { enviarEnlaceContrasena } from '../auth/enlacesContrasena.js';
import type { Usuario } from '../auth/auth.types.js';
import { exigirRedis } from '../auth/redisFailClosed.js';
import { revocacionStore } from '../auth/revocacion.store.js';
import { usuariosRepository } from './usuarios.repository.js';
import type {
  DatosUsuarioActualizado,
  DatosUsuarioNuevo,
  FilaUsuarioModificado,
  FiltrosUsuarios,
} from './usuarios.types.js';

/**
 * Después de que el SP confirmó: si cambió el rol o el estado se cortan las sesiones y los
 * access tokens vigentes del usuario, y siempre se borra su caché (nombre, rol y estado).
 */
async function aplicarEfectos(fila: FilaUsuarioModificado): Promise<Usuario> {
  if (fila.RolCambio || fila.ActivoCambio) {
    await revocacionStore.revocarAccesoDelUsuario(fila.IDUsuario);
  }
  await cache.borrar(claves.usuario(fila.IDUsuario));
  return aUsuario(fila);
}

export const usuariosService = {
  async listar(
    filtros: FiltrosUsuarios,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<Usuario>> {
    return respuestaPaginada(
      await usuariosRepository.listar(filtros, paginacion),
      paginacion,
      aUsuario,
    );
  },

  async obtener(idUsuario: number): Promise<Usuario> {
    return aUsuario(await usuariosRepository.obtenerPorId(idUsuario));
  },

  /**
   * Crea el usuario sin contraseña y le manda la invitación con el enlace para crearla. El envío
   * es en segundo plano. Sin Redis (donde vive el token) se rechaza antes de escribir en la base.
   * Si el envío del token fallara después, el usuario queda creado y pendiente: el Administrador
   * puede reenviar la invitación.
   */
  async crear(idSolicitante: number, datos: DatosUsuarioNuevo): Promise<Usuario> {
    exigirRedis();
    const usuario = aUsuario(await usuariosRepository.crear(idSolicitante, datos));
    await enviarEnlaceContrasena('invitacion', {
      idUsuario: usuario.idUsuario,
      correo: usuario.correo,
      nombre: usuario.nombre,
      rol: usuario.rol,
    });
    return usuario;
  },

  /**
   * Reenvía el enlace para crear la contraseña (el anterior queda invalidado).
   * 409 CONTRASENA_YA_CREADA si el usuario ya la creó (para eso existe la recuperación);
   * 403 USUARIO_INACTIVO si está desactivado: no se invita a una cuenta desactivada.
   */
  async reenviarInvitacion(idUsuario: number): Promise<void> {
    exigirRedis();
    const usuario = aUsuario(await usuariosRepository.obtenerPorId(idUsuario));
    if (!usuario.contrasenaPendiente) {
      throw new AppError(
        'CONTRASENA_YA_CREADA',
        'El usuario ya creó su contraseña. Si la olvidó, puede recuperarla desde el inicio de sesión.',
      );
    }
    if (!usuario.activo) {
      throw new AppError(
        'USUARIO_INACTIVO',
        'El usuario está desactivado: actívalo antes de reenviarle la invitación.',
      );
    }
    await enviarEnlaceContrasena(usuario.rol === 'Cliente' ? 'bienvenida' : 'invitacion', {
      idUsuario: usuario.idUsuario,
      correo: usuario.correo,
      nombre: usuario.nombre,
      rol: usuario.rol,
    });
  },

  async actualizar(
    idSolicitante: number,
    idUsuario: number,
    datos: DatosUsuarioActualizado,
  ): Promise<Usuario> {
    // Un cambio de rol corta sesiones en Redis: sin Redis se rechaza antes de escribir.
    exigirRedis();
    return aplicarEfectos(await usuariosRepository.actualizar(idSolicitante, idUsuario, datos));
  },

  async cambiarEstado(idSolicitante: number, idUsuario: number, activo: boolean): Promise<Usuario> {
    exigirRedis();
    return aplicarEfectos(await usuariosRepository.cambiarEstado(idSolicitante, idUsuario, activo));
  },
};
