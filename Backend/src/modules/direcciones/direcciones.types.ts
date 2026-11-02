/**
 * Fila de los SPs de direcciones y DTO de la API.
 * Contrato de los SPs: Database/scripts/007_sp_auth.sql (SP_Direcciones_*).
 */

/** RS-Dirección: forma común de todos los SP_Direcciones_* que devuelven filas. */
export interface FilaDireccion {
  IDDireccion: number;
  Alias: string;
  NombreDestinatario: string;
  Telefono: string;
  Linea1: string;
  Linea2: string | null;
  Municipio: string;
  Departamento: string;
  CodigoPostal: string | null;
  Referencias: string | null;
}

/** Body de POST y PUT ya validado; los opcionales vacíos llegan como null. */
export interface DatosDireccion {
  alias: string;
  nombreDestinatario: string;
  telefono: string;
  linea1: string;
  linea2: string | null;
  municipio: string;
  departamento: string;
  codigoPostal: string | null;
  referencias: string | null;
}

export interface Direccion extends DatosDireccion {
  idDireccion: number;
}
