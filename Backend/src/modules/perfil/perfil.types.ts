/** Fila de SP_Usuarios_ObtenerCredencialPorId (incluye al usuario inactivo). */
export interface FilaCredencial {
  IDUsuario: number;
  /** NULL si el usuario aún no creó su contraseña. */
  HashContrasena: string | null;
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
