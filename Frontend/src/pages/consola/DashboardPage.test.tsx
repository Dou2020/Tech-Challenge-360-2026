import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportesApi } from '../../services/api/reportes';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import DashboardPage from './DashboardPage';

vi.mock('../../services/api/reportes', () => ({
  reportesApi: {
    resumen: vi.fn(),
    ventas: vi.fn(),
    ventasPorCategoria: vi.fn(),
    productosMasVendidos: vi.fn(),
  },
}));
vi.mock('../../components/organisms/EstadoSistema', () => ({ EstadoSistema: () => null }));
// Las gráficas se cargan con import dinámico: se retrasa el módulo para ver el estado de carga.
vi.mock('../../components/organisms/SalesChart', async () => {
  await new Promise((r) => setTimeout(r, 150));
  return { SalesChart: () => <div role="img" aria-label="Gráfica de ventas netas por periodo" /> };
});
const api = vi.mocked(reportesApi);

const RUTA = '/consola?desde=2026-11-01&hasta=2026-11-30';

describe('DashboardPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.resumen.mockResolvedValue({
      ventasNetas: '1234.50',
      pedidos: 7,
      ticketPromedio: '176.36',
      unidadesNetas: 15,
      envioCobrado: '175.00',
      carritosAbandonados: 3,
    });
    api.ventas.mockResolvedValue([
      { periodoInicio: '2026-11-03', ventas: '500.00', pedidos: 2, unidadesNetas: 4 },
    ]);
    api.ventasPorCategoria.mockResolvedValue([]);
    api.productosMasVendidos.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falló.', [], 'req-7'),
    );
  });

  // Debe ir primero: el módulo de la gráfica se descarga una sola vez y el mock lo retrasa 150 ms.
  it('mientras se descarga la gráfica → muestra "Cargando gráfica"', async () => {
    // Arrange / Act
    renderizar(<DashboardPage />, { ruta: RUTA });

    // Assert
    expect(await screen.findByRole('status', { name: 'Cargando gráfica' })).toBeInTheDocument();
    expect(
      await screen.findByRole('img', { name: 'Gráfica de ventas netas por periodo' }),
    ).toBeInTheDocument();
  });

  it('muestra los indicadores tal como los da la API y consulta el rango de la URL', async () => {
    // Arrange / Act
    renderizar(<DashboardPage />, { ruta: RUTA });

    // Assert
    expect(await screen.findByText('Q 1,234.50')).toBeInTheDocument();
    expect(screen.getByText('Q 175.00')).toBeInTheDocument();
    expect(api.resumen).toHaveBeenCalledWith({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(api.ventas).toHaveBeenCalledWith({
      desde: '2026-11-01',
      hasta: '2026-11-30',
      agrupacion: 'dia',
    });
    expect(
      await screen.findByRole('img', { name: 'Gráfica de ventas netas por periodo' }),
    ).toBeInTheDocument();
  });

  it('cada bloque tiene su estado: vacío y error con referencia', async () => {
    // Arrange / Act
    renderizar(<DashboardPage />, { ruta: RUTA });

    // Assert
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Referencia: req-7');
  });

  it('cambiar la agrupación la guarda en la URL y vuelve a consultar', async () => {
    // Arrange
    const { router } = renderizar(<DashboardPage />, { ruta: RUTA });
    await screen.findByText('Q 1,234.50');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Agrupar ventas'), 'Por mes');

    // Assert
    expect(router.state.location.search).toContain('agrupacion=mes');
    expect(api.ventas).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: 'mes' }));
  });

  it('con un rango invertido no consulta y avisa', async () => {
    // Arrange / Act
    renderizar(<DashboardPage />, { ruta: '/consola?desde=2026-11-30&hasta=2026-11-01' });

    // Assert
    expect(
      await screen.findByText('Debe ser igual o posterior a la fecha inicial.'),
    ).toBeInTheDocument();
    expect(api.resumen).not.toHaveBeenCalled();
  });

  it('cargando → los indicadores muestran el estado de carga', () => {
    // Arrange
    api.resumen.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<DashboardPage />, { ruta: RUTA });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando indicadores' })).toBeInTheDocument();
  });

  it('periodo sin ventas → cada bloque muestra "Sin resultados" y los indicadores siguen visibles', async () => {
    // Arrange
    api.ventas.mockResolvedValue([]);
    api.ventasPorCategoria.mockResolvedValue([]);
    api.productosMasVendidos.mockResolvedValue([]);
    api.resumen.mockResolvedValue({
      ventasNetas: '0.00',
      pedidos: 0,
      ticketPromedio: '0.00',
      unidadesNetas: 0,
      envioCobrado: '0.00',
      carritosAbandonados: 0,
    });

    // Act
    renderizar(<DashboardPage />, { ruta: RUTA });

    // Assert
    expect(await screen.findAllByText('Sin resultados')).toHaveLength(3);
    expect(screen.getByText('Ventas netas')).toBeInTheDocument();
  });

  it('error en los indicadores → ErrorState y Reintentar vuelve a pedirlos', async () => {
    // Arrange
    api.resumen
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-8'))
      .mockResolvedValueOnce({
        ventasNetas: '10.00',
        pedidos: 1,
        ticketPromedio: '10.00',
        unidadesNetas: 1,
        envioCobrado: '0.00',
        carritosAbandonados: 0,
      });
    renderizar(<DashboardPage />, { ruta: RUTA });
    expect(await screen.findByText('Referencia: req-8')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getAllByRole('button', { name: 'Reintentar' })[0]!);

    // Assert
    expect((await screen.findAllByText('Q 10.00')).length).toBeGreaterThan(0);
  });

  it('volver a "Por día" quita agrupacion de la URL', async () => {
    // Arrange
    const { router } = renderizar(<DashboardPage />, { ruta: `${RUTA}&agrupacion=mes` });
    await screen.findByText('Q 1,234.50');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Agrupar ventas'), 'Por día');

    // Assert
    expect(router.state.location.search).not.toContain('agrupacion');
  });
});
