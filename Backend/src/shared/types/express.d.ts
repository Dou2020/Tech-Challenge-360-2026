/** Nombres de la tabla Rol. */
export type Rol = 'Cliente' | 'Operador' | 'Administrador';

/** Usuario del access token; lo deja `authenticate`. */
export interface UsuarioAutenticado {
  idUsuario: number;
  rol: Rol;
  /** Identificador del access token (revocación en logout). */
  jti: string;
  /** Familia de la sesión (refresh token). */
  sid: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioAutenticado;
    /** Header X-Cart-Token del carrito de invitado; lo deja `guestCart`. */
    tokenCarrito?: string;
  }
}
