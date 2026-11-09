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

  describe('todosLosCarritosAbandonados', () => {
    const carrito = (id: number) => ({ idCarrito: id });

    it('una sola página → la pide con pageSize 100 y el orden dado', async () => {
      // Arrange
      pedir.mockResolvedValueOnce({ items: [carrito(1)], page: 1, pageSize: 100, total: 1 });

      // Act
      const filas = await reportesApi.todosLosCarritosAbandonados({ ...rango, sort: 'valor:desc' });

      // Assert
      expect(filas).toEqual([carrito(1)]);
      expect(pedir).toHaveBeenCalledTimes(1);
      expect(pedir).toHaveBeenCalledWith(
        '/reportes/carritos-abandonados?desde=2026-11-01&hasta=2026-11-30&sort=valor%3Adesc&page=1&pageSize=100',
      );
    });

    it('varias páginas → las recorre hasta juntar el total', async () => {
      // Arrange
      const primera = Array.from({ length: 100 }, (_, i) => carrito(i + 1));
      pedir
        .mockResolvedValueOnce({ items: primera, page: 1, pageSize: 100, total: 102 })
        .mockResolvedValueOnce({
          items: [carrito(101), carrito(102)],
          page: 2,
          pageSize: 100,
          total: 102,
        });

      // Act
      const filas = await reportesApi.todosLosCarritosAbandonados(rango);

      // Assert
      expect(filas).toHaveLength(102);
      expect(pedir).toHaveBeenCalledTimes(2);
      expect(pedir).toHaveBeenLastCalledWith(expect.stringContaining('page=2&pageSize=100'));
    });

    it('página vacía antes del total (los datos cambiaron) → se detiene', async () => {
      // Arrange
      pedir
        .mockResolvedValueOnce({ items: [carrito(1)], page: 1, pageSize: 100, total: 150 })
        .mockResolvedValueOnce({ items: [], page: 2, pageSize: 100, total: 150 });

      // Act
      const filas = await reportesApi.todosLosCarritosAbandonados(rango);

      // Assert
      expect(filas).toEqual([carrito(1)]);
      expect(pedir).toHaveBeenCalledTimes(2);
    });

    it('sin carritos → arreglo vacío tras una sola petición', async () => {
      // Arrange
      pedir.mockResolvedValueOnce({ items: [], page: 1, pageSize: 100, total: 0 });

      // Act
      const filas = await reportesApi.todosLosCarritosAbandonados(rango);

      // Assert
      expect(filas).toEqual([]);
      expect(pedir).toHaveBeenCalledTimes(1);
    });
  });
});
