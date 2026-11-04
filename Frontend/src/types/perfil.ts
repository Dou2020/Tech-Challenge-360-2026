import type { Rol } from './auth';

/** Usuario completo de GET /api/perfil. */
export interface Perfil {
  idUsuario: number;
  correo: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
  fechaCreacion: string;
  contrasenaPendiente: boolean;
}

/** Body de PUT /api/perfil: reemplaza los tres campos (sin telefono, se borra). */
export interface DatosPerfil {
  nombre: string;
  apellido: string;
  telefono?: string;
}

export interface DatosContrasena {
  contrasenaActual: string;
  contrasenaNueva: string;
}
