/** Sucursales de retiro (ver Backend/API.md, "Sucursales"). */

/** Sucursal activa del catálogo público (GET /catalogo/sucursales). Los opcionales vienen como null. */
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

/** Sucursal de gestión (Administrador): incluye inactivas y el conteo de pedidos. */
export interface SucursalGestion extends SucursalPublica {
  activo: boolean;
  cantidadPedidos: number;
  fechaCreacion: string;
  fechaModificacion: string | null;
}

/** Cuerpo de POST y PUT /sucursales. */
export interface DatosSucursal {
  nombre: string;
  telefono: string;
  linea1: string;
  municipio: string;
  departamento: string;
  linea2?: string;
  codigoPostal?: string;
  horario?: string;
}
