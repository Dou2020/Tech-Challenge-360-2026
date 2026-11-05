import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../http';
import { reportesApi } from './reportes';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);
const rango = { desde: '2026-11-01', hasta: '2026-11-30' };

describe('reportesApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it.each([
    ['resumen', () => reportesApi.resumen(rango), '/reportes/resumen'],
    ['ventas', () => reportesApi.ventas({ ...rango, agrupacion: 'dia' }), '/reportes/ventas'],
    [
      'ventasPorCategoria',
      () => reportesApi.ventasPorCategoria(rango),
      '/reportes/ventas-por-categoria',
    ],
    [
      'productosMasVendidos',
      () => reportesApi.productosMasVendidos(rango),
      '/reportes/productos-mas-vendidos',
    ],
    [
      'carritosAbandonados',
      () => reportesApi.carritosAbandonados(rango),
      '/reportes/carritos-abandonados',
    ],
  ])('%s → GET con desde y hasta', async (nombre, llamar, ruta) => {
    // Act
    await llamar();

    // Assert
    const sufijo = nombre === 'ventas' ? '&agrupacion=dia' : '';
    expect(pedir).toHaveBeenCalledWith(`${ruta}?desde=2026-11-01&hasta=2026-11-30${sufijo}`);
  });
});
