import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pedidosApi } from '../../services/api/pedidos';
import { userEvent } from '@testing-library/user-event';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import { crearPedidoDetalle, crearPedidoResumen } from '../../test/fixtures/pedidos';
import PedidosPage from './PedidosPage';

vi.mock('../../services/api/pedidos', () => ({
  pedidosApi: { listar: vi.fn(), estados: vi.fn(), cambiarEstado: vi.fn(), cancelar: vi.fn() },
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

  it('acceso rápido → filtra por su estado, vuelve a la página 1 y queda marcado', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const { router } = renderizar(<PedidosPage />, {
      ruta: '/consola/pedidos?estado=PAGADO&page=3',
    });
    const grupo = screen.getByRole('group', { name: 'Filtros rápidos' });
    expect(within(grupo).getByRole('button', { name: 'Por preparar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Act
    await userEvent.click(within(grupo).getByRole('button', { name: 'Por despachar' }));

    // Assert
    expect(router.state.location.search).toBe('?estado=EN_PREPARACION');
    expect(within(grupo).getByRole('button', { name: 'Por despachar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(grupo).getByRole('button', { name: 'Por preparar' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(api.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'EN_PREPARACION', page: 1 }),
    );
  });

  it('acceso rápido Todos → quita el filtro de estado', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const { router } = renderizar(<PedidosPage />, {
      ruta: '/consola/pedidos?estado=DESPACHADO',
    });
    const grupo = screen.getByRole('group', { name: 'Filtros rápidos' });

    // Act
    await userEvent.click(within(grupo).getByRole('button', { name: 'Todos' }));

    // Assert
    expect(router.state.location.search).toBe('');
    expect(within(grupo).getByRole('button', { name: 'Todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

describe('PedidosPage (consola) en vista de tablero', () => {
  const pagado = crearPedidoResumen();

  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listar.mockImplementation((params) =>
      Promise.resolve({
        items: params.estado === 'PAGADO' ? [pagado] : [],
        page: 1,
        pageSize: 20,
        total: params.estado === 'PAGADO' ? 1 : 0,
      }),
    );
    api.estados.mockResolvedValue({
      estados: [
        { codigo: 'PAGADO', nombre: 'Pagado', esFinal: false },
        { codigo: 'EN_PREPARACION', nombre: 'En preparación', esFinal: false },
        { codigo: 'CANCELADO', nombre: 'Cancelado', esFinal: true },
      ],
      transiciones: [
        {
          origen: 'PAGADO',
          destino: 'EN_PREPARACION',
          rol: 'Operador',
          permitida: true,
          via: 'ESTADO',
        },
        {
          origen: 'PAGADO',
          destino: 'CANCELADO',
          rol: 'Operador',
          permitida: true,
          via: 'CANCELAR',
        },
      ],
    });
  });

  async function moverA(destino: string) {
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Mover SC-2026-001503 a' }),
      destino,
    );
  }

  it('botón Tablero → vista en la URL, sin estado ni página, y oculta los filtros de estado', async () => {
    // Arrange
    const { router } = renderizar(<PedidosPage />, {
      ruta: '/consola/pedidos?estado=PAGADO&page=3&q=SC-2026',
    });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Tablero' }));

    // Assert
    expect(router.state.location.search).toBe('?q=SC-2026&vista=tablero');
    expect(screen.getByRole('button', { name: 'Tablero' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('group', { name: 'Filtros rápidos' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Estado' })).toBeNull();
    expect(await screen.findAllByRole('region')).toHaveLength(5);
  });

  it('botón Lista → vuelve a la tabla conservando los filtros', async () => {
    // Arrange
    const { router } = renderizar(<PedidosPage />, {
      ruta: '/consola/pedidos?vista=tablero&q=SC-2026',
    });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Lista' }));

    // Assert
    expect(router.state.location.search).toBe('?q=SC-2026');
    expect(await screen.findByText('No hay pedidos con esos filtros')).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('cada columna consulta su estado con los filtros de la URL; "Ver todos" los conserva', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [pagado], page: 1, pageSize: 20, total: 30 });

    // Act
    renderizar(<PedidosPage />, {
      ruta: '/consola/pedidos?vista=tablero&q=SC-2026&idCliente=6&desde=2026-11-01&hasta=2026-11-30',
    });

    // Assert
    const enlaces = await screen.findAllByRole('link', { name: /Ver todos los pedidos en/ });
    expect(api.listar).toHaveBeenCalledTimes(5);
    expect(api.listar).toHaveBeenCalledWith({
      q: 'SC-2026',
      desde: '2026-11-01',
      hasta: '2026-11-30',
      idCliente: '6',
      estado: 'PAGADO',
      sort: 'fechaCreacion:asc',
      page: 1,
      pageSize: 20,
    });
    expect(api.listar).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'CANCELADO', sort: 'fechaCreacion:desc' }),
    );
    expect(enlaces[0]).toHaveAttribute(
      'href',
      '/consola/pedidos?estado=PAGADO&q=SC-2026&desde=2026-11-01&hasta=2026-11-30&idCliente=6',
    );
  });

  it('rango invertido → muestra el error y las columnas no mandan las fechas', async () => {
    // Act
    renderizar(<PedidosPage />, {
      ruta: '/consola/pedidos?vista=tablero&desde=2026-11-30&hasta=2026-11-01',
    });

    // Assert
    expect(
      await screen.findByText('Debe ser igual o posterior a la fecha inicial.'),
    ).toBeInTheDocument();
    await screen.findAllByRole('region');
    for (const [params] of api.listar.mock.calls) {
      expect(params.desde).toBeUndefined();
      expect(params.hasta).toBeUndefined();
    }
  });

  it('mover a otro estado → confirma con comentario, llama a PATCH /estado y avisa', async () => {
    // Arrange
    api.cambiarEstado.mockResolvedValue(crearPedidoDetalle({ estado: 'EN_PREPARACION' }));
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos?vista=tablero' });
    await moverA('EN_PREPARACION');
    const dialogo = screen.getByRole('dialog', {
      name: '¿Pasar el pedido SC-2026-001503 a "En preparación"?',
    });
    await userEvent.type(within(dialogo).getByLabelText('Comentario (opcional)'), ' Empacar ');

    // Act
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar cambio' }));

    // Assert
    expect(
      await screen.findByText('El pedido SC-2026-001503 pasó a "En preparación".'),
    ).toBeInTheDocument();
    expect(api.cambiarEstado).toHaveBeenCalledWith(1503, 'EN_PREPARACION', 'Empacar');
    expect(api.cancelar).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mover a Cancelado → diálogo de cancelación y POST /cancelar', async () => {
    // Arrange
    api.cancelar.mockResolvedValue(crearPedidoDetalle({ estado: 'CANCELADO' }));
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos?vista=tablero' });
    await moverA('CANCELADO');
    const dialogo = screen.getByRole('dialog', { name: '¿Cancelar el pedido SC-2026-001503?' });
    expect(within(dialogo).getByLabelText('Motivo (opcional)')).toBeInTheDocument();

    // Act
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar pedido' }));

    // Assert
    expect(
      await screen.findByText(
        'Pedido SC-2026-001503 cancelado. La existencia y el cupón se reintegraron.',
      ),
    ).toBeInTheDocument();
    expect(api.cancelar).toHaveBeenCalledWith(1503, undefined);
    expect(api.cambiarEstado).not.toHaveBeenCalled();
  });

  it('cerrar el diálogo sin confirmar → no cambia nada', async () => {
    // Arrange
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos?vista=tablero' });
    await moverA('CANCELADO');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Mantener pedido' }));

    // Assert
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.cancelar).not.toHaveBeenCalled();
  });

  it('409 TRANSICION_NO_PERMITIDA → aviso claro y vuelve a consultar las columnas', async () => {
    // Arrange
    api.cambiarEstado.mockRejectedValue(
      new ApiError(409, 'TRANSICION_NO_PERMITIDA', 'Técnico.', [], 'req-40'),
    );
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos?vista=tablero' });
    await moverA('EN_PREPARACION');
    const llamadasAntes = api.listar.mock.calls.length;

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    // Assert
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('ya no admite ese cambio');
    expect(aviso).toHaveTextContent('req-40');
    await waitFor(() => expect(api.listar.mock.calls.length).toBeGreaterThan(llamadasAntes));
  });

  it('si no cargan las transiciones → tablero de solo lectura con aviso', async () => {
    // Arrange
    api.estados.mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'r'));

    // Act
    renderizar(<PedidosPage />, { ruta: '/consola/pedidos?vista=tablero' });

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('el tablero es solo de lectura');
    expect(await screen.findByRole('link', { name: 'SC-2026-001503' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Mover/ })).toBeNull();
  });
});
