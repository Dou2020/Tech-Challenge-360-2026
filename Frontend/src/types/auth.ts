export type Rol = 'Cliente' | 'Operador' | 'Administrador';

export interface Usuario {
  idUsuario: number;
  nombre: string;
  apellido?: string;
  correo: string;
  rol: Rol;
}

export interface RespuestaLogin {
  accessToken: string;
  expiraEn: number;
  usuario: Usuario;
}

export interface RespuestaRefresh {
  accessToken: string;
  expiraEn: number;
}

/** Cuerpo de POST /api/auth/registro (sin contraseña: se crea desde el enlace del correo). */
export interface DatosRegistro {
  correo: string;
  nombre: string;
  apellido: string;
  telefono?: string;
}

export interface RespuestaMensaje {
  mensaje: string;
}

export type PropositoToken = 'CREAR' | 'RESTABLECER';

/** Respuesta de POST /api/auth/contrasena/verificar. */
export interface RespuestaVerificarToken {
  proposito: PropositoToken;
  correo: string;
}

export type EstadoSesion = 'cargando' | 'autenticado' | 'anonimo';
