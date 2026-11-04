/**
 * Clave del Idempotency-Key del pago. Se crea una vez por intento de pago y se guarda en
 * sessionStorage: un reintento o un doble clic reutilizan la misma, y se descarta al terminar.
 */
const CLAVE = 'shopcart:idempotency-key';

export const idempotencia = {
  /** Clave del intento en curso, o null si no hay. */
  actual(): string | null {
    try {
      return sessionStorage.getItem(CLAVE);
    } catch {
      return null;
    }
  },

  /** Devuelve la clave del intento en curso o crea una nueva. */
  obtenerOCrear(): string {
    const existente = idempotencia.actual();
    if (existente) return existente;
    const nueva = crypto.randomUUID();
    try {
      sessionStorage.setItem(CLAVE, nueva);
    } catch {
      // Sin almacenamiento la clave solo dura este intento.
    }
    return nueva;
  },

  descartar(): void {
    try {
      sessionStorage.removeItem(CLAVE);
    } catch {
      // Nada que descartar.
    }
  },
};
