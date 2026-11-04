import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pedidosApi } from '../../services/api/pedidos';
import { ApiError } from '../../services/http';
import { crearPedidoDetalle } from '../../test/fixtures/pedidos';
import { crearCliente } from '../../test/fixtures/usuarios';
import { crearAuth, renderizar } from '../../test/renderizar';
import PedidoConfirmadoPage from './PedidoConfirmadoPage';

vi.mock('../../services/api/pedidos', () => ({
  pedidosApi: { obtener: vi.fn() },
}));
const api = vi.mocked(pedidosApi);

function pagina(id: string) {
  return renderizar(<PedidoConfirmadoPage />, {
    auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
    ruta: `/pedido-confirmado/${id}`,
    patron: '/pedido-confirmado/:id',
  });
}

describe('PedidoConfirmadoPage', () => {
  beforeEach(() => {
    api.obtener.mockReset();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.obtener.mockReturnValue(new Promise(() => undefined));

    // Act
    pagina('1503');

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando pedido' })).toBeInTheDocument();
  });

  it('pedido cargado → muestra número, estado, fecha y el total del backend sin recalcular', async () => {
    // Arrange: total distinto de subtotal + envío para detectar un recálculo.
    api.obtener.mockResolvedValue(
      crearPedidoDetalle({ subtotal: '298.00', costoEnvio: '25.00', total: '310.00' }),
    );

    // Act
    pagina('1503');

    // Assert
    expect(
      await screen.findByRole('heading', { name: '¡Gracias por tu compra!' }),
    ).toBeInTheDocument();
    expect(screen.getByText('SC-2026-001503')).toBeInTheDocument();
    expect(screen.getByText('Pagado')).toBeInTheDocument();
    expect(screen.getByText('3/11/2026, 9:31 a. m.')).toBeInTheDocument();
    expect(screen.getByText('Q 310.00')).toBeInTheDocument();
    expect(api.obtener).toHaveBeenCalledWith(1503);
  });

  it('muestra enlaces para ver el pedido y seguir comprando', async () => {
    // Arrange
    api.obtener.mockResolvedValue(crearPedidoDetalle());

    // Act
    pagina('1503');

    // Assert
    expect(await screen.findByRole('link', { name: 'Ver el pedido' })).toHaveAttribute(
      'href',
      '/cuenta/pedidos/1503',
    );
    expect(screen.getByRole('link', { name: 'Seguir comprando' })).toHaveAttribute(
      'href',
      '/catalogo',
    );
  });

  it('pedido de otro cliente (404) → muestra NoEncontrado', async () => {
    // Arrange
    api.obtener.mockRejectedValue(new ApiError(404, 'NO_ENCONTRADO', 'Pedido no encontrado.'));

    // Act
    pagina('1503');

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '¡Gracias por tu compra!' }),
    ).not.toBeInTheDocument();
  });

  it.each(['abc', '0', '-3', '1.5'])(
    'id inválido (%s) → NoEncontrado sin llamar a la API',
    (id) => {
      // Act
      pagina(id);

      // Assert
      expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
      expect(api.obtener).not.toHaveBeenCalled();
    },
  );

  it('error del servidor → ErrorState con requestId, y Reintentar vuelve a llamar a la API', async () => {
    // Arrange
    api.obtener
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-1'))
      .mockResolvedValueOnce(crearPedidoDetalle());
    pagina('1503');
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-1')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('SC-2026-001503')).toBeInTheDocument();
    expect(api.obtener).toHaveBeenCalledTimes(2);
  });
});
