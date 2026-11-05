/** Rangos de cada parámetro (Backend/API.md, "Configuración"). */
const REGLAS: Record<string, { entero: boolean; min: number; max: number; ayuda: string }> = {
  MinutosReserva: { entero: true, min: 1, max: 120, ayuda: 'Entero de 1 a 120 minutos.' },
  HorasCarritoAbandonado: { entero: true, min: 1, max: 720, ayuda: 'Entero de 1 a 720 horas.' },
  UmbralBajoStock: { entero: true, min: 0, max: Infinity, ayuda: 'Entero mayor o igual a 0.' },
  PorcentajeIVA: {
    entero: false,
    min: 0,
    max: 100,
    ayuda: 'Porcentaje de 0 a 100, hasta 2 decimales.',
  },
};

export function ayudaParametro(clave: string): string | undefined {
  return REGLAS[clave]?.ayuda;
}

/** Mensaje de error del valor de un parámetro, o null si es válido. El SP vuelve a validar. */
export function validarParametro(clave: string, valor: string): string | null {
  const texto = valor.trim();
  if (texto === '') return 'Es obligatorio.';
  if (texto.length > 200) return 'Máximo 200 caracteres.';
  const regla = REGLAS[clave];
  if (!regla) return null;
  const formato = regla.entero ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
  if (!formato.test(texto)) return regla.ayuda;
  const numero = Number(texto);
  return numero < regla.min || numero > regla.max ? regla.ayuda : null;
}
