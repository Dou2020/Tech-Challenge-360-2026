/**
 * Fila de los SPs de tarjetas y DTO de la API.
 * Contrato de los SPs: Database/scripts/015_sp_tarjetas.sql (SP_Tarjetas_*).
 * Solo se guardan titular, marca, tipo y últimos 4: nunca el número completo ni el CVV.
 */

/** RS-Tarjeta: forma común de los SP_Tarjetas_* que devuelven filas. */
export interface FilaTarjeta {
  IDTarjetaGuardada: number;
  Titular: string;
  Ultimos4: string;
  Tipo: string;
  Marca: string;
  Predeterminada: boolean;
  FechaCreacion: Date;
}

export interface DatosTarjeta {
  titular: string;
  ultimos4: string;
  tipo: string;
  marca: string;
  predeterminada: boolean;
}

export interface Tarjeta {
  idTarjeta: number;
  titular: string;
  ultimos4: string;
  tipo: string;
  marca: string;
  predeterminada: boolean;
  fechaCreacion: string;
}
