import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { carritoApi } from '../../services/api/carrito';
import { ApiError } from '../../services/http';
import { crearAuth, renderizar } from '../../test/renderizar';
import type { Carrito, LineaCarrito } from '../../types/carrito';
import type { Usuario } from '../../types/auth';
import { crearCarritoVacio } from '../../test/fixtures/carrito';
import { crearAdmin, crearOperador } from '../../test/fixtures/usuarios';
import { guestCart } from '../../utils/guestCart';
import CarritoPage from './CarritoPage';

vi.mock('../../services/api/carrito', () => ({
  carritoApi: {
    obtener: vi.fn(),
    agregarItem: vi.fn(),
    actualizarCantidad: vi.fn(),
    eliminarItem: vi.fn(),
    vaciar: vi.fn(),
    aplicarCupon: vi.fn(),
    quitarCupon: vi.fn(),
    fusionar: vi.fn(),
  },
}));

const api = vi.mocked(carritoApi);

const cliente: Usuario = {
  idUsuario: 7,
  nombre: 'Ana',
  correo: 'cliente@shopcart.gt',
  rol: 'Cliente',
};
const authCliente = () => crearAuth({ usuario: cliente, estado: 'autenticado' });

function linea(parcial: Partial<LineaCarrito> = {}): LineaCarrito {
  return {
    idCarritoDetalle: 1,
    idVariante: 41,
    sku: 'CAM-BAS-M-AZ',
    idProducto: 9,
    producto: 'Camisa básica',
    idCategoria: 2,
    categoria: 'Camisetas',
    variante: 'Talla M / Azul',
    imagen: null,
    precioUnitario: '149.00',
    cantidad: 2,
    importe: '298.00',
    descuentoLinea: '0.00',
    importeNeto: '298.00',
    elegibleCupon: true,
    existenciaDisponible: 7,
    vendible: true,
    excedeDisponible: false,
    requiereAjuste: false,
    fechaAgregado: '2026-11-01T15:30:00.000Z',
    ...parcial,
  };
}

function carrito(parcial: Partial<Carrito> = {}): Carrito {
  return {
    idCarrito: 88,
    items: [linea()],
    cupon: null,
    cantidadLineas: 1,
    cantidadUnidades: 2,
    subtotal: '298.00',
    descuento: '0.00',
    total: '298.00',
    porcentajeIVA: '12.00',
    montoIVA: '31.93',
    lineasRequierenAjuste: 0,
    ...parcial,
  };
}

const rutas = [
  { path: '/checkout', element: <p>Pantalla de pago</p> },
  { path: '/login', element: <p>Pantalla de login</p> },
];

