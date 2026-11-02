/** Contrato de los SPs: Database/scripts/014_sp_bitacora.sql. */

/** RS1 de SP_Bitacora_Listar. */
export interface FilaBitacora {
  /** BIGINT: el driver lo entrega como string. */
  IDBitacora: string | number;
  IDUsuario: number;
  Usuario: string;
  CorreoUsuario: string;
  Modulo: string;
  Entidad: string;
  IDRegistro: number | null;
  Accion: string;
  /** JSON como texto, o null. */
  ValorAnterior: string | null;
  ValorNuevo: string | null;
  Fecha: Date;
}

export interface FilaModulo {
  Modulo: string;
}

/** Filtros del query: fechas como texto (`YYYY-MM-DD` o instante ISO). */
export interface FiltrosBitacora {
  modulo?: string | undefined;
  entidad?: string | undefined;
  idRegistro?: number | undefined;
  idUsuario?: number | undefined;
  accion?: string | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
}

/** Filtros como los recibe el SP: instantes UTC inclusive. */
export interface FiltrosBitacoraSp {
  modulo: string | null;
  entidad: string | null;
  idRegistro: number | null;
  idUsuario: number | null;
  accion: string | null;
  desde: Date | null;
  hasta: Date | null;
}

export interface EntradaBitacora {
  /** BIGINT en la base; en JSON es number. */
  idBitacora: number;
  idUsuario: number;
  usuario: string;
  correoUsuario: string;
  modulo: string;
  entidad: string;
  idRegistro: number | null;
  accion: string;
  /** Objeto JSON ya interpretado (o null). */
  valorAnterior: unknown;
  valorNuevo: unknown;
  fecha: string;
}
