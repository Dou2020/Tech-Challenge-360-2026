/** Detalle de una sucursal (SP_Sucursales_*). */
export interface FilaSucursal {
  IDSucursal: number;
  Nombre: string;
  Telefono: string;
  Linea1: string;
  Linea2: string | null;
  Municipio: string;
  Departamento: string;
  CodigoPostal: string | null;
  Horario: string | null;
  Activo: boolean;
  CantidadPedidos: number;
  FechaCreacion: Date;
  FechaModificacion: Date;
}

/** SP_Catalogo_ListarSucursales. */
export interface FilaSucursalPublica {
  IDSucursal: number;
  Nombre: string;
  Telefono: string;
  Linea1: string;
  Linea2: string | null;
  Municipio: string;
  Departamento: string;
  CodigoPostal: string | null;
  Horario: string | null;
}

export interface FiltrosSucursales {
  q?: string | undefined;
  activo?: boolean | undefined;
}

/** Campos de POST y PUT (el PUT reemplaza todo: omitir un opcional lo borra). */
export interface DatosSucursal {
  nombre: string;
  telefono: string;
  linea1: string;
  linea2: string | null;
  municipio: string;
  departamento: string;
  codigoPostal: string | null;
  horario: string | null;
}

export interface SucursalPublica {
  idSucursal: number;
  nombre: string;
  telefono: string;
  linea1: string;
  linea2: string | null;
  municipio: string;
  departamento: string;
  codigoPostal: string | null;
  horario: string | null;
}

export interface Sucursal extends SucursalPublica {
  activo: boolean;
  cantidadPedidos: number;
  fechaCreacion: string;
  fechaModificacion: string;
}
