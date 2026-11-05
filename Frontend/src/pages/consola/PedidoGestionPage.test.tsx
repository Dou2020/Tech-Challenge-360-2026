import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pedidosApi } from '../../services/api/pedidos';
import { ApiError } from '../../services/http';
import { crearPedidoDetalle } from '../../test/fixtures/pedidos';
import { renderizar } from '../../test/renderizar';
import PedidoGestionPage from './PedidoGestionPage';

vi.mock('../../services/api/pedidos', () => ({
  pedidosApi: {
    obtener: vi.fn(),
    historial: vi.fn(),
    devoluciones: vi.fn(),
    cancelar: vi.fn(),
    cambiarEstado: vi.fn(),
    registrarDevolucion: vi.fn(),
    listar: vi.fn(),
  },
}));
const api = vi.mocked(pedidosApi);

const preparacion = { estado: 'EN_PREPARACION', nombre: 'En preparación', via: 'ESTADO' } as const;

function abrir() {
  return renderizar(<PedidoGestionPage />, {
    ruta: '/consola/pedidos/1503',
    patron: '/consola/pedidos/:id',
  });
}

describe('PedidoGestionPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.obtener.mockResolvedValue(
      crearPedidoDetalle({
        transiciones: [preparacion, { estado: 'CANCELADO', nombre: 'Cancelado', via: 'CANCELAR' }],
      }),
    );
    api.historial.mockResolvedValue([]);
    api.devoluciones.mockResolvedValue([]);
  });

  it('avanza el estado con confirmación y comentario opcional', async () => {
    // Arrange
    api.cambiarEstado.mockResolvedValue(
      crearPedidoDetalle({ estado: 'EN_PREPARACION', transiciones: [] }),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Pasar a En preparación' }));

    // Act
    await userEvent.type(screen.getByLabelText('Comentario (opcional)'), 'Empacado');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    // Assert
    await waitFor(() =>
      expect(api.cambiarEstado).toHaveBeenCalledWith(1503, 'EN_PREPARACION', 'Empacado'),
    );
    expect(await screen.findByText('El pedido pasó a "En preparación".')).toBeInTheDocument();
  });

  it('un 409 TRANSICION_NO_PERMITIDA muestra un mensaje claro', async () => {
    // Arrange
    api.cambiarEstado.mockRejectedValue(
      new ApiError(409, 'TRANSICION_NO_PERMITIDA', 'Un pedido en estado X no puede pasar a Y.'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Pasar a En preparación' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('ya no admite ese cambio');
  });

  it('cancela con motivo desde la acción CANCELAR', async () => {
    // Arrange
    api.cancelar.mockResolvedValue(crearPedidoDetalle({ estado: 'CANCELADO' }));
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));

    // Act
    await userEvent.type(screen.getByLabelText('Motivo (opcional)'), 'Sin stock');
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar pedido' })[1]!);

    // Assert
    await waitFor(() => expect(api.cancelar).toHaveBeenCalledWith(1503, 'Sin stock'));
  });

  it('con una transición DEVOLUCION muestra el formulario de devolución', async () => {
    // Arrange
    const base = crearPedidoDetalle();
    api.obtener.mockResolvedValue(
      crearPedidoDetalle({
        estado: 'ENTREGADO',
        lineas: [{ ...base.lineas[0]!, cantidadDevolvible: 2 }],
        transiciones: [{ estado: 'DEVUELTO', nombre: 'Devuelto', via: 'DEVOLUCION' }],
      }),
    );
    abrir();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar devolución' }));

    // Assert
    expect(screen.getByLabelText(/Camiseta/)).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo de la devolución')).toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.obtener.mockReturnValue(new Promise(() => undefined));

    // Act
    abrir();

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando pedido' })).toBeInTheDocument();
  });

  it('pedido inexistente (404) → NoEncontrado', async () => {
    // Arrange
    api.obtener.mockRejectedValue(new ApiError(404, 'NO_ENCONTRADO', 'No existe.'));

    // Act
    abrir();

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Página no encontrada' }),
    ).toBeInTheDocument();
  });

  it.each(['abc', '0'])('id inválido (%s) → NoEncontrado sin llamar a la API', (id) => {
    // Act
    renderizar(<PedidoGestionPage />, {
      ruta: `/consola/pedidos/${id}`,
      patron: '/consola/pedidos/:id',
    });

    // Assert
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(api.obtener).not.toHaveBeenCalled();
  });

  it('error del servidor → ErrorState con requestId y Reintentar vuelve a pedirlo', async () => {
    // Arrange
    api.obtener
      .mockRejectedValueOnce(
        new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-61'),
      )
      .mockResolvedValueOnce(crearPedidoDetalle());
    abrir();
    expect(await screen.findByText('Referencia: req-61')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Pedido SC-2026-001503' }),
    ).toBeInTheDocument();
    expect(api.obtener).toHaveBeenCalledTimes(2);
  });

  it('cambio de estado sin comentario → lo envía como undefined', async () => {
    // Arrange
    api.cambiarEstado.mockResolvedValue(crearPedidoDetalle({ estado: 'EN_PREPARACION' }));
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Pasar a En preparación' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    // Assert
    await waitFor(() =>
      expect(api.cambiarEstado).toHaveBeenCalledWith(1503, 'EN_PREPARACION', undefined),
    );
  });

  it('sin transiciones → no muestra el bloque de acciones', async () => {
    // Arrange
    api.obtener.mockResolvedValue(crearPedidoDetalle({ estado: 'CANCELADO', transiciones: [] }));

    // Act
    abrir();

    // Assert
    await screen.findByRole('heading', { name: 'Pedido SC-2026-001503' });
    expect(screen.queryByRole('heading', { name: 'Acciones' })).not.toBeInTheDocument();
  });

  it('acciones según via: ESTADO y CANCELAR sí, DEVOLUCION no se ofrece', async () => {
    // Act
    abrir();

    // Assert
    expect(
      await screen.findByRole('button', { name: 'Pasar a En preparación' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar devolución' })).not.toBeInTheDocument();
  });

  it('un error genérico al cambiar de estado → aviso con requestId y el diálogo se cierra', async () => {
    // Arrange
    api.cambiarEstado.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-62'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Pasar a En preparación' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-62')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un 409 TRANSICION_NO_PERMITIDA → vuelve a pedir el pedido para ocultar acciones viejas', async () => {
    // Arrange
    api.cambiarEstado.mockRejectedValue(
      new ApiError(409, 'TRANSICION_NO_PERMITIDA', 'No permitida.', [], 'req-63'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Pasar a En preparación' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    // Assert
    await screen.findByText(/ya no admite ese cambio/);
    await waitFor(() => expect(api.obtener.mock.calls.length).toBeGreaterThan(1));
  });

  it('cancelar el diálogo → no llama a la API', async () => {
    // Arrange
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Pasar a En preparación' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.cambiarEstado).not.toHaveBeenCalled();
  });

  describe('devoluciones', () => {
    function entregado(cantidadDevolvible: number) {
      const base = crearPedidoDetalle();
      return crearPedidoDetalle({
        estado: 'ENTREGADO',
        lineas: [{ ...base.lineas[0]!, cantidadDevolvible }],
        transiciones: [{ estado: 'DEVUELTO', nombre: 'Devuelto', via: 'DEVOLUCION' }],
      });
    }

    it('devolución exitosa → aviso con el reembolso del backend y se cierra el formulario', async () => {
      // Arrange
      api.obtener.mockResolvedValue(entregado(2));
      api.registrarDevolucion.mockResolvedValue({
        idDevolucion: 1,
        tipo: 'PARCIAL',
        montoReembolso: '149.00',
        estadoPedido: 'DEVUELTO_PARCIAL',
      });
      abrir();
      await userEvent.click(await screen.findByRole('button', { name: 'Registrar devolución' }));
      await userEvent.type(screen.getByLabelText(/Camiseta/), '1');
      await userEvent.type(screen.getByLabelText('Motivo de la devolución'), 'Defecto');
      await userEvent.click(
        within(
          screen.getByRole('heading', { name: 'Registrar devolución', level: 3 }).parentElement!,
        ).getByRole('button', { name: 'Registrar devolución' }),
      );
      const dialogo = await screen.findByRole('dialog');

      // Act
      await userEvent.click(within(dialogo).getByRole('button', { name: 'Registrar devolución' }));

      // Assert
      expect(await screen.findByText(/reembolso de Q 149.00/)).toBeInTheDocument();
      expect(api.registrarDevolucion).toHaveBeenCalledWith(1503, {
        motivo: 'Defecto',
        lineas: [{ idPedidoDetalle: 3021, cantidad: 1 }],
      });
      expect(screen.queryByLabelText('Motivo de la devolución')).not.toBeInTheDocument();
    });

    it('todas las líneas ya devueltas → el formulario lo indica', async () => {
      // Arrange
      api.obtener.mockResolvedValue(entregado(0));
      abrir();

      // Act
      await userEvent.click(await screen.findByRole('button', { name: 'Registrar devolución' }));

      // Assert
      expect(
        screen.getByText('Todas las unidades de este pedido ya se devolvieron.'),
      ).toBeInTheDocument();
    });

    it('Cancelar el formulario → lo cierra', async () => {
      // Arrange
      api.obtener.mockResolvedValue(entregado(2));
      abrir();
      await userEvent.click(await screen.findByRole('button', { name: 'Registrar devolución' }));

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      // Assert
      expect(screen.queryByLabelText('Motivo de la devolución')).not.toBeInTheDocument();
    });
  });

  it('el total del backend se muestra tal cual', async () => {
    // Arrange: 298.00 + 25.00 = 323.00; el backend dice 310.00.
    api.obtener.mockResolvedValue(crearPedidoDetalle({ total: '310.00' }));

    // Act
    abrir();

    // Assert
    expect(await screen.findByText('Q 310.00')).toBeInTheDocument();
  });

  it('historial y devoluciones con error → ErrorState y Reintentar para cada uno', async () => {
    // Arrange
    api.historial
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Historial caído.', [], 'req-64'))
      .mockResolvedValueOnce([]);
    api.devoluciones
      .mockRejectedValueOnce(
        new ApiError(500, 'ERROR_INTERNO', 'Devoluciones caídas.', [], 'req-65'),
      )
      .mockResolvedValueOnce([]);
    abrir();
    expect(await screen.findByText('Historial caído.')).toBeInTheDocument();
    expect(await screen.findByText('Devoluciones caídas.')).toBeInTheDocument();

    // Act
    for (const boton of screen.getAllByRole('button', { name: 'Reintentar' })) {
      await userEvent.click(boton);
    }

    // Assert
    await waitFor(() => expect(api.historial).toHaveBeenCalledTimes(2));
    expect(api.devoluciones).toHaveBeenCalledTimes(2);
  });

  it('devoluciones aún cargando → la página ya se muestra sin error ni lista de devoluciones', async () => {
    // Arrange
    api.devoluciones.mockReturnValue(new Promise(() => undefined));

    // Act
    abrir();

    // Assert
    expect(
      await screen.findByRole('button', { name: 'Pasar a En preparación' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Devoluciones' })).not.toBeInTheDocument();
  });

  it('devoluciones con error y el resto bien → solo ese bloque muestra ErrorState con su requestId', async () => {
    // Arrange
    api.devoluciones.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Devoluciones caídas.', [], 'req-77'),
    );

    // Act
    abrir();

    // Assert
    expect(await screen.findByText('Devoluciones caídas.')).toBeInTheDocument();
    expect(screen.getByText(/req-77/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Pasar a En preparación' })).toBeInTheDocument();
  });
});
