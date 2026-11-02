/** Fila de SP_Usuarios_ObtenerCredencialPorId (incluye al usuario inactivo). */
export interface FilaCredencial {
  IDUsuario: number;
  HashContrasena: string;
  Activo: boolean;
}

export interface DatosPerfil {
  nombre: string;
  apellido: string;
  /** null borra el teléfono. */
  telefono: string | null;
}

export interface DatosCambioContrasena {
  contrasenaActual: string;
  contrasenaNueva: string;
}
