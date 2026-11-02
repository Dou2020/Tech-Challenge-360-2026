import sql from 'mssql';
import { executeSp } from '../../db/executeSp.js';
import type { FilaUsuario } from '../auth/auth.types.js';
import type { DatosPerfil, FilaCredencial } from './perfil.types.js';

export const perfilRepository = {
  /** 50004 si el usuario no existe. Trae también al inactivo. */
  async obtenerCredencial(idUsuario: number): Promise<FilaCredencial> {
    const { filas } = await executeSp<FilaCredencial>('SP_Usuarios_ObtenerCredencialPorId', [
      { nombre: 'IDUsuario', tipo: sql.Int, valor: idUsuario },
    ]);
    const fila = filas[0];
    if (!fila) throw new Error('SP_Usuarios_ObtenerCredencialPorId no devolvió filas');
    return fila;
  },

  /** 50001 (nombre o apellido vacío), 50004, 50012. Sin bitácora. */
  async actualizarPerfil(idUsuario: number, datos: DatosPerfil): Promise<FilaUsuario> {
    const { filas } = await executeSp<FilaUsuario>('SP_Usuarios_ActualizarPerfil', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: idUsuario },
      { nombre: 'Nombre', tipo: sql.NVarChar(100), valor: datos.nombre },
      { nombre: 'Apellido', tipo: sql.NVarChar(100), valor: datos.apellido },
      { nombre: 'Telefono', tipo: sql.NVarChar(20), valor: datos.telefono },
    ]);
    const fila = filas[0];
    if (!fila) throw new Error('SP_Usuarios_ActualizarPerfil no devolvió el usuario');
    return fila;
  },

  /** Recibe el hash nuevo ya calculado. Bitácora MODIFICAR sin el hash. 50004, 50012. */
  async cambiarContrasena(idUsuario: number, hashContrasena: string): Promise<void> {
    await executeSp('SP_Usuarios_CambiarContrasena', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: idUsuario },
      { nombre: 'HashContrasena', tipo: sql.NVarChar(255), valor: hashContrasena },
    ]);
  },
};
