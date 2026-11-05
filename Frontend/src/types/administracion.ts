/** Cupones, usuarios, bitácora y configuración (Administrador). Ver Backend/API.md. */
import type { Rol } from './auth';

export type TipoDescuento = 'PORCENTAJE' | 'MONTO_FIJO';

export interface Cupon {
  idCupon: number;
  codigo: string;
  descripcion: string | null;
  tipoDescuento: TipoDescuento;
  valor: string;
  idCategoria: number | null;
  categoria: string | null;
  montoMinimo: string;
  fechaInicio: string;
  fechaFin: string;
  limiteUsosTotal: number;
  limiteUsosPorCliente: number;
  usosActuales: number;
  usosDisponibles: number;
  activo: boolean;
  /** Solo mira las fechas (no `activo`). */
  vigente: boolean;
  agotado: boolean;
  cantidadPedidos: number;
  cantidadCarritos: number;
  puedeEliminarse: boolean;
}

/** Body de POST y PUT: montos como string y fechas como instante ISO 8601 con zona. */
export interface DatosCupon {
  codigo: string;
  descripcion?: string;
  tipoDescuento: TipoDescuento;
  valor: string;
  idCategoria?: number;
  montoMinimo: string;
  fechaInicio: string;
  fechaFin: string;
  limiteUsosTotal: number;
  limiteUsosPorCliente: number;
}

export interface UsoCupon {
  idUsoCupon: number;
  idPedido: number;
  numeroPedido: string;
  idUsuario: number;
  cliente: string;
  correo: string;
  descuento: string;
  totalPedido: string;
  estadoPedido: string;
  fecha: string;
}

export interface UsuarioAdmin {
  idUsuario: number;
  correo: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
  fechaCreacion: string;
  /** true mientras no haya creado su contraseña desde el enlace del correo. */
  contrasenaPendiente: boolean;
}

export interface DatosUsuarioNuevo {
  correo: string;
  nombre: string;
  apellido: string;
  telefono?: string;
  rol: 'Operador' | 'Administrador';
}

export interface DatosUsuarioEdicion {
  nombre: string;
  apellido: string;
  telefono?: string;
  rol: Rol;
}

export interface EntradaBitacora {
  idBitacora: number;
  idUsuario: number;
  usuario: string;
  correoUsuario: string;
  modulo: string;
  entidad: string;
  idRegistro: number | null;
  accion: string;
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
  fecha: string;
}

export interface ParametroConfiguracion {
  idConfiguracion: number;
  clave: string;
  valor: string;
  descripcion: string | null;
}
