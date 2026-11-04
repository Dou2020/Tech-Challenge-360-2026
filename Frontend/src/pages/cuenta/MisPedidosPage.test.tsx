import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pedidosApi } from '../../services/api/pedidos';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { PedidoResumen } from '../../types/pedidos';
import MisPedidosPage from './MisPedidosPage';

vi.mock('../../services/api/pedidos', () => ({ pedidosApi: { listar: vi.fn() } }));
const listar = vi.mocked(pedidosApi.listar);

const pedido: PedidoResumen = {
  idPedido: 1503,
  numeroPedido: 'SC-2026-001503',
  idUsuario: 6,
  cliente: 'Ana López',
  correoCliente: 'ana@correo.gt',
  estado: 'DESPACHADO',
  nombreEstado: 'Despachado',
  subtotal: '298.00',
  descuento: '29.80',
  costoEnvio: '25.00',
  total: '293.20',
  cantidadLineas: 1,
  cantidadUnidades: 2,
  fechaCreacion: '2026-11-03T15:31:00.000Z',
};

describe('MisPedidosPage', () => {
  beforeEach(() => {
    listar.mockReset();
  });

  it('envía a la API los filtros, el orden y la página de la URL', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 2, pageSize: 10, total: 11 });

    // Act
    renderizar(<MisPedidosPage />, {
      ruta: '/cuenta/pedidos?estado=DESPACHADO&desde=2026-11-01&hasta=2026-11-30&q=SC-2026&sort=total:desc&page=2',
    });

    // Assert
    expect(await screen.findByText('SC-2026-001503')).toBeInTheDocument();
    expect(listar).toHaveBeenCalledWith({
      estado: 'DESPACHADO',
      desde: '2026-11-01',
      hasta: '2026-11-30',
      q: 'SC-2026',
      sort: 'total:desc',
      page: 2,
      pageSize: 10,
    });
    expect(screen.getByText('Q 293.20')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Despachado')).toBeInTheDocument();
  });

  it('cambiar el estado actualiza la URL y vuelve a la página 1', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 1, pageSize: 10, total: 1 });
    const { router } = renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos?page=3' });
    await screen.findByText('SC-2026-001503');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Entregado');

    // Assert
    expect(router.state.location.search).toBe('?estado=ENTREGADO');
    expect(listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'ENTREGADO', page: 1 }),
    );
  });

  it('sin pedidos muestra el estado vacío', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

    // Act
    renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos' });

    // Assert
    expect(await screen.findByText('Aún no tienes pedidos')).toBeInTheDocument();
  });

  it('si falla muestra el error con su referencia y permite reintentar', async () => {
    // Arrange
    listar
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Fallo.', [], 'req-5'))
      .mockResolvedValueOnce({ items: [pedido], page: 1, pageSize: 10, total: 1 });
    renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos' });

    // Act
    const alerta = await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(alerta).toHaveTextContent('Referencia: req-5');
    expect(await screen.findByText('SC-2026-001503')).toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    listar.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando pedidos' })).toBeInTheDocument();
  });

  it('el total del backend se muestra tal cual, aunque no sea subtotal − descuento + envío', async () => {
    // Arrange: 298.00 − 29.80 + 25.00 = 293.20, pero el backend dice 300.00.
    listar.mockResolvedValue({
      items: [{ ...pedido, total: '300.00' }],
      page: 1,
      pageSize: 10,
      total: 1,
    });

    // Act
    renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos' });

    // Assert
    expect(await screen.findByText('Q 300.00')).toBeInTheDocument();
    expect(screen.queryByText('Q 293.20')).not.toBeInTheDocument();
  });

  it('la fecha se muestra en hora de Guatemala y el número enlaza al detalle', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 1, pageSize: 10, total: 1 });

    // Act
    renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos' });

    // Assert
    expect(await screen.findByText('3/11/2026, 9:31 a. m.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SC-2026-001503' })).toHaveAttribute(
      'href',
      '/cuenta/pedidos/1503',
    );
  });

  it('la paginación muestra el total y "siguiente" pide la página 3', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 2, pageSize: 10, total: 25 });
    const { router } = renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos?page=2' });
    expect(await screen.findByText('Mostrando 11–20 de 25')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    // Assert
    expect(router.state.location.search).toBe('?page=3');
    expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }));
  });

  it('cambiar el tamaño de página → size en la URL y vuelve a la página 1', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 2, pageSize: 10, total: 25 });
    const { router } = renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos?page=2' });
    await screen.findByText('SC-2026-001503');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Por página'), '20');

    // Assert
    expect(router.state.location.search).toBe('?size=20');
    expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 20, page: 1 }));
  });

  it('cambiar el orden → sort en la URL y vuelve a la página 1', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 3, pageSize: 10, total: 40 });
    const { router } = renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos?page=3' });
    await screen.findByText('SC-2026-001503');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'Total: menor a mayor');

    // Assert
    expect(router.state.location.search).toBe('?sort=total%3Aasc');
    expect(listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'total:asc', page: 1 }),
    );
  });

  it('buscar por número → q en la URL y vuelve a la página 1', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 2, pageSize: 10, total: 25 });
    const { router } = renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos?page=2' });
    await screen.findByText('SC-2026-001503');

    // Act
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar por número de pedido' }),
      'SC-2026-0015{Enter}',
    );

    // Assert
    expect(router.state.location.search).toBe('?q=SC-2026-0015');
    expect(listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'SC-2026-0015', page: 1 }),
    );
  });

  it('elegir una fecha "desde" → desde en la URL y vuelve a la página 1', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 2, pageSize: 10, total: 25 });
    const { router } = renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos?page=2' });
    await screen.findByText('SC-2026-001503');

    // Act
    await userEvent.type(screen.getByLabelText('Desde'), '2026-11-01');

    // Assert
    expect(router.state.location.search).toBe('?desde=2026-11-01');
    expect(listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ desde: '2026-11-01', page: 1 }),
    );
  });

  it('rango de fechas invertido → muestra el error y no manda las fechas a la API', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 1, pageSize: 10, total: 1 });

    // Act
    renderizar(<MisPedidosPage />, {
      ruta: '/cuenta/pedidos?desde=2026-11-30&hasta=2026-11-01',
    });

    // Assert
    expect(
      await screen.findByText('Debe ser igual o posterior a la fecha inicial.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    expect(listar).toHaveBeenCalledWith({ sort: 'fechaCreacion:desc', page: 1, pageSize: 10 });
  });

  it('Limpiar filtros → quita los filtros de la URL', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [pedido], page: 1, pageSize: 10, total: 1 });
    const { router } = renderizar(<MisPedidosPage />, {
      ruta: '/cuenta/pedidos?estado=PAGADO&page=2',
    });
    await screen.findByText('SC-2026-001503');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    // Assert
    expect(router.state.location.search).toBe('');
  });

  it('sin pedidos y con filtros → el vacío lo dice y ofrece limpiarlos', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

    // Act
    renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos?estado=PAGADO' });

    // Assert
    expect(await screen.findByText('No hay pedidos con esos filtros')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Limpiar filtros' })).toHaveLength(2);
  });

  it('sin pedidos y sin filtros → invita a ver el catálogo', async () => {
    // Arrange
    listar.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

    // Act
    renderizar(<MisPedidosPage />, { ruta: '/cuenta/pedidos' });

    // Assert
    expect(await screen.findByRole('link', { name: 'Ver el catálogo' })).toHaveAttribute(
      'href',
      '/catalogo',
    );
  });
});
