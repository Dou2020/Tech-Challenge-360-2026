import type { Rol } from '../../shared/types/express.js';

export const ROLES = ['Cliente', 'Operador', 'Administrador'] as const satisfies readonly Rol[];

/** Fila de SP_Auth_RegistrarCliente y SP_Usuarios_ObtenerPorId. */
export interface FilaUsuario {
  IDUsuario: number;
  Correo: string;
  Nombre: string;
  Apellido: string;
  Telefono: string | null;
  Rol: string;
  Activo: boolean;
  FechaCreacion: Date;
  /** true si aún no creó su contraseña (HashContrasena NULL). */
  ContrasenaPendiente: boolean;
}

/** Fila de SP_Auth_RegistrarCliente: la cuenta recién creada siempre está pendiente. */
export type FilaUsuarioRegistrado = Omit<FilaUsuario, 'ContrasenaPendiente'>;

/** Fila de SP_Auth_ObtenerUsuarioPorCorreo (incluye el hash y a los inactivos). */
export interface FilaCredenciales {
  IDUsuario: number;
  Correo: string;
  /** NULL mientras la contraseña está pendiente: no se puede iniciar sesión. */
  HashContrasena: string | null;
  Nombre: string;
  Apellido: string;
  Rol: string;
  Activo: boolean;
  ContrasenaPendiente: boolean;
}

export interface DatosRegistro {
  correo: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
}

/** Usuario completo; es lo que se guarda en la caché shopcart:usuario:{id}. */
export interface Usuario {
  idUsuario: number;
  correo: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
  /** ISO 8601 UTC. */
  fechaCreacion: string;
  /** true si aún no creó su contraseña: espera el enlace del correo (se puede reenviar). */
  contrasenaPendiente: boolean;
}

/** Usuario de la sesión, tal como lo reciben el login, el registro y GET /auth/me. */
export interface UsuarioSesion {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  rol: Rol;
}

export interface AccessTokenEmitido {
  accessToken: string;
  /** Segundos de vida del access token. */
  expiraEn: number;
}

/** Resultado del login; el controlador pone refreshToken en la cookie. */
export interface ResultadoSesion extends AccessTokenEmitido {
  usuario: UsuarioSesion;
  refreshToken: string;
}

/** Resultado del refresh; el controlador pone refreshToken en la cookie. */
export interface ResultadoRefresh extends AccessTokenEmitido {
  refreshToken: string;
}
