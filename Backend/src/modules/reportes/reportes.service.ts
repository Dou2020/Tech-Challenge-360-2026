import { env } from '../../config/env.js';
import { cache } from '../../shared/cache/cache.js';
import type { ResultadoCache } from '../../shared/cache/cache.js';
import { aIso } from '../../shared/utils/fechas.js';
import { aMonto } from '../../shared/utils/montos.js';
import {
  respuestaPaginada,
  type Paginacion,
  type RespuestaPaginada,
} from '../../shared/utils/paginacion.js';
import { reportesRepository } from './reportes.repository.js';
import type {
  Agrupacion,
  CarritoAbandonado,
  FilaCarritoAbandonado,
  FilaProductoVendido,
  FilaResumen,
  FilaVentasCategoria,
  FilaVentasPeriodo,
  ProductoVendido,
  RangoReporte,
  RangoReporteSp,
  Resumen,
  VentaCategoria,
  VentaPeriodo,
} from './reportes.types.js';

/**
 * Reportes: solo lectura. Se cachean (cache-aside, fail-open) porque no muestran existencia ni
 * reservas; `cache.invalidar('reportes')` la hacen, después de confirmar la transacción, los
 * servicios de pedidos y checkout, la actualización de categorías y productos (la vista une su
 * nombre y categoría actuales) y `PUT /api/configuracion/:clave`. Los carritos abandonados quedan
 * con TTL a propósito: un carrito se vuelve abandonado por el paso del tiempo, sin escritura alguna.
 * Un reporte nunca se calcula en Node: los montos vienen del SP.
 */

/** `YYYY-MM-DD` → parámetro DATE. Se envía como medianoche UTC para que el driver no lo corra de día. */
export function aRangoSp({ desde, hasta }: RangoReporte): RangoReporteSp {
  return {
    desde: desde === undefined ? null : new Date(`${desde}T00:00:00.000Z`),
    hasta: hasta === undefined ? null : new Date(`${hasta}T00:00:00.000Z`),
  };
}

/** Parte de la clave de caché: endpoint + filtros normalizados (orden fijo, `-` si no hay). */
export function claveReporte(endpoint: string, rango: RangoReporte, ...extra: (string | number)[]) {
  return [endpoint, rango.desde ?? '-', rango.hasta ?? '-', ...extra].join(':');
}

export function aResumen(f: FilaResumen): Resumen {
  return {
    ventasNetas: aMonto(f.VentasNetas),
    pedidos: f.Pedidos,
    ticketPromedio: aMonto(f.TicketPromedio),
    unidadesNetas: f.UnidadesNetas,
    envioCobrado: aMonto(f.EnvioCobrado),
    carritosAbandonados: f.CarritosAbandonados,
  };
}

/** PeriodoInicio es DATE: se toma la parte de fecha UTC, sin convertir de zona. */
export function aVentaPeriodo(f: FilaVentasPeriodo): VentaPeriodo {
  return {
    periodoInicio: aIso(f.PeriodoInicio).slice(0, 10),
    ventas: aMonto(f.Ventas),
    pedidos: f.Pedidos,
    unidadesNetas: f.UnidadesNetas,
  };
}

export function aVentaCategoria(f: FilaVentasCategoria): VentaCategoria {
  return {
    idCategoria: f.IDCategoria,
    categoria: f.Categoria,
    unidadesVendidas: f.UnidadesVendidas,
    unidadesDevueltas: f.UnidadesDevueltas,
    unidadesNetas: f.UnidadesNetas,
    ventaBruta: aMonto(f.VentaBruta),
    montoReembolsado: aMonto(f.MontoReembolsado),
    ventaNeta: aMonto(f.VentaNeta),
  };
}

export function aProductoVendido(f: FilaProductoVendido): ProductoVendido {
  return {
    idProducto: f.IDProducto,
    producto: f.Producto,
    idCategoria: f.IDCategoria,
    categoria: f.Categoria,
    unidadesNetas: f.UnidadesNetas,
    ventaNeta: aMonto(f.VentaNeta),
  };
}

export function aCarritoAbandonado(f: FilaCarritoAbandonado): CarritoAbandonado {
  return {
    idCarrito: f.IDCarrito,
    idUsuario: f.IDUsuario,
    tipo: f.Tipo,
    cliente: f.Cliente,
    correo: f.Correo,
    cantidadLineas: f.CantidadLineas,
    cantidadUnidades: f.CantidadUnidades,
    subtotal: aMonto(f.Subtotal),
    descuento: aMonto(f.Descuento),
    valor: aMonto(f.Valor),
    fechaCreacion: aIso(f.FechaCreacion),
    fechaUltimaActividad: aIso(f.FechaUltimaActividad),
    horasInactivo: f.HorasInactivo,
  };
}

function conCache<T>(clave: string, cargar: () => Promise<T>): Promise<ResultadoCache<T>> {
  return cache
    .claveVersionada('reportes', clave)
    .then((claveFinal) => cache.getOrSet(claveFinal, env.CACHE_TTL_REPORTES_SEG, cargar));
}

export const reportesService = {
  resumen(rango: RangoReporte): Promise<ResultadoCache<Resumen>> {
    return conCache(claveReporte('resumen', rango), async () => {
      const fila = await reportesRepository.resumen(aRangoSp(rango));
      if (!fila) throw new Error('SP_Reportes_ResumenDashboard no devolvió filas');
      return aResumen(fila);
    });
  },

  ventas(agrupacion: Agrupacion, rango: RangoReporte): Promise<ResultadoCache<VentaPeriodo[]>> {
    return conCache(claveReporte('ventas', rango, agrupacion), async () =>
      (await reportesRepository.ventasPorPeriodo(agrupacion, aRangoSp(rango))).map(aVentaPeriodo),
    );
  },

  ventasPorCategoria(rango: RangoReporte): Promise<ResultadoCache<VentaCategoria[]>> {
    return conCache(claveReporte('ventas-por-categoria', rango), async () =>
      (await reportesRepository.ventasPorCategoria(aRangoSp(rango))).map(aVentaCategoria),
    );
  },

  productosMasVendidos(
    limite: number,
    rango: RangoReporte,
  ): Promise<ResultadoCache<ProductoVendido[]>> {
    return conCache(claveReporte('productos-mas-vendidos', rango, limite), async () =>
      (await reportesRepository.productosMasVendidos(limite, aRangoSp(rango))).map(
        aProductoVendido,
      ),
    );
  },

  /**
   * Se cachea como los demás: no expone existencia. Un carrito que se abandona por el paso del
   * tiempo (sin evento) aparece al vencer el TTL; basta para un reporte administrativo.
   */
  carritosAbandonados(
    rango: RangoReporte,
    paginacion: Paginacion,
  ): Promise<ResultadoCache<RespuestaPaginada<CarritoAbandonado>>> {
    const { page, pageSize, sort } = paginacion;
    return conCache(claveReporte('carritos-abandonados', rango, page, pageSize, sort), async () => {
      const resultado = await reportesRepository.carritosAbandonados(aRangoSp(rango), paginacion);
      const pagina = respuestaPaginada(resultado, paginacion, aCarritoAbandonado);
      // Total es BIGINT: el driver lo entrega como string.
      return { ...pagina, total: Number(pagina.total) };
    });
  },
};
