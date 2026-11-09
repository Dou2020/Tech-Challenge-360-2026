import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pedidosApi } from '../../services/api/pedidos';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { PedidoDetalle } from '../../types/pedidos';
import PedidoDetallePage from './PedidoDetallePage';

vi.mock('../../services/api/pedidos', () => ({
  pedidosApi: {
    obtener: vi.fn(),
    historial: vi.fn(),
    devoluciones: vi.fn(),
    cancelar: vi.fn(),
    listar: vi.fn(),
  },
}));
const api = vi.mocked(pedidosApi);

const detalle: PedidoDetalle = {
  idPedido: 1503,
  numeroPedido: 'SC-2026-001503',
  idUsuario: 6,
  cliente: 'Ana López',
  correoCliente: 'ana@correo.gt',
  estado: 'PAGADO',
  nombreEstado: 'Pagado',
  esFinal: false,
  direccion: { idDireccion: 5, entrega: 'Casa, 5a avenida 10-20, Mixco, Guatemala' },
  retiroEnSucursal: false,
  sucursal: null,
  metodoEnvio: { idMetodoEnvio: 1, nombre: 'Estándar', diasEstimados: 3 },
  cupon: null,
  subtotal: '298.00',
  descuento: '0.00',
  costoEnvio: '25.00',
  montoIVA: '34.61',
  total: '323.00',
  montoReembolsado: '0.00',
  pago: {
    idPago: 9,
    metodoPago: 'TARJETA',
    monto: '323.00',
    estado: 'APROBADO',
    referencia: 'SIM-1',
    fecha: '2026-11-03T15:31:00.000Z',
  },
  fechaCreacion: '2026-11-03T15:31:00.000Z',
  lineas: [
    {
      idPedidoDetalle: 3021,
      idVariante: 41,
      sku: 'CAM-LIM-NEG-M',
      nombreProducto: 'Camiseta',
      variante: 'M / Negro',
      cantidad: 2,
      precioUnitario: '149.00',
      descuentoLinea: '0.00',
      subtotal: '298.00',
      cantidadDevuelta: 0,
      cantidadDevolvible: 0,
    },
  ],
  transiciones: [{ estado: 'CANCELADO', nombre: 'Cancelado', via: 'CANCELAR' }],
};

const historialInicial = [
  {
    idHistorialEstadoPedido: 1,
    idPedido: 1503,
    estadoAnterior: null,
    estadoNuevo: { codigo: 'PAGADO', nombre: 'Pagado' },
    idUsuario: 6,
    usuario: 'Ana López',
    comentario: null,
    fecha: '2026-11-03T15:31:00.000Z',
  },
];

function abrir() {
  return renderizar(<PedidoDetallePage />, {
    ruta: '/cuenta/pedidos/1503',
    patron: '/cuenta/pedidos/:id',
  });
}

