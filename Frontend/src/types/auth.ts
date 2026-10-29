export type Rol = 'Cliente' | 'Operador' | 'Administrador';

export interface Usuario {
  idUsuario: number;
  nombre: string;
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

export type EstadoSesion = 'cargando' | 'autenticado' | 'anonimo';
