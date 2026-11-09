import { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { carritoApi } from '../../services/api/carrito';
import { catalogoApi } from '../../services/api/catalogo';
import { checkoutApi } from '../../services/api/checkout';
import { sucursalesPublicasApi } from '../../services/api/sucursales';
import { tarjetasApi } from '../../services/api/tarjetas';
import { direccionesApi } from '../../services/api/direcciones';
import { ApiError } from '../../services/http';
import { crearDireccion } from '../../test/fixtures/direcciones';
import { crearSucursalPublica } from '../../test/fixtures/sucursales';
import { crearTarjeta } from '../../test/fixtures/tarjetas';
import { crearAuth, renderizar } from '../../test/renderizar';
import type { Usuario } from '../../types/auth';
import type { ResumenCheckout } from '../../types/checkout';
import { idempotencia } from '../../utils/idempotencia';
import CheckoutPage from './CheckoutPage';

vi.mock('../../services/api/checkout', () => ({
  checkoutApi: {
    iniciar: vi.fn(),
    obtenerResumen: vi.fn(),
    liberarReserva: vi.fn(),
    pagar: vi.fn(),
  },
}));
vi.mock('../../services/api/carrito', () => ({ carritoApi: { obtener: vi.fn() } }));
vi.mock('../../services/api/direcciones', () => ({
  direccionesApi: { listar: vi.fn(), crear: vi.fn() },
}));
vi.mock('../../services/api/sucursales', () => ({ sucursalesPublicasApi: { listar: vi.fn() } }));
vi.mock('../../services/api/tarjetas', () => ({ tarjetasApi: { listar: vi.fn() } }));
vi.mock('../../services/api/catalogo', () => ({ catalogoApi: { metodosEnvio: vi.fn() } }));

const checkout = vi.mocked(checkoutApi);
const direcciones = vi.mocked(direccionesApi);
const metodos = vi.mocked(catalogoApi.metodosEnvio);
const sucursales = vi.mocked(sucursalesPublicasApi.listar);

const cliente: Usuario = {
  idUsuario: 7,
  nombre: 'Ana',
  correo: 'cliente@shopcart.gt',
  rol: 'Cliente',
};

const resumen: ResumenCheckout = {
  idCarrito: 88,
  items: [
    {
      idCarritoDetalle: 301,
      idVariante: 41,
      sku: 'CAM-LIM-NEG-M',
      producto: 'Camiseta',
      variante: 'M / Negro',
      cantidad: 2,
      precioUnitario: '149.00',
      importe: '298.00',
      descuentoLinea: '29.80',
      subtotal: '268.20',
    },
  ],
  cupon: null,
  cantidadLineas: 1,
  cantidadUnidades: 2,
  subtotal: '298.00',
  descuento: '29.80',
  costoEnvio: '25.00',
  total: '293.20',
  porcentajeIVA: '12.00',
  montoIVA: '31.41',
  metodoEnvio: { idMetodoEnvio: 1, nombre: 'Estándar', diasEstimados: 3 },
  reservaVigente: true,
  reservaExpiraEn: new Date(Date.now() + 15 * 60_000).toISOString(),
};

const rutas = [
  { path: '/carrito', element: <p>Pantalla del carrito</p> },
  { path: '/pedido-confirmado/:id', element: <p>Pedido confirmado</p> },
];

async function abrirYLlenar(ultimos4 = '4242') {
  const vista = renderizar(<CheckoutPage />, {
    auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
    ruta: '/checkout?idDireccion=5&idMetodoEnvio=1',
    rutas,
  });
  await userEvent.type(await screen.findByLabelText('Titular de la tarjeta'), 'Ana López');
  await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), ultimos4);
  return vista;
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    Object.values(checkout).forEach((fn) => fn.mockReset());
    checkout.obtenerResumen.mockResolvedValue(resumen);
    vi.mocked(carritoApi.obtener)
      .mockReset()
      .mockResolvedValue({ items: [{}] } as never);
    direcciones.listar.mockReset();
    direcciones.crear.mockReset();
    vi.mocked(tarjetasApi.listar).mockReset().mockResolvedValue([]);
    metodos.mockReset();
    sucursales.mockReset().mockResolvedValue([]);
    sessionStorage.clear();
  });
  afterEach(() => sessionStorage.clear());

  it('retoma la reserva vigente y muestra los montos del backend', async () => {
    // Arrange / Act
    await abrirYLlenar();

    // Assert
    expect(checkout.obtenerResumen).toHaveBeenCalledWith(1);
    expect(screen.getByText('Q 293.20')).toBeInTheDocument();
    expect(screen.getByText('Q 25.00')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('un doble envío hace una sola petición y el reintento reutiliza la misma Idempotency-Key', async () => {
    // Arrange
    let rechazar!: (e: unknown) => void;
    checkout.pagar.mockReturnValueOnce(new Promise((_, rej) => (rechazar = rej)));
    await abrirYLlenar();
    const boton = screen.getByRole('button', { name: 'Pagar' });

    // Act
    await userEvent.click(boton);
    await userEvent.click(boton);

    // Assert: una sola petición en curso
    expect(checkout.pagar).toHaveBeenCalledTimes(1);
    const primeraClave = checkout.pagar.mock.calls[0]?.[1];
    expect(primeraClave).toBeTruthy();
    expect(idempotencia.actual()).toBe(primeraClave);

    // Act: el pago es rechazado y se reintenta
    checkout.pagar.mockRejectedValueOnce(
      new ApiError(402, 'PAGO_RECHAZADO', 'El pago fue rechazado.'),
    );
    rechazar(new ApiError(402, 'PAGO_RECHAZADO', 'El pago fue rechazado.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('El pago fue rechazado.');
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert: misma clave
    await waitFor(() => expect(checkout.pagar).toHaveBeenCalledTimes(2));
    expect(checkout.pagar.mock.calls[1]?.[1]).toBe(primeraClave);
  });

  it('un 402 muestra el mensaje y deja reintentar sin salir de la pantalla', async () => {
    // Arrange
    checkout.pagar.mockRejectedValue(new ApiError(402, 'PAGO_RECHAZADO', 'El pago fue rechazado.'));
    await abrirYLlenar('0000');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('El pago fue rechazado.');
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeEnabled();
  });

  it('una reserva vencida (409) regresa al carrito con un aviso y descarta la clave', async () => {
    // Arrange
    checkout.pagar.mockRejectedValue(new ApiError(409, 'RESERVA_VENCIDA', 'La reserva venció.'));
    const { router } = await abrirYLlenar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(await screen.findByText('Pantalla del carrito')).toBeInTheDocument();
    expect(router.state.location.state).toMatchObject({ aviso: { tipo: 'info' } });
    expect(idempotencia.actual()).toBeNull();
  });

  it('un pago exitoso descarta la clave y lleva a la confirmación', async () => {
    // Arrange
    checkout.pagar.mockResolvedValue({
      idPedido: 1503,
      numeroPedido: 'SC-2026-001503',
      estado: 'PAGADO',
      total: '293.20',
      idTarjetaGuardada: null,
    });
    const { router } = await abrirYLlenar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(await screen.findByText('Pedido confirmado')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/pedido-confirmado/1503');
    expect(idempotencia.actual()).toBeNull();
    expect(checkout.pagar).toHaveBeenCalledWith(
      {
        idDireccion: 5,
        idMetodoEnvio: 1,
        metodoPago: 'TARJETA',
        datosPago: { titular: 'Ana López', ultimos4: '4242' },
      },
      expect.any(String),
    );
  });

  it('valida los 4 dígitos sin llamar a la API', async () => {
    // Arrange
    await abrirYLlenar('12');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(await screen.findByText('Ingresa exactamente 4 dígitos.')).toBeInTheDocument();
    expect(checkout.pagar).not.toHaveBeenCalled();
  });

  it('un 409 STOCK_INSUFICIENTE lista las variantes afectadas con enlace al carrito', async () => {
    // Arrange
    checkout.pagar.mockRejectedValue(
      new ApiError(409, 'STOCK_INSUFICIENTE', 'No hay existencia suficiente.', [
        { field: 'idVariante:41', message: 'CAM-LIM-NEG-M: solicitado 2, disponible 1.' },
      ]),
    );
    await abrirYLlenar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(
      await screen.findByText('CAM-LIM-NEG-M: solicitado 2, disponible 1.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustar el carrito' })).toHaveAttribute(
      'href',
      '/carrito',
    );
  });

  it('un 402 conserva la Idempotency-Key para el reintento', async () => {
    // Arrange
    checkout.pagar.mockRejectedValue(new ApiError(402, 'PAGO_RECHAZADO', 'El pago fue rechazado.'));
    await abrirYLlenar('0000');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    await screen.findByText('El pago fue rechazado.');
    expect(idempotencia.actual()).toBe(checkout.pagar.mock.calls[0]?.[1]);
  });

  it('IDEMPOTENCIA_CONFLICTO → descarta la clave y avisa sin volver al carrito', async () => {
    // Arrange
    checkout.pagar.mockRejectedValue(
      new ApiError(409, 'IDEMPOTENCIA_CONFLICTO', 'La clave ya se usó con otro carrito.'),
    );
    await abrirYLlenar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(
      await screen.findByText('No pudimos confirmar el pago. Inténtalo de nuevo.'),
    ).toBeInTheDocument();
    expect(idempotencia.actual()).toBeNull();
    expect(screen.queryByText('Pantalla del carrito')).not.toBeInTheDocument();
  });

  it('el total de la reserva se muestra tal cual, aunque no sea subtotal − descuento + envío', async () => {
    // Arrange: 298.00 − 29.80 + 25.00 = 293.20, el backend dice 300.00.
    checkout.obtenerResumen.mockResolvedValue({ ...resumen, total: '300.00' });

    // Act
    renderizar(<CheckoutPage />, {
      auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
      ruta: '/checkout?idDireccion=5&idMetodoEnvio=1',
      rutas,
    });

    // Assert
    expect(await screen.findByText('Q 300.00')).toBeInTheDocument();
    expect(screen.queryByText('Q 293.20')).not.toBeInTheDocument();
  });

  it('retomando la reserva → muestra el estado de carga', () => {
    // Arrange
    checkout.obtenerResumen.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<CheckoutPage />, {
      auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
      ruta: '/checkout?idDireccion=5&idMetodoEnvio=1',
      rutas,
    });

    // Assert
    expect(screen.getByRole('status', { name: 'Retomando tu pago' })).toBeInTheDocument();
  });

  it('el resumen falla (500) → ErrorState con requestId y Reintentar vuelve a pedirlo', async () => {
    // Arrange
    checkout.obtenerResumen
      .mockRejectedValueOnce(
        new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-81'),
      )
      .mockResolvedValueOnce(resumen);
    renderizar(<CheckoutPage />, {
      auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
      ruta: '/checkout?idDireccion=5&idMetodoEnvio=1',
      rutas,
    });
    expect(await screen.findByText('Referencia: req-81')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByRole('timer')).toBeInTheDocument();
    expect(checkout.obtenerResumen).toHaveBeenCalledTimes(2);
  });

  it('al retomar sin reserva vigente (409) → vuelve al paso 1 con un aviso', async () => {
    // Arrange
    checkout.obtenerResumen.mockRejectedValue(
      new ApiError(409, 'RESERVA_VENCIDA', 'La reserva venció.'),
    );
    direcciones.listar.mockResolvedValue([crearDireccion()]);
    metodos.mockResolvedValue([
      {
        idMetodoEnvio: 1,
        nombre: 'Estándar',
        costo: '25.00',
        diasEstimados: 3,
        requiereSucursal: false,
      },
    ]);

    // Act
    renderizar(<CheckoutPage />, {
      auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
      ruta: '/checkout?idDireccion=5&idMetodoEnvio=1',
      rutas,
    });

    // Assert
    expect(
      await screen.findByText(
        'Tu reserva ya no está vigente. Confirma la entrega para reservarla de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Continuar al pago' })).toBeEnabled();
  });

  it('carrito vacío → redirige al carrito con un aviso', async () => {
    // Arrange
    vi.mocked(carritoApi.obtener).mockResolvedValue({ items: [] } as never);

    // Act
    const { router } = renderizar(<CheckoutPage />, {
      auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
      ruta: '/checkout',
      rutas,
    });

    // Assert
    expect(await screen.findByText('Pantalla del carrito')).toBeInTheDocument();
    expect(router.state.location.state).toMatchObject({
      aviso: { mensaje: 'Tu carrito está vacío.' },
    });
  });

  it('Continuar al pago → reserva con la dirección y el envío elegidos y pone ambos en la URL', async () => {
    // Arrange
    direcciones.listar.mockResolvedValue([crearDireccion()]);
    metodos.mockResolvedValue([
      {
        idMetodoEnvio: 1,
        nombre: 'Estándar',
        costo: '25.00',
        diasEstimados: 3,
        requiereSucursal: false,
      },
    ]);
    checkout.iniciar.mockResolvedValue(resumen);
    const { router } = renderizar(<CheckoutPage />, {
      auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
      ruta: '/checkout',
      rutas,
    });
    await userEvent.click(await screen.findByRole('radio', { name: /Casa/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Estándar/ }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continuar al pago' }));

    // Assert
    expect(await screen.findByRole('timer')).toBeInTheDocument();
    expect(checkout.iniciar).toHaveBeenCalledWith({ idDireccion: 5, idMetodoEnvio: 1 });
    expect(router.state.location.search).toBe('?idDireccion=5&idMetodoEnvio=1');
  });

  it('retiro en sucursal → reserva con idSucursal (sin dirección) y lo pone en la URL', async () => {
    // Arrange
    direcciones.listar.mockResolvedValue([crearDireccion()]);
    metodos.mockResolvedValue([
      {
        idMetodoEnvio: 1,
        nombre: 'Estándar',
        costo: '25.00',
        diasEstimados: 3,
        requiereSucursal: false,
      },
      {
        idMetodoEnvio: 4,
        nombre: 'Recoger en sucursal',
        costo: '0.00',
        diasEstimados: 0,
        requiereSucursal: true,
      },
    ]);
    sucursales.mockResolvedValue([crearSucursalPublica()]);
    checkout.iniciar.mockResolvedValue(resumen);
    const { router } = renderizar(<CheckoutPage />, {
      auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
      ruta: '/checkout',
      rutas,
    });
    await userEvent.click(await screen.findByRole('radio', { name: /Recoger en sucursal/ }));
    await userEvent.click(await screen.findByRole('radio', { name: /Zona 10/ }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continuar al pago' }));

    // Assert
    expect(await screen.findByRole('timer')).toBeInTheDocument();
    expect(checkout.iniciar).toHaveBeenCalledWith({ idMetodoEnvio: 4, idSucursal: 3 });
    expect(router.state.location.search).toBe('?idSucursal=3&idMetodoEnvio=4');
  });

  it('iniciar con 409 STOCK_INSUFICIENTE → lista las variantes afectadas', async () => {
    // Arrange
    direcciones.listar.mockResolvedValue([crearDireccion()]);
    metodos.mockResolvedValue([
      {
        idMetodoEnvio: 1,
        nombre: 'Estándar',
        costo: '25.00',
        diasEstimados: 3,
        requiereSucursal: false,
      },
    ]);
    checkout.iniciar.mockRejectedValue(
      new ApiError(409, 'STOCK_INSUFICIENTE', 'No hay existencia suficiente.', [
        { field: 'idVariante:41', message: 'CAM-LIM-NEG-M: solicitado 2, disponible 1.' },
      ]),
    );
    renderizar(<CheckoutPage />, {
      auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
      ruta: '/checkout',
      rutas,
    });
    await userEvent.click(await screen.findByRole('radio', { name: /Casa/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Estándar/ }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continuar al pago' }));

    // Assert
    expect(
      await screen.findByText('CAM-LIM-NEG-M: solicitado 2, disponible 1.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustar el carrito' })).toBeInTheDocument();
  });

  it('Volver al carrito → libera la reserva, descarta la clave y navega al carrito', async () => {
    // Arrange
    checkout.liberarReserva.mockResolvedValue(undefined);
    idempotencia.obtenerOCrear();
    const { router } = await abrirYLlenar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Volver al carrito' }));

    // Assert
    expect(await screen.findByText('Pantalla del carrito')).toBeInTheDocument();
    expect(checkout.liberarReserva).toHaveBeenCalledTimes(1);
    expect(idempotencia.actual()).toBeNull();
    expect(router.state.location.pathname).toBe('/carrito');
  });

  describe('con tarjetas guardadas', () => {
    const visa = crearTarjeta();
    const master = crearTarjeta({
      idTarjeta: 4,
      marca: 'MASTERCARD',
      tipo: 'DEBITO',
      ultimos4: '1111',
      predeterminada: false,
    });
    const pedido = {
      idPedido: 1503,
      numeroPedido: 'SC-2026-001503',
      estado: 'PAGADO',
      total: '293.20',
      idTarjetaGuardada: 3,
    };
    const abrir = () =>
      renderizar(<CheckoutPage />, {
        auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
        ruta: '/checkout?idDireccion=5&idMetodoEnvio=1',
        rutas,
      });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('pago con la tarjeta guardada preseleccionada → manda datosPago con idTarjeta', async () => {
      // Arrange
      vi.mocked(tarjetasApi.listar).mockResolvedValue([visa, master]);
      checkout.pagar.mockResolvedValue(pedido);
      abrir();
      await screen.findByRole('radio', { name: /VISA · Crédito •••• 4242/ });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

      // Assert
      expect(await screen.findByText('Pedido confirmado')).toBeInTheDocument();
      expect(checkout.pagar).toHaveBeenCalledWith(
        {
          idDireccion: 5,
          idMetodoEnvio: 1,
          metodoPago: 'TARJETA',
          datosPago: { idTarjeta: 3 },
        },
        expect.any(String),
      );
    });

    it('pedido con idTarjetaGuardada → invalida ["tarjetas"]', async () => {
      // Arrange
      const invalidar = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
      vi.mocked(tarjetasApi.listar).mockResolvedValue([visa]);
      checkout.pagar.mockResolvedValue(pedido);
      abrir();
      await screen.findByRole('radio', { name: /VISA/ });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

      // Assert
      await screen.findByText('Pedido confirmado');
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tarjetas'] });
    });

    it('pedido con idTarjetaGuardada null → no invalida ["tarjetas"]', async () => {
      // Arrange
      const invalidar = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
      vi.mocked(tarjetasApi.listar).mockResolvedValue([visa]);
      checkout.pagar.mockResolvedValue({ ...pedido, idTarjetaGuardada: null });
      abrir();
      await screen.findByRole('radio', { name: /VISA/ });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

      // Assert
      await screen.findByText('Pedido confirmado');
      expect(invalidar).not.toHaveBeenCalledWith({ queryKey: ['tarjetas'] });
    });

    it('404 NO_ENCONTRADO → refresca las tarjetas y recrea el formulario con la lista nueva', async () => {
      // Arrange
      vi.mocked(tarjetasApi.listar)
        .mockResolvedValueOnce([visa, master])
        .mockResolvedValue([master]);
      checkout.pagar.mockRejectedValue(
        new ApiError(404, 'NO_ENCONTRADO', 'La tarjeta no existe.', [], 'req-404'),
      );
      abrir();
      await screen.findByRole('radio', { name: /VISA · Crédito •••• 4242/ });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

      // Assert
      expect(await screen.findByText('La tarjeta no existe.')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByRole('radio', { name: /VISA · Crédito •••• 4242/ })).toBeNull(),
      );
      expect(tarjetasApi.listar).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('radio', { name: /Mastercard · Débito •••• 1111/ })).toBeChecked();
    });

    it('pago rechazado (402) con tarjeta guardada → conserva la Idempotency-Key', async () => {
      // Arrange
      vi.mocked(tarjetasApi.listar).mockResolvedValue([visa]);
      checkout.pagar.mockRejectedValue(
        new ApiError(402, 'PAGO_RECHAZADO', 'El pago fue rechazado.'),
      );
      abrir();
      await screen.findByRole('radio', { name: /VISA/ });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

      // Assert
      await screen.findByText('El pago fue rechazado.');
      expect(idempotencia.actual()).toBe(checkout.pagar.mock.calls[0]?.[1]);
    });

    it('falla la carga de tarjetas → cae a la lista vacía con el formulario de siempre', async () => {
      // Arrange
      vi.mocked(tarjetasApi.listar).mockRejectedValue(
        new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'),
      );

      // Act
      abrir();

      // Assert
      expect(await screen.findByLabelText('Titular de la tarjeta')).toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });

    it('mientras cargan las tarjetas → muestra un esqueleto y no el formulario', async () => {
      // Arrange
      vi.mocked(tarjetasApi.listar).mockReturnValue(new Promise(() => undefined));

      // Act
      abrir();

      // Assert
      expect(await screen.findByRole('status', { name: 'Cargando tarjetas' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument();
    });
  });

  describe('retiro en sucursal', () => {
    const retiro = {
      idMetodoEnvio: 4,
      nombre: 'Recoger en sucursal',
      costo: '0.00',
      diasEstimados: 0,
      requiereSucursal: true,
    };
    const resumenRetiro: ResumenCheckout = {
      ...resumen,
      costoEnvio: '0.00',
      total: '268.20',
      metodoEnvio: { idMetodoEnvio: 4, nombre: 'Recoger en sucursal', diasEstimados: 0 },
    };
    const abrirRetiro = () =>
      renderizar(<CheckoutPage />, {
        auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
        ruta: '/checkout?idSucursal=3&idMetodoEnvio=4',
        rutas,
      });

    beforeEach(() => {
      checkout.obtenerResumen.mockResolvedValue(resumenRetiro);
      direcciones.listar.mockResolvedValue([crearDireccion()]);
      metodos.mockResolvedValue([retiro]);
      sucursales.mockResolvedValue([crearSucursalPublica()]);
    });

    it('recargar con ?idSucursal&idMetodoEnvio → retoma la reserva del retiro sin pedir dirección', async () => {
      // Arrange / Act
      abrirRetiro();

      // Assert
      expect(await screen.findByRole('timer')).toBeInTheDocument();
      expect(checkout.obtenerResumen).toHaveBeenCalledWith(4);
      expect(screen.getAllByText('Q 268.20').length).toBeGreaterThan(0);
      expect(checkout.iniciar).not.toHaveBeenCalled();
    });

    it('pagar un retiro → manda idSucursal y no manda idDireccion', async () => {
      // Arrange
      checkout.pagar.mockResolvedValue({
        idPedido: 1504,
        numeroPedido: 'SC-2026-001504',
        estado: 'PAGADO',
        total: '268.20',
        idTarjetaGuardada: null,
      });
      abrirRetiro();
      await userEvent.type(await screen.findByLabelText('Titular de la tarjeta'), 'Ana López');
      await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), '4242');

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

      // Assert
      expect(await screen.findByText('Pedido confirmado')).toBeInTheDocument();
      expect(checkout.pagar).toHaveBeenCalledWith(
        {
          idSucursal: 3,
          idMetodoEnvio: 4,
          metodoPago: 'TARJETA',
          datosPago: { titular: 'Ana López', ultimos4: '4242' },
        },
        expect.any(String),
      );
      expect(checkout.pagar.mock.calls[0]?.[0]).not.toHaveProperty('idDireccion');
    });

    it('iniciar con la sucursal inactiva (404) → muestra el mensaje y sigue en el paso 1', async () => {
      // Arrange
      checkout.obtenerResumen.mockRejectedValue(
        new ApiError(409, 'RESERVA_VENCIDA', 'La reserva venció.'),
      );
      checkout.iniciar.mockRejectedValue(
        new ApiError(404, 'NO_ENCONTRADO', 'La sucursal no existe o está inactiva.', [], 'req-s1'),
      );
      renderizar(<CheckoutPage />, {
        auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
        ruta: '/checkout',
        rutas,
      });
      await userEvent.click(await screen.findByRole('radio', { name: /Recoger en sucursal/ }));
      await userEvent.click(await screen.findByRole('radio', { name: /Zona 10/ }));

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Continuar al pago' }));

      // Assert
      expect(await screen.findByText('La sucursal no existe o está inactiva.')).toBeInTheDocument();
      expect(screen.getByText('Referencia: req-s1')).toBeInTheDocument();
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeEnabled();
    });

    it('pagar con la sucursal inactiva (404) → muestra el mensaje y conserva el formulario', async () => {
      // Arrange
      checkout.pagar.mockRejectedValue(
        new ApiError(404, 'NO_ENCONTRADO', 'La sucursal no existe o está inactiva.'),
      );
      abrirRetiro();
      await userEvent.type(await screen.findByLabelText('Titular de la tarjeta'), 'Ana López');
      await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), '4242');

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

      // Assert
      expect(await screen.findByText('La sucursal no existe o está inactiva.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument();
      expect(screen.queryByText('Pedido confirmado')).not.toBeInTheDocument();
    });

    it('IDEMPOTENCIA_CONFLICTO al pagar un retiro → descarta la clave y avisa', async () => {
      // Arrange
      checkout.pagar.mockRejectedValue(
        new ApiError(409, 'IDEMPOTENCIA_CONFLICTO', 'La clave ya se usó con otra sucursal.'),
      );
      abrirRetiro();
      await userEvent.type(await screen.findByLabelText('Titular de la tarjeta'), 'Ana López');
      await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), '4242');

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

      // Assert
      expect(
        await screen.findByText('No pudimos confirmar el pago. Inténtalo de nuevo.'),
      ).toBeInTheDocument();
      expect(idempotencia.actual()).toBeNull();
    });
  });

  describe('con la reserva por vencer', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('el timer llega a 0 → regresa al carrito con un aviso', async () => {
      // Arrange
      checkout.obtenerResumen.mockResolvedValue({
        ...resumen,
        reservaExpiraEn: new Date(Date.now() + 1500).toISOString(),
      });
      const { router } = renderizar(<CheckoutPage />, {
        auth: crearAuth({ usuario: cliente, estado: 'autenticado' }),
        ruta: '/checkout?idDireccion=5&idMetodoEnvio=1',
        rutas,
      });
      await screen.findByRole('timer');

      // Act
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      // Assert
      expect(await screen.findByText('Pantalla del carrito')).toBeInTheDocument();
      expect(router.state.location.state).toMatchObject({ aviso: { tipo: 'info' } });
    });
  });
});