describe('PedidoDetallePage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.obtener.mockResolvedValue(detalle);
    api.historial.mockResolvedValue(historialInicial);
    api.devoluciones.mockResolvedValue([]);
  });

  it('muestra las líneas con precios congelados, los montos, la entrega y el historial', async () => {
    // Arrange / Act
    abrir();

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Pedido SC-2026-001503' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Q 323.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Casa, 5a avenida 10-20, Mixco, Guatemala')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Historial de estados' })).toBeInTheDocument();
  });

  it('pedido de retiro → muestra "Recoger en sucursal" con la copia de la entrega y sin dirección', async () => {
    // Arrange
    api.obtener.mockResolvedValue({
      ...detalle,
      retiroEnSucursal: true,
      sucursal: { idSucursal: 3, nombre: 'Zona 10' },
      direccion: { idDireccion: null, entrega: 'Recoger en Zona 10: 6a avenida 12-34, Guatemala' },
    });

    // Act
    abrir();

    // Assert
    expect(await screen.findByRole('heading', { name: 'Recoger en sucursal' })).toBeInTheDocument();
    expect(screen.getByText(/Recoger en Zona 10: 6a avenida 12-34/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dirección de entrega' })).not.toBeInTheDocument();
  });

  it('ofrece cancelar solo si hay una transición con via CANCELAR', async () => {
    // Arrange
    api.obtener.mockResolvedValue({
      ...detalle,
      estado: 'DESPACHADO',
      transiciones: [{ estado: 'ENTREGADO', nombre: 'Entregado', via: 'ESTADO' }],
    });

    // Act
    abrir();

    // Assert
    await screen.findByRole('heading', { name: 'Pedido SC-2026-001503' });
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });

  it('cancelar pide confirmación, envía el motivo y refresca el pedido', async () => {
    // Arrange
    const cancelado = {
      ...detalle,
      estado: 'CANCELADO',
      nombreEstado: 'Cancelado',
      esFinal: true,
      transiciones: [],
    };
    api.cancelar.mockImplementation(async () => {
      api.obtener.mockResolvedValue(cancelado);
      return cancelado;
    });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    await userEvent.type(screen.getByLabelText('Motivo (opcional)'), 'Me equivoqué de talla');

    // Act
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Cancelar pedido' }).at(-1) as HTMLElement,
    );

    // Assert
    expect(await screen.findByText(/Pedido cancelado/)).toBeInTheDocument();
    expect(api.cancelar).toHaveBeenCalledWith(1503, 'Me equivoqué de talla');
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });

  it('un pedido ajeno (404) muestra la página no encontrada', async () => {
    // Arrange
    api.obtener.mockRejectedValue(new ApiError(404, 'NO_ENCONTRADO', 'No existe.'));

    // Act
    abrir();

    // Assert
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.obtener.mockReturnValue(new Promise(() => undefined));

    // Act
    abrir();

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando pedido' })).toBeInTheDocument();
  });

  it('error del servidor → ErrorState con requestId y Reintentar vuelve a pedir el pedido', async () => {
    // Arrange
    api.obtener
      .mockRejectedValueOnce(
        new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-21'),
      )
      .mockResolvedValueOnce(detalle);
    abrir();
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-21')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Pedido SC-2026-001503' }),
    ).toBeInTheDocument();
    expect(api.obtener).toHaveBeenCalledTimes(2);
  });

  it.each(['abc', '0', '-1'])('id inválido (%s) → NoEncontrado sin llamar a la API', (id) => {
    // Act
    renderizar(<PedidoDetallePage />, {
      ruta: `/cuenta/pedidos/${id}`,
      patron: '/cuenta/pedidos/:id',
    });

    // Assert
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument();
    expect(api.obtener).not.toHaveBeenCalled();
  });

  it('el total del backend se muestra tal cual aunque no sea la suma de las líneas', async () => {
    // Arrange: subtotal 298.00 + envío 25.00 = 323.00, el backend dice 310.00.
    api.obtener.mockResolvedValue({
      ...detalle,
      total: '310.00',
      pago: { ...detalle.pago, monto: '310.00' },
    });

    // Act
    abrir();

    // Assert
    await screen.findByRole('heading', { name: 'Pedido SC-2026-001503' });
    expect(screen.getAllByText('Q 310.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('Q 323.00')).not.toBeInTheDocument();
  });

  it('con transición via CANCELAR → muestra "Cancelar pedido"', async () => {
    // Arrange / Act
    abrir();

    // Assert
    expect(await screen.findByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
  });

  it('"Mantener pedido" → cierra el diálogo sin cancelar', async () => {
    // Arrange
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Mantener pedido' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.cancelar).not.toHaveBeenCalled();
  });

  it('cancelar sin motivo → lo envía como undefined', async () => {
    // Arrange
    api.cancelar.mockResolvedValue({ ...detalle, estado: 'CANCELADO', transiciones: [] });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));

    // Act
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Cancelar pedido' }).at(-1) as HTMLElement,
    );

    // Assert
    await screen.findByText(/Pedido cancelado/);
    expect(api.cancelar).toHaveBeenCalledWith(1503, undefined);
  });

  it('el backend rechaza la cancelación → aviso de error con su requestId y el diálogo se cierra', async () => {
    // Arrange
    api.cancelar.mockRejectedValue(
      new ApiError(409, 'TRANSICION_INVALIDA', 'El pedido ya fue despachado.', [], 'req-31'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));

    // Act
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Cancelar pedido' }).at(-1) as HTMLElement,
    );

    // Assert
    expect(await screen.findByText('El pedido ya fue despachado.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-31')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('las devoluciones fallan → ErrorState con Reintentar que vuelve a pedirlas', async () => {
    // Arrange
    api.devoluciones
      .mockRejectedValueOnce(
        new ApiError(500, 'ERROR_INTERNO', 'Falla de devoluciones.', [], 'req-d'),
      )
      .mockResolvedValue([]);
    abrir();
    expect(await screen.findByText('Falla de devoluciones.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-d')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    await waitFor(() =>
      expect(screen.queryByText('Falla de devoluciones.')).not.toBeInTheDocument(),
    );
    expect(api.devoluciones).toHaveBeenCalledTimes(2);
  });

  it('con devoluciones → las lista', async () => {
    // Arrange
    api.devoluciones.mockResolvedValue([
      {
        idDevolucion: 1,
        tipo: 'PARCIAL',
        motivo: 'Talla incorrecta',
        montoReembolso: '149.00',
        usuario: 'Omar Pérez',
        fecha: '2026-11-10T16:00:00.000Z',
        lineas: [
          {
            idPedidoDetalle: 3021,
            sku: 'CAM-LIM-NEG-M',
            nombreProducto: 'Camiseta',
            cantidad: 1,
            montoReembolso: '149.00',
          },
        ],
      },
    ]);

    // Act
    abrir();

    // Assert
    expect(await screen.findByText(/Devolución parcial/)).toBeInTheDocument();
  });

  it('el historial falla → ErrorState en el seguimiento y Reintentar vuelve a pedirlo', async () => {
    // Arrange
    api.historial
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Historial caído.', [], 'req-41'))
      .mockResolvedValueOnce(historialInicial);
    abrir();
    expect(await screen.findByText('Historial caído.')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByRole('list', { name: 'Historial de estados' })).toBeInTheDocument();
    expect(api.historial).toHaveBeenCalledTimes(2);
  });
});
