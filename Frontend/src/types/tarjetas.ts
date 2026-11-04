export type TipoTarjeta = 'CREDITO' | 'DEBITO';
export type MarcaTarjeta = 'VISA' | 'MASTERCARD' | 'AMEX' | 'OTRA';

/** Tarjeta guardada del Cliente (Backend/API.md, "Tarjetas guardadas"). Nunca incluye el número completo. */
export interface Tarjeta {
  idTarjeta: number;
  titular: string;
  ultimos4: string;
  tipo: TipoTarjeta;
  marca: MarcaTarjeta;
  predeterminada: boolean;
  /** ISO 8601 UTC. */
  fechaCreacion: string;
}

/** Body de POST /tarjetas. */
export interface DatosTarjeta {
  titular: string;
  ultimos4: string;
  tipo: TipoTarjeta;
  marca: MarcaTarjeta;
  predeterminada?: boolean;
}
