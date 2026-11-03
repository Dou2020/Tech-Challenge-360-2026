/** Token del carrito de invitado: vive en localStorage y viaja en el header X-Cart-Token. */
const CLAVE = 'shopcart:token-invitado';

export const guestCart = {
  obtener(): string | null {
    try {
      return localStorage.getItem(CLAVE);
    } catch {
      return null; // Almacenamiento bloqueado: se trabaja sin token.
    }
  },

  guardar(token: string): void {
    try {
      localStorage.setItem(CLAVE, token);
    } catch {
      // Sin almacenamiento no se puede recordar el carrito de invitado.
    }
  },

  borrar(): void {
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      // Nada que borrar.
    }
  },

  /** Headers para las peticiones del carrito; vacío si no hay carrito de invitado. */
  cabeceras(): Record<string, string> {
    const token = guestCart.obtener();
    return token ? { 'X-Cart-Token': token } : {};
  },
};
