/** Contrato de los SPs: Database/scripts/013_sp_reportes.sql. */

/** Rango en días locales de Guatemala (`YYYY-MM-DD`), ambos inclusive. Ausente = sin límite. */
export interface RangoReporte {
  desde?: string | undefined;
  hasta?: string | undefined;
}

export type Agrupacion = 'dia' | 'semana' | 'mes';

/** Rango como lo recibe el SP: parámetros DATE (medianoche UTC del día, sin zona). */
export interface RangoReporteSp {
  desde: Date | null;
  hasta: Date | null;
}

/** SP_Reportes_ResumenDashboard. */
export interface FilaResumen {
  VentasNetas: number;
  Pedidos: number;
  TicketPromedio: number;
  UnidadesNetas: number;
  EnvioCobrado: number;
  CarritosAbandonados: number;
}

/** SP_Reportes_VentasPorPeriodo. */
export interface FilaVentasPeriodo {
  /** DATE: el driver lo entrega como Date a medianoche UTC. */
  PeriodoInicio: Date | string;
  Ventas: number;
  Pedidos: number;
  UnidadesNetas: number;
}

/** SP_Reportes_VentasPorCategoria. */
export interface FilaVentasCategoria {
  IDCategoria: number;
  Categoria: string;
  UnidadesVendidas: number;
  UnidadesDevueltas: number;
  UnidadesNetas: number;
  VentaBruta: number;
  MontoReembolsado: number;
  VentaNeta: number;
}

/** SP_Reportes_ProductosMasVendidos. */
export interface FilaProductoVendido {
  IDProducto: number;
  Producto: string;
  IDCategoria: number;
  Categoria: string;
  UnidadesNetas: number;
  VentaNeta: number;
}

/** RS1 de SP_Reportes_CarritosAbandonados. */
export interface FilaCarritoAbandonado {
  IDCarrito: number;
  IDUsuario: number | null;
  Tipo: 'CLIENTE' | 'INVITADO';
  Cliente: string | null;
  Correo: string | null;
  CantidadLineas: number;
  CantidadUnidades: number;
  Subtotal: number;
  Descuento: number;
  Valor: number;
  FechaCreacion: Date;
  FechaUltimaActividad: Date;
  HorasInactivo: number;
}

export interface Resumen {
  ventasNetas: string;
  pedidos: number;
  ticketPromedio: string;
  unidadesNetas: number;
  envioCobrado: string;
  carritosAbandonados: number;
}

export interface VentaPeriodo {
  periodoInicio: string;
  ventas: string;
  pedidos: number;
  unidadesNetas: number;
}

export interface VentaCategoria {
  idCategoria: number;
  categoria: string;
  unidadesVendidas: number;
  unidadesDevueltas: number;
  unidadesNetas: number;
  ventaBruta: string;
  montoReembolsado: string;
  ventaNeta: string;
}

export interface ProductoVendido {
  idProducto: number;
  producto: string;
  idCategoria: number;
  categoria: string;
  unidadesNetas: number;
  ventaNeta: string;
}

export interface CarritoAbandonado {
  idCarrito: number;
  idUsuario: number | null;
  tipo: 'CLIENTE' | 'INVITADO';
  cliente: string | null;
  correo: string | null;
  cantidadLineas: number;
  cantidadUnidades: number;
  subtotal: string;
  descuento: string;
  valor: string;
  fechaCreacion: string;
  fechaUltimaActividad: string;
  horasInactivo: number;
}
