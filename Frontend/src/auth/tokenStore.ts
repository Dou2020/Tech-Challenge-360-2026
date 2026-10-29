/**
 * Access token en memoria (nunca en localStorage: no queda expuesto a scripts).
 * El refresh token vive en una cookie httpOnly que el navegador envía solo a /api/auth.
 */
let accessToken: string | null = null;
const alExpirar = new Set<() => void>();

export const tokenStore = {
  get: (): string | null => accessToken,

  set: (token: string): void => {
    accessToken = token;
  },

  clear: (): void => {
    accessToken = null;
  },

  /** Suscribe una función que se ejecuta cuando la sesión ya no se puede renovar. */
  onSesionExpirada: (listener: () => void): (() => void) => {
    alExpirar.add(listener);
    return () => alExpirar.delete(listener);
  },

  notificarSesionExpirada: (): void => {
    accessToken = null;
    alExpirar.forEach((listener) => listener());
  },
};
