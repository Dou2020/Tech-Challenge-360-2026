import type { MarcaTarjeta, Tarjeta, TipoTarjeta } from '../types/tarjetas';

export const etiquetasTipoTarjeta: Record<TipoTarjeta, string> = {
  CREDITO: 'Crédito',
  DEBITO: 'Débito',
};

export const etiquetasMarcaTarjeta: Record<MarcaTarjeta, string> = {
  VISA: 'VISA',
  MASTERCARD: 'Mastercard',
  AMEX: 'American Express',
  OTRA: 'Otra',
};

export const tiposTarjeta = Object.keys(etiquetasTipoTarjeta) as TipoTarjeta[];
export const marcasTarjeta = Object.keys(etiquetasMarcaTarjeta) as MarcaTarjeta[];

/** "VISA · Crédito •••• 4242". */
export function resumenTarjeta(t: Pick<Tarjeta, 'marca' | 'tipo' | 'ultimos4'>): string {
  return `${etiquetasMarcaTarjeta[t.marca]} · ${etiquetasTipoTarjeta[t.tipo]} •••• ${t.ultimos4}`;
}

/** "VISA · Crédito •••• 4242 — Ana López". */
export function etiquetaTarjeta(t: Tarjeta): string {
  return `${resumenTarjeta(t)} — ${t.titular}`;
}
