import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportesApi } from '../../services/api/reportes';
import { userEvent } from '@testing-library/user-event';
import { ApiError } from '../../services/http';
import { exportarReporte } from '../../services/exportacion';
import { renderizar } from '../../test/renderizar';
import ReportesPage from './ReportesPage';

vi.mock('../../services/api/reportes', () => ({
  reportesApi: {
    ventas: vi.fn(),
    ventasPorCategoria: vi.fn(),
    productosMasVendidos: vi.fn(),
    carritosAbandonados: vi.fn(),
    todosLosCarritosAbandonados: vi.fn(),
  },
}));
const api = vi.mocked(reportesApi);
vi.mock('../../services/exportacion', () => ({ exportarReporte: vi.fn() }));
const exportar = vi.mocked(exportarReporte);
const rangoNoviembre = { desde: '2026-11-01', hasta: '2026-11-30' };

describe('ReportesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    exportar.mockReset();
    exportar.mockResolvedValue(undefined);
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

  describe('exportación', () => {
    const ruta = '/consola/reportes?desde=2026-11-01&hasta=2026-11-30';

    it('ventas a Excel → exporta las filas cargadas con el rango y la agrupación', async () => {
      // Arrange
      renderizar(<ReportesPage />, { ruta: `${ruta}&agrupacion=semana` });
      const boton = await screen.findByRole('button', {
        name: 'Exportar ventas por semana a Excel',
      });

      // Act
      await userEvent.click(boton);

      // Assert
      expect(exportar).toHaveBeenCalledWith(
        'excel',
        expect.objectContaining({
          reporte: 'ventas-por-semana',
          titulo: 'Ventas por semana',
          extra: 'Agrupación: semana',
          rango: rangoNoviembre,
          filas: [{ periodoInicio: '2026-11-03', ventas: '500.00', pedidos: 2, unidadesNetas: 4 }],
        }),
      );
    });

    it('ventas por categoría a PDF → exporta su reporte', async () => {
      // Arrange
      renderizar(<ReportesPage />, { ruta });
      const boton = await screen.findByRole('button', {
        name: 'Exportar ventas por categoría a PDF',
      });

      // Act
      await userEvent.click(boton);

      // Assert
      const [formato, def] = exportar.mock.calls[0]!;
      expect(formato).toBe('pdf');
      expect(def).toMatchObject({ reporte: 'ventas-por-categoria', rango: rangoNoviembre });
      expect(def.filas).toHaveLength(1);
      expect(def.columnas.map((c) => c.titulo)).toContain('Reembolsado');
    });

    it('productos más vendidos → indica cuántos se exportan', async () => {
      // Arrange
      renderizar(<ReportesPage />, { ruta });
      const boton = await screen.findByRole('button', {
        name: 'Exportar productos más vendidos a Excel',
      });

      // Act
      await userEvent.click(boton);

      // Assert
      expect(exportar).toHaveBeenCalledWith(
        'excel',
        expect.objectContaining({
          reporte: 'productos-mas-vendidos',
          extra: 'Los 1 con más venta neta',
        }),
      );
    });

    it('carritos → pide todas las páginas con el orden de la tabla y las exporta', async () => {
      // Arrange
      const todos = [{ idCarrito: 1 }, { idCarrito: 2 }] as never;
      api.todosLosCarritosAbandonados.mockResolvedValue(todos);
      renderizar(<ReportesPage />, { ruta: `${ruta}&sort=valor:desc` });
      await screen.findByText('Invitado');

      // Act
      await userEvent.click(
        screen.getByRole('button', { name: 'Exportar carritos abandonados a PDF' }),
      );

      // Assert
      expect(api.todosLosCarritosAbandonados).toHaveBeenCalledWith({
        ...rangoNoviembre,
        sort: 'valor:desc',
      });
      expect(exportar).toHaveBeenCalledWith(
        'pdf',
        expect.objectContaining({ reporte: 'carritos-abandonados', filas: todos }),
      );
    });

    it('falla la descarga de carritos → aviso con la referencia y no genera archivo', async () => {
      // Arrange
      api.todosLosCarritosAbandonados.mockRejectedValue(
        new ApiError(503, 'SERVICIO_NO_DISPONIBLE', 'Servicio no disponible.', [], 'req-90'),
      );
      renderizar(<ReportesPage />, { ruta });
      await screen.findByText('Invitado');

      // Act
      await userEvent.click(
        screen.getByRole('button', { name: 'Exportar carritos abandonados a Excel' }),
      );

      // Assert
      const alerta = await screen.findByRole('alert');
      expect(alerta).toHaveTextContent('Servicio no disponible.');
      expect(alerta).toHaveTextContent('Referencia: req-90');
      expect(exportar).not.toHaveBeenCalled();
    });

    it('falla la generación del archivo → aviso genérico', async () => {
      // Arrange
      exportar.mockRejectedValue(new Error('chunk no disponible'));
      renderizar(<ReportesPage />, { ruta });
      const boton = await screen.findByRole('button', { name: 'Exportar ventas por día a PDF' });

      // Act
      await userEvent.click(boton);

      // Assert
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo generar el archivo. Intenta de nuevo.',
      );
    });

    it('sin carritos en el periodo → sus botones quedan deshabilitados', async () => {
      // Arrange
      api.carritosAbandonados.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

      // Act
      renderizar(<ReportesPage />, { ruta });

      // Assert
      expect(await screen.findByText('Sin carritos abandonados')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Exportar carritos abandonados a Excel' }),
      ).toBeDisabled();
    });

    it('rango invertido → no hay botones en los reportes y los de carritos están deshabilitados', async () => {
      // Act
      renderizar(<ReportesPage />, {
        ruta: '/consola/reportes?desde=2026-11-30&hasta=2026-11-01',
      });

      // Assert
      await screen.findByText('Debe ser igual o posterior a la fecha inicial.');
      expect(screen.queryByRole('button', { name: /Exportar ventas/ })).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Exportar carritos abandonados a PDF' }),
      ).toBeDisabled();
    });
  });
});
