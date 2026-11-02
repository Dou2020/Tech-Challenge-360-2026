/**
 * Filas de los SPs de inventario (PascalCase, como las devuelve SQL Server) y DTOs de la API
 * (camelCase, montos como string de 2 decimales y fechas ISO 8601 UTC).
 * Contrato de los SPs: Database/scripts/009_sp_inventario.sql.
 */

// ---------------------------------------------------------------------------
// Filas de los SPs
// ---------------------------------------------------------------------------

/** SP_Inventario_ListarTiposMovimiento. */
export interface FilaTipoMovimiento {
  IDTipoMovimientoInventario: number;
  Codigo: string;
  Nombre: string;
  Signo: number;
}

/** RS1 de SP_Inventario_ListarExistencias. */
export interface FilaExistencia {
  IDVariante: number;
  SKU: string;
  IDProducto: number;
  Producto: string;
  IDCategoria: number;
  Categoria: string;
  Descripcion: string | null;
  Precio: number;
  ExistenciaFisica: number;
  /** Solo reservas vigentes. */
  ExistenciaReservada: number;
  ExistenciaDisponible: number;
  BajoStock: boolean;
  UmbralBajoStock: number;
  Activo: boolean;
  ProductoActivo: boolean;
  CategoriaActiva: boolean;
}

/** RS1 de SP_Inventario_ConsultarKardex. */
export interface FilaMovimiento {
  /** BIGINT: el driver lo entrega como string para no perder precisión. */
  IDMovimientoInventario: string | number;
  IDVariante: number;
  Fecha: Date;
  CodigoTipoMovimiento: string;
  NombreTipoMovimiento: string;
  Signo: number;
  Cantidad: number;
  ExistenciaAnterior: number;
  ExistenciaNueva: number;
  Motivo: string;
  IDUsuario: number;
  Usuario: string;
  IDPedido: number | null;
  NumeroPedido: string | null;
  IDDevolucion: number | null;
}

/** SP_Inventario_ObtenerMovimiento (resultado de RegistrarEntrada y RegistrarAjuste). */
export interface FilaMovimientoRegistrado extends FilaMovimiento {
  SKU: string;
  ExistenciaFisica: number;
  ExistenciaReservada: number;
  ExistenciaDisponible: number;
}

/** SP_Inventario_LiberarReservasVencidas. */
export interface FilaLiberacion {
  ReservasLiberadas: number;
  UnidadesLiberadas: number;
  VariantesAfectadas: number;
}

// ---------------------------------------------------------------------------
// Datos de entrada ya validados
// ---------------------------------------------------------------------------

export interface FiltrosExistencias {
  q?: string | undefined;
  idCategoria?: number | undefined;
  bajoStock?: boolean | undefined;
  activo?: boolean | undefined;
}

/** Query del kardex: fechas como texto (`YYYY-MM-DD` o instante ISO). */
export interface FiltrosKardex {
  desde?: string | undefined;
  hasta?: string | undefined;
  /** Código del tipo de movimiento (`AJUSTE_SALIDA`). */
  tipo?: string | undefined;
}

/** Filtros del kardex como los recibe el SP: instantes UTC inclusive. */
export interface FiltrosKardexSp {
  desde: Date | null;
  hasta: Date | null;
  tipo: string | null;
}

export interface DatosEntrada {
  idVariante: number;
  cantidad: number;
  /** null → el SP usa 'Entrada por compra'. */
  motivo: string | null;
}

export type TipoAjuste = 'ENTRADA' | 'SALIDA';

export interface DatosAjuste {
  idVariante: number;
  tipo: TipoAjuste;
  cantidad: number;
  motivo: string;
}

// ---------------------------------------------------------------------------
// DTOs de la API
// ---------------------------------------------------------------------------

export interface TipoMovimiento {
  idTipoMovimientoInventario: number;
  codigo: string;
  nombre: string;
  /** 1 suma a la existencia física, -1 resta. */
  signo: number;
}

export interface Existencia {
  idVariante: number;
  sku: string;
  idProducto: number;
  producto: string;
  idCategoria: number;
  categoria: string;
  descripcion: string | null;
  precio: string;
  existenciaFisica: number;
  existenciaReservada: number;
  existenciaDisponible: number;
  /** Disponible ≤ umbralBajoStock. */
  bajoStock: boolean;
  umbralBajoStock: number;
  activo: boolean;
  productoActivo: boolean;
  categoriaActiva: boolean;
}

export interface Movimiento {
  /** BIGINT en la base; en JSON es number (una identidad no llega a 2^53). */
  idMovimientoInventario: number;
  idVariante: number;
  fecha: string;
  codigoTipoMovimiento: string;
  nombreTipoMovimiento: string;
  signo: number;
  cantidad: number;
  existenciaAnterior: number;
  existenciaNueva: number;
  motivo: string;
  idUsuario: number;
  usuario: string;
  idPedido: number | null;
  numeroPedido: string | null;
  idDevolucion: number | null;
}

/** Respuesta de entradas y ajustes: el movimiento y la existencia de la variante tras él. */
export interface MovimientoRegistrado extends Movimiento {
  sku: string;
  existenciaFisica: number;
  existenciaReservada: number;
  existenciaDisponible: number;
}

export interface ResultadoLiberacion {
  reservasLiberadas: number;
  unidadesLiberadas: number;
  variantesAfectadas: number;
}
