import sql from 'mssql';
import { executeSp } from '../../db/executeSp.js';
import type { DatosRegistro, FilaCredenciales, FilaUsuario } from './auth.types.js';

export const authRepository = {
  /** Correo repetido: el UNIQUE de Usuario.Correo (2627/2601) llega como DUPLICADO. */
  async registrarCliente(
    datos: Omit<DatosRegistro, 'contrasena'> & { hashContrasena: string },
  ): Promise<FilaUsuario> {
    const { filas } = await executeSp<FilaUsuario>('SP_Auth_RegistrarCliente', [
      { nombre: 'Correo', tipo: sql.NVarChar(150), valor: datos.correo },
      { nombre: 'HashContrasena', tipo: sql.NVarChar(255), valor: datos.hashContrasena },
      { nombre: 'Nombre', tipo: sql.NVarChar(100), valor: datos.nombre },
      { nombre: 'Apellido', tipo: sql.NVarChar(100), valor: datos.apellido },
      { nombre: 'Telefono', tipo: sql.NVarChar(20), valor: datos.telefono },
    ]);
    const fila = filas[0];
    if (!fila) throw new Error('SP_Auth_RegistrarCliente no devolvió el usuario creado');
    return fila;
  },

  /** Incluye usuarios inactivos; undefined si el correo no existe. */
  async obtenerPorCorreo(correo: string): Promise<FilaCredenciales | undefined> {
    const { filas } = await executeSp<FilaCredenciales>('SP_Auth_ObtenerUsuarioPorCorreo', [
      { nombre: 'Correo', tipo: sql.NVarChar(150), valor: correo },
    ]);
    return filas[0];
  },

  /** Si no existe, el SP lanza THROW 50004 → NO_ENCONTRADO. */
  async obtenerPorId(idUsuario: number): Promise<FilaUsuario> {
    const { filas } = await executeSp<FilaUsuario>('SP_Usuarios_ObtenerPorId', [
      { nombre: 'IDUsuario', tipo: sql.Int, valor: idUsuario },
    ]);
    const fila = filas[0];
    if (!fila) throw new Error('SP_Usuarios_ObtenerPorId no devolvió filas');
    return fila;
  },
};
