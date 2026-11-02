import { cache } from '../../shared/cache/cache.js';
import { claves } from '../../shared/cache/claves.js';
import { hashearContrasena } from '../../shared/utils/contrasenas.js';
import {
  respuestaPaginada,
  type Paginacion,
  type RespuestaPaginada,
} from '../../shared/utils/paginacion.js';
import { aUsuario } from '../auth/auth.service.js';
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

  async crear(idSolicitante: number, datos: DatosUsuarioNuevo): Promise<Usuario> {
    const { contrasena, ...resto } = datos;
    const hashContrasena = await hashearContrasena(contrasena);
    return aUsuario(await usuariosRepository.crear(idSolicitante, { ...resto, hashContrasena }));
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
