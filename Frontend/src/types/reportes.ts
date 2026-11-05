/** Reportes (ver Backend/API.md, "Reportes"). Montos como string decimal; `periodoInicio` como YYYY-MM-DD. */

export interface ResumenReportes {
  ventasNetas: string;
  pedidos: number;
  ticketPromedio: string;
  unidadesNetas: number;
  envioCobrado: string;
  carritosAbandonados: number;
}

export type Agrupacion = 'dia' | 'semana' | 'mes';

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
