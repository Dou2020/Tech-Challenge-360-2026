import sql from 'mssql';
import { executeSp, type ResultadoSp } from '../../db/executeSp.js';
import { parametrosPaginacion, type Paginacion } from '../../shared/utils/paginacion.js';
import { authRepository } from '../auth/auth.repository.js';
import type { FilaUsuario } from '../auth/auth.types.js';
import type {
  DatosUsuarioActualizado,
  DatosUsuarioNuevo,
  FilaUsuarioModificado,
  FiltrosUsuarios,
} from './usuarios.types.js';

/*
 * Las escrituras reciben @IDUsuarioSolicitante (del JWT) y pueden lanzar 50004 (solicitante
 * inexistente) y 50012 (desactivado). SP_Usuarios_Crear no comprueba el rol: lo hace authorize.
 */

const solicitante = (idUsuario: number) => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

function primeraFila<T>(resultado: ResultadoSp<T>, sp: string): T {
  const fila = resultado.filas[0];
  if (!fila) throw new Error(`${sp} no devolvió filas`);
  return fila;
}

export const usuariosRepository = {
  /** Literal en "nombre apellido" y correo; un rol inexistente da lista vacía. */
  listar(filtros: FiltrosUsuarios, paginacion: Paginacion): Promise<ResultadoSp<FilaUsuario>> {
    return executeSp<FilaUsuario>('SP_Usuarios_Listar', [
      { nombre: 'Texto', tipo: sql.NVarChar(100), valor: filtros.q ?? null },
      { nombre: 'Rol', tipo: sql.NVarChar(50), valor: filtros.rol ?? null },
      { nombre: 'Activo', tipo: sql.Bit, valor: filtros.activo ?? null },
      ...parametrosPaginacion(paginacion),
    ]);
  },

  /** 50004 si no existe. */
  obtenerPorId(idUsuario: number): Promise<FilaUsuario> {
    return authRepository.obtenerPorId(idUsuario);
  },

  /** Sin contraseña (hash NULL). 50001 (datos o rol Cliente), 2627 → DUPLICADO si el correo existe. */
  async crear(idSolicitante: number, datos: DatosUsuarioNuevo): Promise<FilaUsuario> {
    const resultado = await executeSp<FilaUsuario>('SP_Usuarios_Crear', [
      solicitante(idSolicitante),
      { nombre: 'Correo', tipo: sql.NVarChar(150), valor: datos.correo },
      { nombre: 'Nombre', tipo: sql.NVarChar(100), valor: datos.nombre },
      { nombre: 'Apellido', tipo: sql.NVarChar(100), valor: datos.apellido },
      { nombre: 'Telefono', tipo: sql.NVarChar(20), valor: datos.telefono },
      { nombre: 'Rol', tipo: sql.NVarChar(50), valor: datos.rol },
    ]);
    return primeraFila(resultado, 'SP_Usuarios_Crear');
  },

  /** 50004 (no existe), 50001 (vacíos o rol inexistente), 50051 (quita el último Administrador). */
  async actualizar(
    idSolicitante: number,
    idUsuario: number,
    datos: DatosUsuarioActualizado,
  ): Promise<FilaUsuarioModificado> {
    const resultado = await executeSp<FilaUsuarioModificado>('SP_Usuarios_Actualizar', [
      solicitante(idSolicitante),
      { nombre: 'IDUsuario', tipo: sql.Int, valor: idUsuario },
      { nombre: 'Nombre', tipo: sql.NVarChar(100), valor: datos.nombre },
      { nombre: 'Apellido', tipo: sql.NVarChar(100), valor: datos.apellido },
      { nombre: 'Telefono', tipo: sql.NVarChar(20), valor: datos.telefono },
      { nombre: 'Rol', tipo: sql.NVarChar(50), valor: datos.rol ?? null },
    ]);
    return primeraFila(resultado, 'SP_Usuarios_Actualizar');
  },

  /** 50004, 50051 (se desactiva a sí mismo o al último Administrador activo). */
  async cambiarEstado(
    idSolicitante: number,
    idUsuario: number,
    activo: boolean,
  ): Promise<FilaUsuarioModificado> {
    const resultado = await executeSp<FilaUsuarioModificado>('SP_Usuarios_CambiarEstado', [
      solicitante(idSolicitante),
      { nombre: 'IDUsuario', tipo: sql.Int, valor: idUsuario },
      { nombre: 'Activo', tipo: sql.Bit, valor: activo },
    ]);
    return primeraFila(resultado, 'SP_Usuarios_CambiarEstado');
  },
};
