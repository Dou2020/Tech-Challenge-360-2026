/** Dirección del Cliente (ver Backend/API.md, "Direcciones"). Los opcionales llegan como null. */
export interface Direccion {
  idDireccion: number;
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

/** Body de POST y PUT /api/direcciones. Omitir un opcional lo borra. */
export interface DatosDireccion {
  alias: string;
  nombreDestinatario: string;
  telefono: string;
  linea1: string;
  linea2?: string;
  municipio: string;
  departamento: string;
  codigoPostal?: string;
  referencias?: string;
}
