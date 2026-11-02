/**
 * Filas de los SPs de cupones y DTO de la API.
 * Contrato de los SPs: Database/scripts/011_sp_cupones.sql (SP_Cupones_*).
 */

export type TipoDescuento = 'PORCENTAJE' | 'MONTO_FIJO';

/** Lectura común de SP_Cupones_Listar, _ObtenerPorId, _Crear, _Actualizar y _CambiarEstado. */
export interface FilaCupon {
  IDCupon: number;
  Codigo: string;
  Descripcion: string | null;
  TipoDescuento: TipoDescuento;
  Valor: number;
  IDCategoria: number | null;
  Categoria: string | null;
  MontoMinimo: number;
  FechaInicio: Date;
  FechaFin: Date;
  LimiteUsosTotal: number;
  LimiteUsosPorCliente: number;
  UsosActuales: number;
  UsosDisponibles: number;
  Activo: boolean;
  Vigente: boolean;
  Agotado: boolean;
  CantidadPedidos: number;
  CantidadCarritos: number;
  PuedeEliminarse: boolean;
}

export interface FilaUsoCupon {
  IDUsoCupon: number;
  IDPedido: number;
  NumeroPedido: string;
  IDUsuario: number;
  Cliente: string;
  Correo: string;
  Descuento: number;
  TotalPedido: number;
  EstadoPedido: string;
  Fecha: Date;
}

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
  vigente: boolean;
  agotado: boolean;
  cantidadPedidos: number;
  cantidadCarritos: number;
  puedeEliminarse: boolean;
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

/** Body de POST y PUT ya validado (montos como number, fechas como Date). */
export interface DatosCupon {
  codigo: string;
  descripcion: string | null;
  tipoDescuento: TipoDescuento;
  valor: number;
  idCategoria: number | null;
  montoMinimo: number;
  fechaInicio: Date;
  fechaFin: Date;
  limiteUsosTotal: number;
  limiteUsosPorCliente: number;
}

export interface FiltrosCupones {
  q?: string | undefined;
  activo?: boolean | undefined;
  vigente?: boolean | undefined;
}
