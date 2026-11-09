import type { ColumnaExportable } from '../types/exportacion';
import type {
  CarritoAbandonado,
  ProductoVendido,
  VentaCategoria,
  VentaPeriodo,
} from '../types/reportes';

/** Columnas de cada reporte al exportarlo. Son valores planos: la pantalla usa `Columna` con JSX. */
export const exportVentas: ColumnaExportable<VentaPeriodo>[] = [
  { titulo: 'Periodo (inicio)', tipo: 'dia', valor: (v) => v.periodoInicio, ancho: 16 },
  { titulo: 'Pedidos', tipo: 'entero', valor: (v) => v.pedidos, ancho: 10 },
  { titulo: 'Unidades', tipo: 'entero', valor: (v) => v.unidadesNetas, ancho: 10 },
  { titulo: 'Ventas netas', tipo: 'moneda', valor: (v) => v.ventas, ancho: 16 },
];

export const exportCategorias: ColumnaExportable<VentaCategoria>[] = [
  { titulo: 'Categoría', tipo: 'texto', valor: (c) => c.categoria, ancho: 24 },
  { titulo: 'Vendidas', tipo: 'entero', valor: (c) => c.unidadesVendidas, ancho: 10 },
  { titulo: 'Devueltas', tipo: 'entero', valor: (c) => c.unidadesDevueltas, ancho: 10 },
  { titulo: 'Netas', tipo: 'entero', valor: (c) => c.unidadesNetas, ancho: 10 },
  { titulo: 'Venta bruta', tipo: 'moneda', valor: (c) => c.ventaBruta, ancho: 16 },
  { titulo: 'Reembolsado', tipo: 'moneda', valor: (c) => c.montoReembolsado, ancho: 16 },
  { titulo: 'Venta neta', tipo: 'moneda', valor: (c) => c.ventaNeta, ancho: 16 },
];

export const exportTop: ColumnaExportable<ProductoVendido>[] = [
  { titulo: 'Producto', tipo: 'texto', valor: (p) => p.producto, ancho: 32 },
  { titulo: 'Categoría', tipo: 'texto', valor: (p) => p.categoria, ancho: 20 },
  { titulo: 'Unidades netas', tipo: 'entero', valor: (p) => p.unidadesNetas, ancho: 14 },
  { titulo: 'Venta neta', tipo: 'moneda', valor: (p) => p.ventaNeta, ancho: 16 },
];

export const exportCarritos: ColumnaExportable<CarritoAbandonado>[] = [
  {
    titulo: 'Tipo',
    tipo: 'texto',
    valor: (c) => (c.tipo === 'INVITADO' ? 'Invitado' : 'Cliente'),
    ancho: 10,
  },
  { titulo: 'Cliente', tipo: 'texto', valor: (c) => c.cliente, ancho: 24 },
  { titulo: 'Correo', tipo: 'texto', valor: (c) => c.correo, ancho: 28 },
  { titulo: 'Líneas', tipo: 'entero', valor: (c) => c.cantidadLineas, ancho: 8 },
  { titulo: 'Unidades', tipo: 'entero', valor: (c) => c.cantidadUnidades, ancho: 10 },
  { titulo: 'Subtotal', tipo: 'moneda', valor: (c) => c.subtotal, ancho: 14 },
  { titulo: 'Descuento', tipo: 'moneda', valor: (c) => c.descuento, ancho: 14 },
  { titulo: 'Valor', tipo: 'moneda', valor: (c) => c.valor, ancho: 14 },
  { titulo: 'Última actividad', tipo: 'fecha', valor: (c) => c.fechaUltimaActividad, ancho: 22 },
  { titulo: 'Horas inactivo', tipo: 'entero', valor: (c) => c.horasInactivo, ancho: 14 },
];
