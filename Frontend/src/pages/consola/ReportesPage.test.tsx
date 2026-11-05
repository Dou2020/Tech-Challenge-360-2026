import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportesApi } from '../../services/api/reportes';
import { userEvent } from '@testing-library/user-event';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import ReportesPage from './ReportesPage';

vi.mock('../../services/api/reportes', () => ({
  reportesApi: {
    ventas: vi.fn(),
    ventasPorCategoria: vi.fn(),
    productosMasVendidos: vi.fn(),
    carritosAbandonados: vi.fn(),
  },
}));
const api = vi.mocked(reportesApi);

describe('ReportesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.ventas.mockResolvedValue([
      { periodoInicio: '2026-11-03', ventas: '500.00', pedidos: 2, unidadesNetas: 4 },
    ]);
    api.ventasPorCategoria.mockResolvedValue([
      {
        idCategoria: 1,
        categoria: 'Camisetas',
        unidadesVendidas: 5,
        unidadesDevueltas: 1,
        unidadesNetas: 4,
        ventaBruta: '600.00',
        montoReembolsado: '100.00',
        ventaNeta: '500.00',
      },
    ]);
    api.productosMasVendidos.mockResolvedValue([
      {
        idProducto: 7,
        producto: 'Camiseta básica',
        idCategoria: 1,
        categoria: 'Camisetas',
        unidadesNetas: 4,
        ventaNeta: '500.00',
      },
    ]);
    api.carritosAbandonados.mockResolvedValue({
      items: [
        {
          idCarrito: 9,
          idUsuario: null,
          tipo: 'INVITADO',
          cliente: null,
          correo: null,
          cantidadLineas: 1,
          cantidadUnidades: 2,
          subtotal: '298.00',
          descuento: '0.00',
          valor: '298.00',
          fechaCreacion: '2026-11-01T10:00:00.000Z',
          fechaUltimaActividad: '2026-11-02T10:00:00.000Z',
          horasInactivo: 30,
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    });
  });

  it('muestra los reportes en tablas y pide los carritos con rango, orden y página', async () => {
    // Arrange / Act
    renderizar(<ReportesPage />, {
      ruta: '/consola/reportes?desde=2026-11-01&hasta=2026-11-30&sort=valor:desc',
    });

    // Assert
    const ventas = await screen.findByRole('table', { name: 'Ventas por día' });
    expect(within(ventas).getByText('03/11/2026')).toBeInTheDocument();
    expect(
      await screen.findByRole('table', { name: 'Productos más vendidos' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Invitado')).toBeInTheDocument();
    expect(api.carritosAbandonados).toHaveBeenCalledWith({
      desde: '2026-11-01',
      hasta: '2026-11-30',
      sort: 'valor:desc',
      page: 1,
      pageSize: 10,
    });
  });

  it('agrupación en la URL → pide las ventas por semana y titula la tabla', async () => {
    // Arrange / Act
    renderizar(<ReportesPage />, {
      ruta: '/consola/reportes?desde=2026-11-01&hasta=2026-11-30&agrupacion=semana',
    });

    // Assert
    expect(await screen.findByRole('table', { name: 'Ventas por semana' })).toBeInTheDocument();
    expect(api.ventas).toHaveBeenCalledWith({
      desde: '2026-11-01',
      hasta: '2026-11-30',
      agrupacion: 'semana',
    });
  });

  it('cambiar el selector de agrupación → vuelve a pedir las ventas por mes', async () => {
    // Arrange
    renderizar(<ReportesPage />, { ruta: '/consola/reportes?desde=2026-11-01&hasta=2026-11-30' });
    await screen.findByRole('table', { name: 'Ventas por día' });

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Agrupar ventas'), 'mes');

    // Assert
    expect(await screen.findByRole('table', { name: 'Ventas por mes' })).toBeInTheDocument();
  });

  it('carrito de un Cliente → muestra su nombre y correo', async () => {
    // Arrange
    api.carritosAbandonados.mockResolvedValue({
      items: [
        {
          idCarrito: 10,
          idUsuario: 6,
          tipo: 'CLIENTE',
          cliente: 'Ana López',
          correo: 'cliente@shopcart.gt',
          cantidadLineas: 1,
          cantidadUnidades: 2,
          subtotal: '298.00',
          descuento: '0.00',
          valor: '298.00',
          fechaCreacion: '2026-11-01T10:00:00.000Z',
          fechaUltimaActividad: '2026-11-02T10:00:00.000Z',
          horasInactivo: 30,
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    });

    // Act
    renderizar(<ReportesPage />, { ruta: '/consola/reportes?desde=2026-11-01&hasta=2026-11-30' });

    // Assert
    expect(await screen.findByText('Ana López')).toBeInTheDocument();
    expect(screen.getByText('cliente@shopcart.gt')).toBeInTheDocument();
    expect(screen.queryByText('Invitado')).not.toBeInTheDocument();
  });

  it('sin datos en el periodo → cada bloque muestra su vacío', async () => {
    // Arrange
    api.ventas.mockResolvedValue([]);
    api.ventasPorCategoria.mockResolvedValue([]);
    api.productosMasVendidos.mockResolvedValue([]);
    api.carritosAbandonados.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

    // Act
    renderizar(<ReportesPage />, { ruta: '/consola/reportes?desde=2026-11-01&hasta=2026-11-30' });

    // Assert
    expect(await screen.findAllByText('Sin resultados')).toHaveLength(3);
    expect(await screen.findByText('Sin carritos abandonados')).toBeInTheDocument();
  });

  it('un reporte falla → ErrorState con requestId y Reintentar vuelve a pedirlo', async () => {
    // Arrange
    api.ventas
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla de ventas.', [], 'req-51'))
      .mockResolvedValueOnce([]);
    renderizar(<ReportesPage />, { ruta: '/consola/reportes?desde=2026-11-01&hasta=2026-11-30' });
    expect(await screen.findByText('Referencia: req-51')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    await waitFor(() => expect(api.ventas).toHaveBeenCalledTimes(2));
  });

  it('rango invertido → no consulta ningún reporte y pide corregirlo', async () => {
    // Act
    renderizar(<ReportesPage />, { ruta: '/consola/reportes?desde=2026-11-30&hasta=2026-11-01' });

    // Assert
    expect(
      await screen.findByText('Debe ser igual o posterior a la fecha inicial.'),
    ).toBeInTheDocument();
    expect(api.ventas).not.toHaveBeenCalled();
    expect(api.carritosAbandonados).not.toHaveBeenCalled();
  });
});
