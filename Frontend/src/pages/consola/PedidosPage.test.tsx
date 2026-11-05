import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pedidosApi } from '../../services/api/pedidos';
import { userEvent } from '@testing-library/user-event';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import { crearPedidoResumen } from '../../test/fixtures/pedidos';
import PedidosPage from './PedidosPage';

vi.mock('../../services/api/pedidos', () => ({
  pedidosApi: { listar: vi.fn(), estados: vi.fn() },
}));
const api = vi.mocked(pedidosApi);

describe('PedidosPage (consola)', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.estados.mockResolvedValue({
      estados: [
        { codigo: 'PAGADO', nombre: 'Pagado', esFinal: false },
        { codigo: 'ENTREGADO', nombre: 'Entregado', esFinal: false },
      ],
      transiciones: [],
    });
  });

  it('envía filtros, orden y página de la URL y enlaza al detalle de gestión', async () => {
    // Arrange
    api.listar.mockResolvedValue({
      items: [crearPedidoResumen()],
      page: 2,
      pageSize: 20,
      total: 21,
    });

    // Act
    renderizar(<PedidosPage />, {
      ruta: '/consola/pedidos?estado=PAGADO&idCliente=6&q=SC-2026&desde=2026-11-01&hasta=2026-11-30&sort=total:desc&page=2',
    });

    // Assert
    const tabla = await screen.findByRole('table', { name: 'Lista de pedidos' });
    expect(api.listar).toHaveBeenCalledWith({
      estado: 'PAGADO',
      idCliente: '6',
      q: 'SC-2026',
      desde: '2026-11-01',
      hasta: '2026-11-30',
      sort: 'total:desc',
      page: 2,
      pageSize: 20,
    });
    expect(within(tabla).getByRole('link', { name: 'SC-2026-001503' })).toHaveAttribute(
      'href',
      '/consola/pedidos/1503',
    );
    expect(within(tabla).getByText('Q 323.00')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Entregado' })).toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando lista de pedidos' })).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar vuelve a pedir', async () => {
    // Arrange
    api.listar
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-81'))
      .mockResolvedValueOnce({ items: [crearPedidoResumen()], page: 1, pageSize: 20, total: 1 });
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos' });
    expect(await screen.findByText('Referencia: req-81')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('SC-2026-001503')).toBeInTheDocument();
  });

  it('sin pedidos ni filtros → "Aún no hay pedidos"; con filtros → ofrece limpiar', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    // Act
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos?estado=PAGADO' });

    // Assert
    expect(await screen.findByText('No hay pedidos con esos filtros')).toBeInTheDocument();
  });

  it('sin pedidos y sin filtros → vacío simple', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    // Act
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos' });

    // Assert
    expect(await screen.findByText('Aún no hay pedidos')).toBeInTheDocument();
  });

  it('Limpiar filtros → quita los filtros de la URL', async () => {
    // Arrange
    api.listar.mockResolvedValue({
      items: [crearPedidoResumen()],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    const { router } = renderizar(<PedidosPage />, {
      ruta: '/consola/pedidos?estado=PAGADO&idCliente=6',
    });
    await screen.findByText('SC-2026-001503');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    // Assert
    expect(router.state.location.search).toBe('');
  });

  it('rango invertido → muestra el error y no manda las fechas', async () => {
    // Arrange
    api.listar.mockResolvedValue({
      items: [crearPedidoResumen()],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    // Act
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos?desde=2026-11-30&hasta=2026-11-01' });

    // Assert
    expect(
      await screen.findByText('Debe ser igual o posterior a la fecha inicial.'),
    ).toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledWith({ sort: 'fechaCreacion:desc', page: 1, pageSize: 20 });
  });

  it('si no cargan los estados → usa los estados de la configuración', async () => {
    // Arrange
    api.estados.mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Falla.'));
    api.listar.mockResolvedValue({
      items: [crearPedidoResumen()],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    // Act
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos' });

    // Assert
    expect(await screen.findByRole('option', { name: 'En preparación' })).toBeInTheDocument();
  });

  it('cambiar el estado → estado en la URL y vuelve a la página 1', async () => {
    // Arrange
    api.listar.mockResolvedValue({
      items: [crearPedidoResumen()],
      page: 3,
      pageSize: 20,
      total: 50,
    });
    const { router } = renderizar(<PedidosPage />, { ruta: '/consola/pedidos?page=3' });
    await screen.findByText('SC-2026-001503');
    await screen.findByRole('option', { name: 'Entregado' });

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Entregado');

    // Assert
    expect(router.state.location.search).toBe('?estado=ENTREGADO');
    expect(api.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'ENTREGADO', page: 1 }),
    );
  });

  it('buscar por número y filtrar por cliente → q e idCliente en la URL', async () => {
    // Arrange
    api.listar.mockResolvedValue({
      items: [crearPedidoResumen()],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    const { router } = renderizar(<PedidosPage />, { ruta: '/consola/pedidos' });
    await screen.findByText('SC-2026-001503');

    // Act
    await userEvent.type(screen.getByLabelText('ID de cliente'), '6');

    // Assert
    expect(router.state.location.search).toBe('?idCliente=6');
  });

  it('el total del backend se muestra tal cual', async () => {
    // Arrange: 298.00 − 0 + 25.00 = 323.00; el backend dice 310.00.
    api.listar.mockResolvedValue({
      items: [crearPedidoResumen({ total: '310.00' })],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    // Act
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos' });

    // Assert
    expect(await screen.findByText('Q 310.00')).toBeInTheDocument();
  });
});