describe('CarritoPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });
  afterEach(() => localStorage.clear());

  it('un invitado sin token ve el carrito vacío, sin carga infinita ni llamadas a la API', async () => {
    // Arrange
    const auth = crearAuth({ estado: 'anonimo' });

    // Act
    renderizar(<CarritoPage />, { auth, ruta: '/carrito' });

    // Assert
    expect(await screen.findByText('Tu carrito está vacío')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Cargando carrito' })).not.toBeInTheDocument();
    expect(api.obtener).not.toHaveBeenCalled();
  });

  it('un invitado con token ve su carrito y lo manda a iniciar sesión para pagar', async () => {
    // Arrange
    guestCart.guardar('token-invitado');
    api.obtener.mockResolvedValue(carrito());
    renderizar(<CarritoPage />, {
      auth: crearAuth({ estado: 'anonimo' }),
      ruta: '/carrito',
      rutas,
    });
    await screen.findByText('Camisa básica');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Ir a pagar' }));

    // Assert
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código de cupón')).not.toBeInTheDocument();
  });

  it('muestra los montos que devuelve el backend', async () => {
    // Arrange
    api.obtener.mockResolvedValue(
      carrito({ descuento: '29.80', total: '268.20', cupon: null, subtotal: '298.00' }),
    );

    // Act
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });

    // Assert
    expect(await screen.findByText('Q 268.20')).toBeInTheDocument();
    expect(screen.getAllByText('Q 298.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Q 31.93')).toBeInTheDocument();
  });

  it('con líneas que requieren ajuste bloquea "Ir a pagar" y resalta la línea', async () => {
    // Arrange
    api.obtener.mockResolvedValue(
      carrito({
        lineasRequierenAjuste: 1,
        items: [
          linea({
            cantidad: 5,
            existenciaDisponible: 3,
            excedeDisponible: true,
            requiereAjuste: true,
          }),
        ],
      }),
    );

    // Act
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito', rutas });

    // Assert
    expect(
      await screen.findByText('Solo hay 3 disponible(s). Baja la cantidad.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir a pagar' })).toBeDisabled();
  });

  it('el Cliente sin ajustes pasa al checkout', async () => {
    // Arrange
    api.obtener.mockResolvedValue(carrito());
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito', rutas });
    await screen.findByText('Camisa básica');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Ir a pagar' }));

    // Assert
    expect(await screen.findByText('Pantalla de pago')).toBeInTheDocument();
  });

  it('un cupón rechazado muestra el mensaje exacto del 422', async () => {
    // Arrange
    const mensaje =
      'El cupón VERANO25 requiere una compra mínima de Q300.00; tu carrito suma Q298.00.';
    api.obtener.mockResolvedValue(carrito());
    api.aplicarCupon.mockRejectedValue(new ApiError(422, 'CUPON_MINIMO_NO_ALCANZADO', mensaje));
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await screen.findByText('Camisa básica');

    // Act
    await userEvent.type(screen.getByLabelText('Código de cupón'), 'VERANO25');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    // Assert
    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    expect(screen.getByLabelText('Código de cupón')).toHaveAttribute('aria-invalid', 'true');
    expect(api.aplicarCupon).toHaveBeenCalledWith('VERANO25');
  });

  it('un cupón guardado que ya no aplica muestra su mensajeError', async () => {
    // Arrange
    api.obtener.mockResolvedValue(
      carrito({
        cupon: {
          idCupon: 2,
          codigo: 'VENCIDO5',
          descripcion: null,
          tipoDescuento: 'MONTO_FIJO',
          valor: '5.00',
          idCategoria: null,
          categoria: null,
          aplicado: false,
          codigoError: 'CUPON_VENCIDO',
          mensajeError: 'El cupón VENCIDO5 ya venció.',
        },
      }),
    );

    // Act
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });

    // Assert
    expect(await screen.findByText('El cupón VENCIDO5 ya venció.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar cupón' })).toBeInTheDocument();
  });

  it('un 409 STOCK_INSUFICIENTE al cambiar la cantidad muestra el aviso con details', async () => {
    // Arrange
    api.obtener.mockResolvedValue(carrito());
    api.actualizarCantidad.mockRejectedValue(
      new ApiError(409, 'STOCK_INSUFICIENTE', 'Solo hay 3 unidad(es) disponible(s).', [
        { field: 'cantidad', message: 'Disponible: 3' },
      ]),
    );
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await screen.findByText('Camisa básica');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));

    // Assert
    expect(await screen.findByText(/Disponible: 3/)).toBeInTheDocument();
    expect(api.actualizarCantidad).toHaveBeenCalledWith(41, 3);
  });

  it('vaciar pide confirmación y deja el carrito vacío', async () => {
    // Arrange
    api.obtener.mockResolvedValue(carrito());
    api.vaciar.mockResolvedValue(carrito({ idCarrito: null, items: [], cantidadUnidades: 0 }));
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await screen.findByText('Camisa básica');
    await userEvent.click(screen.getByRole('button', { name: 'Vaciar carrito' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Vaciar' }));

    // Assert
    expect(await screen.findByText('Tu carrito está vacío')).toBeInTheDocument();
    expect(api.vaciar).toHaveBeenCalledOnce();
  });

  it('si la consulta falla muestra el error con reintentar', async () => {
    // Arrange
    api.obtener.mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Fallo.', [], 'req-9'));

    // Act
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Referencia: req-9');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it.each([
    ['Operador', crearOperador()],
    ['Administrador', crearAdmin()],
  ])('%s → mensaje de que no tiene carrito y no consulta la API', (_rol, usuario) => {
    // Act
    renderizar(<CarritoPage />, {
      auth: crearAuth({ usuario, estado: 'autenticado' }),
      ruta: '/carrito',
    });

    // Assert
    expect(screen.getByText('Las cuentas del personal no tienen carrito')).toBeInTheDocument();
    expect(api.obtener).not.toHaveBeenCalled();
  });

  it('sesión restaurándose → muestra el estado de carga', () => {
    // Act
    renderizar(<CarritoPage />, { auth: crearAuth({ estado: 'cargando' }), ruta: '/carrito' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando carrito' })).toBeInTheDocument();
  });

  it('llega desde el checkout con un aviso (reserva vencida) → lo muestra en el carrito vacío', async () => {
    // Arrange
    const aviso = { tipo: 'info', mensaje: 'Tu reserva venció. Revisa tu carrito.' };

    api.obtener.mockResolvedValue(crearCarritoVacio());

    // Act
    renderizar(<CarritoPage />, {
      auth: authCliente(),
      ruta: '/carrito',
      estadoRuta: { aviso },
    });

    // Assert
    expect(await screen.findByText('Tu reserva venció. Revisa tu carrito.')).toBeInTheDocument();
  });

  it('llega desde el checkout con un aviso y con líneas → lo muestra junto al carrito', async () => {
    // Arrange
    api.obtener.mockResolvedValue(carrito());

    // Act
    renderizar(<CarritoPage />, {
      auth: authCliente(),
      ruta: '/carrito',
      estadoRuta: { aviso: { tipo: 'info', mensaje: 'Tu reserva venció. Revisa tu carrito.' } },
    });

    // Assert
    expect(await screen.findByText('Camisa básica')).toBeInTheDocument();
    expect(screen.getByText('Tu reserva venció. Revisa tu carrito.')).toBeInTheDocument();
  });

  it('cambiar la cantidad → llama a la API y muestra el total nuevo del backend sin recalcular', async () => {
    // Arrange: 3 × 149.00 = 447.00, pero el backend responde 420.00.
    api.obtener.mockResolvedValue(carrito());
    api.actualizarCantidad.mockResolvedValue(
      carrito({
        items: [linea({ cantidad: 3, importe: '447.00', importeNeto: '447.00' })],
        cantidadUnidades: 3,
        subtotal: '447.00',
        total: '420.00',
      }),
    );
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await screen.findByText('Camisa básica');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));

    // Assert
    expect(await screen.findByText('Q 420.00')).toBeInTheDocument();
    expect(api.actualizarCantidad).toHaveBeenCalledWith(41, 3);
  });

  it('quitar una línea → llama a eliminarItem con su variante', async () => {
    // Arrange
    api.obtener.mockResolvedValue(carrito());
    api.eliminarItem.mockResolvedValue(
      carrito({ idCarrito: null, items: [], cantidadUnidades: 0 }),
    );
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await screen.findByText('Camisa básica');

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Quitar Camisa básica/ }));

    // Assert
    expect(await screen.findByText('Tu carrito está vacío')).toBeInTheDocument();
    expect(api.eliminarItem).toHaveBeenCalledWith(41);
  });

  it('un error genérico al quitar → aviso con el mensaje y el requestId', async () => {
    // Arrange
    api.obtener.mockResolvedValue(carrito());
    api.eliminarItem.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-61'),
    );
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await screen.findByText('Camisa básica');

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Quitar Camisa básica/ }));

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-61')).toBeInTheDocument();
  });

  it('cupón aplicado → muestra el descuento y el total del backend', async () => {
    // Arrange
    api.obtener.mockResolvedValue(carrito());
    api.aplicarCupon.mockResolvedValue(
      carrito({
        descuento: '74.50',
        total: '223.50',
        cupon: {
          idCupon: 3,
          codigo: 'VERANO25',
          descripcion: null,
          tipoDescuento: 'PORCENTAJE',
          valor: '25.00',
          idCategoria: null,
          categoria: null,
          aplicado: true,
          codigoError: null,
          mensajeError: null,
        },
      }),
    );
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await userEvent.type(await screen.findByLabelText('Código de cupón'), 'VERANO25');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    // Assert
    expect(await screen.findByText('Descuento (VERANO25)')).toBeInTheDocument();
    expect(screen.getByText('Q 223.50')).toBeInTheDocument();
  });

  it('Quitar cupón → llama a quitarCupon y limpia el error previo', async () => {
    // Arrange
    api.obtener.mockResolvedValue(
      carrito({
        cupon: {
          idCupon: 2,
          codigo: 'VENCIDO5',
          descripcion: null,
          tipoDescuento: 'MONTO_FIJO',
          valor: '5.00',
          idCategoria: null,
          categoria: null,
          aplicado: false,
          codigoError: 'CUPON_VENCIDO',
          mensajeError: 'El cupón VENCIDO5 ya venció.',
        },
      }),
    );
    api.quitarCupon.mockResolvedValue(carrito());
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar cupón' }));

    // Assert
    await waitFor(() =>
      expect(screen.queryByText('El cupón VENCIDO5 ya venció.')).not.toBeInTheDocument(),
    );
    expect(api.quitarCupon).toHaveBeenCalledTimes(1);
  });

  it('cancelar el vaciado → cierra el diálogo sin llamar a la API', async () => {
    // Arrange
    api.obtener.mockResolvedValue(carrito());
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await screen.findByText('Camisa básica');
    await userEvent.click(screen.getByRole('button', { name: 'Vaciar carrito' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.vaciar).not.toHaveBeenCalled();
  });

  it('falla el vaciado → cierra el diálogo y muestra el aviso de error', async () => {
    // Arrange
    api.obtener.mockResolvedValue(carrito());
    api.vaciar.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'No se pudo vaciar.', [], 'req-71'),
    );
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await screen.findByText('Camisa básica');
    await userEvent.click(screen.getByRole('button', { name: 'Vaciar carrito' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Vaciar' }));

    // Assert
    expect(await screen.findByText('No se pudo vaciar.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Reintentar tras un error → vuelve a pedir el carrito', async () => {
    // Arrange
    api.obtener
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Fallo.', [], 'req-9'))
      .mockResolvedValueOnce(carrito());
    renderizar(<CarritoPage />, { auth: authCliente(), ruta: '/carrito' });
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('Camisa básica')).toBeInTheDocument();
    expect(api.obtener).toHaveBeenCalledTimes(2);
  });
});
