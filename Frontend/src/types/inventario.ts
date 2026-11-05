/** Inventario (ver Backend/API.md, "Inventario"). Fechas ISO 8601 UTC; precio como string decimal. */

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
  bajoStock: boolean;
  umbralBajoStock: number;
  activo: boolean;
  productoActivo: boolean;
  categoriaActiva: boolean;
}

export interface Movimiento {
  idMovimientoInventario: number;
  idVariante: number;
  fecha: string;
  codigoTipoMovimiento: string;
  nombreTipoMovimiento: string;
  /** 1 suma, -1 resta. */
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

export interface MovimientoRegistrado extends Movimiento {
  sku: string;
  existenciaFisica: number;
  existenciaReservada: number;
  existenciaDisponible: number;
}

export interface TipoMovimiento {
  idTipoMovimientoInventario: number;
  codigo: string;
  nombre: string;
  signo: number;
}

export interface DatosEntrada {
  idVariante: number;
  cantidad: number;
  motivo?: string;
}

export interface DatosAjuste {
  idVariante: number;
  tipo: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  motivo: string;
}
