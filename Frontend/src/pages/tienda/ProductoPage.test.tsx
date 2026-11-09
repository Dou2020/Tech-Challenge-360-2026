import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { carritoApi } from '../../services/api/carrito';
import { catalogoApi } from '../../services/api/catalogo';
import { ApiError } from '../../services/http';
import { crearCarrito, crearCarritoVacio, crearLineaCarrito } from '../../test/fixtures/carrito';
import { crearAdmin, crearCliente, crearOperador } from '../../test/fixtures/usuarios';
import { crearAuth, renderizar } from '../../test/renderizar';
import type { ProductoDetalle } from '../../types/catalogo';
import ProductoPage from './ProductoPage';

vi.mock('../../services/api/catalogo', () => ({ catalogoApi: { producto: vi.fn() } }));
vi.mock('../../services/api/carrito', () => ({
  carritoApi: { agregarItem: vi.fn(), obtener: vi.fn(), fusionar: vi.fn() },
}));

const producto = vi.mocked(catalogoApi.producto);
const agregarItem = vi.mocked(carritoApi.agregarItem);
const obtenerCarrito = vi.mocked(carritoApi.obtener);

const valores = (talla: [number, string], color: [number, string]) => [
  { idAtributo: 1, atributo: 'Talla', idValorAtributo: talla[0], valor: talla[1] },
  { idAtributo: 2, atributo: 'Color', idValorAtributo: color[0], valor: color[1] },
];

const detalle: ProductoDetalle = {
  idProducto: 5,
  nombre: 'Tenis urbanos',
  descripcion: 'Tenis de lona.',
  idCategoria: 3,
  categoria: 'Calzado',
  precioMinimo: '459.00',
  precioMaximo: '499.00',
  disponible: true,
  fechaCreacion: '2026-11-01T15:30:00.000Z',
  imagenes: [],
  variantes: [
    {
      idVariante: 11,
      sku: 'TEN-40-BLA',
      precio: '459.00',
      existenciaDisponible: 3,
      descripcion: null,
      valores: valores([8, '40'], [13, 'Blanco']),
    },
    {
      idVariante: 12,
      sku: 'TEN-42-BLA',
      precio: '499.00',
      existenciaDisponible: 0,
      descripcion: null,
      valores: valores([9, '42'], [13, 'Blanco']),
    },
  ],
};

function pagina() {
  return renderizar(<ProductoPage />, { ruta: '/productos/5', patron: '/productos/:id' });
}

function paginaCliente() {
  return renderizar(<ProductoPage />, {
    ruta: '/productos/5',
    patron: '/productos/:id',
    auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
  });
}

/** Carrito con líneas de este producto (idProducto 5). */
function carritoCon(...lineas: { idVariante: number; cantidad: number; fecha?: string }[]) {
  return crearCarrito({
    items: lineas.map((l, i) =>
      crearLineaCarrito({
        idCarritoDetalle: i + 1,
        idProducto: 5,
        idVariante: l.idVariante,
        cantidad: l.cantidad,
        fechaAgregado: l.fecha ?? '2026-11-02T10:00:00.000Z',
      }),
    ),
  });
}

describe('ProductoPage', () => {
  beforeEach(() => {
    producto.mockReset().mockResolvedValue(detalle);
    agregarItem.mockReset();
    obtenerCarrito.mockReset().mockResolvedValue(crearCarritoVacio());
  });

  it('muestra la variante inicial con su precio y existencia', async () => {
    // Arrange / Act
    pagina();

    // Assert
    expect(await screen.findByRole('heading', { name: 'Tenis urbanos' })).toBeInTheDocument();
    expect(screen.getByText('Q 459.00')).toBeInTheDocument();
    expect(screen.getByText('3 disponibles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '40' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('al elegir otra variante cambia el precio y, sin existencia, bloquea la compra', async () => {
    // Arrange
    pagina();
    await screen.findByRole('heading', { name: 'Tenis urbanos' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: '42' }));

    // Assert
    expect(screen.getByText('Q 499.00')).toBeInTheDocument();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar al carrito' })).toBeDisabled();
  });

  it('la cantidad no supera la existencia de la variante elegida', async () => {
    // Arrange
    pagina();
    await screen.findByRole('heading', { name: 'Tenis urbanos' });
    const campo = screen.getByLabelText('Cantidad');

    // Act
    await userEvent.clear(campo);
    await userEvent.type(campo, '10');

    // Assert
    expect(campo).toHaveValue(3);
    expect(screen.getByRole('button', { name: 'Aumentar cantidad' })).toBeDisabled();
  });

  it('agrega la variante elegida con la cantidad indicada', async () => {
    // Arrange
    agregarItem.mockResolvedValue({} as never);
    pagina();
    await screen.findByRole('heading', { name: 'Tenis urbanos' });
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    // Assert
    expect(await screen.findByText('Agregado al carrito.')).toBeInTheDocument();
    expect(agregarItem).toHaveBeenCalledWith(11, 2);
  });

  it('un 409 STOCK_INSUFICIENTE muestra el aviso con la cifra de details', async () => {
    // Arrange
    agregarItem.mockRejectedValue(
      new ApiError(409, 'STOCK_INSUFICIENTE', 'Solo hay 1 unidad(es) disponible(s).', [
        { field: 'cantidad', message: 'Disponible: 1' },
      ]),
    );
    pagina();
    await screen.findByRole('heading', { name: 'Tenis urbanos' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Disponible: 1');
  });

  it('un producto inexistente (404) muestra la página no encontrada', async () => {
    // Arrange
    producto.mockRejectedValue(new ApiError(404, 'NO_ENCONTRADO', 'No existe.'));

    // Act
    pagina();

    // Assert
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    producto.mockReturnValue(new Promise(() => undefined));

    // Act
    pagina();

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando producto' })).toBeInTheDocument();
  });

  it.each(['abc', '0', '-2'])('id inválido (%s) → NoEncontrado sin llamar a la API', (id) => {
    // Act
    renderizar(<ProductoPage />, { ruta: `/productos/${id}`, patron: '/productos/:id' });

    // Assert
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument();
    expect(producto).not.toHaveBeenCalled();
  });

  it('error del servidor → ErrorState con requestId y Reintentar vuelve a pedir el producto', async () => {
    // Arrange
    producto
      .mockRejectedValueOnce(
        new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-17'),
      )
      .mockResolvedValueOnce(detalle);
    pagina();
    expect(await screen.findByText('Referencia: req-17')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Tenis urbanos' })).toBeInTheDocument();
    expect(producto).toHaveBeenCalledTimes(2);
  });

  it('muestra la categoría con enlace al catálogo filtrado y la descripción', async () => {
    // Act
    pagina();

    // Assert
    expect(await screen.findByRole('link', { name: 'Calzado' })).toHaveAttribute(
      'href',
      '/catalogo?idCategoria=3',
    );
    expect(screen.getByText('Tenis de lona.')).toBeInTheDocument();
  });

  it.each([
    ['Operador', crearOperador()],
    ['Administrador', crearAdmin()],
  ])('%s → no ve el botón de compra y se le explica por qué', async (_rol, usuario) => {
    // Act
    renderizar(<ProductoPage />, {
      ruta: '/productos/5',
      patron: '/productos/:id',
      auth: crearAuth({ usuario, estado: 'autenticado' }),
    });

    // Assert
    expect(
      await screen.findByText('Las cuentas del personal no tienen carrito de compras.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar al carrito' })).not.toBeInTheDocument();
  });

  it('Cliente → ve el botón de compra', async () => {
    // Act
    renderizar(<ProductoPage />, {
      ruta: '/productos/5',
      patron: '/productos/:id',
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
    });

    // Assert
    expect(await screen.findByRole('button', { name: 'Agregar al carrito' })).toBeEnabled();
  });

  it('agregado con éxito → ofrece ir al carrito', async () => {
    // Arrange
    agregarItem.mockResolvedValue({} as never);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar al carrito' }));

    // Assert
    expect(await screen.findByRole('link', { name: 'Ir al carrito' })).toHaveAttribute(
      'href',
      '/carrito',
    );
  });

  it('un error genérico al agregar → aviso con el mensaje y el requestId', async () => {
    // Arrange
    agregarItem.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-18'),
    );
    pagina();
    await screen.findByRole('heading', { name: 'Tenis urbanos' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-18')).toBeInTheDocument();
  });

  it('un 409 STOCK_INSUFICIENTE → vuelve a pedir el producto para refrescar la existencia', async () => {
    // Arrange
    agregarItem.mockRejectedValue(
      new ApiError(409, 'STOCK_INSUFICIENTE', 'Sin existencia.', [
        { field: 'cantidad', message: 'Disponible: 1' },
      ]),
    );
    pagina();
    await screen.findByRole('heading', { name: 'Tenis urbanos' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    // Assert
    await screen.findByText(/Disponible: 1/);
    await waitFor(() => expect(producto).toHaveBeenCalledTimes(2));
  });

  describe('lo que ya está en el carrito', () => {
    it('arranca en la variante del carrito y muestra cuántas hay con enlace al carrito', async () => {
      // Arrange
      producto.mockResolvedValue({
        ...detalle,
        variantes: detalle.variantes.map((v) => ({ ...v, existenciaDisponible: 3 })),
      });
      obtenerCarrito.mockResolvedValue(carritoCon({ idVariante: 12, cantidad: 2 }));

      // Act
      paginaCliente();

      // Assert
      expect(await screen.findByText(/En tu carrito: 2/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '42' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('link', { name: 'Ver carrito' })).toHaveAttribute('href', '/carrito');
      expect(screen.getByLabelText('Cantidad')).toHaveValue(1);
    });

    it('con varias variantes en el carrito → arranca en la agregada al final', async () => {
      // Arrange
      producto.mockResolvedValue({
        ...detalle,
        variantes: detalle.variantes.map((v) => ({ ...v, existenciaDisponible: 3 })),
      });
      obtenerCarrito.mockResolvedValue(
        carritoCon(
          { idVariante: 12, cantidad: 1, fecha: '2026-11-02T10:00:00.000Z' },
          { idVariante: 11, cantidad: 1, fecha: '2026-11-02T11:00:00.000Z' },
        ),
      );

      // Act
      paginaCliente();

      // Assert
      expect(await screen.findByRole('button', { name: '40' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByText(/En tu carrito: 1/)).toBeInTheDocument();
    });

    it('el tope del contador es lo disponible menos lo que ya está en el carrito', async () => {
      // Arrange
      obtenerCarrito.mockResolvedValue(carritoCon({ idVariante: 11, cantidad: 2 }));
      paginaCliente();
      const campo = await screen.findByLabelText('Cantidad');

      // Act
      await userEvent.clear(campo);
      await userEvent.type(campo, '3');

      // Assert
      expect(campo).toHaveValue(1);
      expect(screen.getByRole('button', { name: 'Aumentar cantidad' })).toBeDisabled();
    });

    it('todo lo disponible ya está en el carrito → lo avisa y bloquea agregar', async () => {
      // Arrange
      obtenerCarrito.mockResolvedValue(carritoCon({ idVariante: 11, cantidad: 3 }));

      // Act
      paginaCliente();

      // Assert
      expect(
        await screen.findByText('Ya tienes en tu carrito todo lo disponible.'),
      ).toBeInTheDocument();
      expect(screen.getByText('3 disponibles')).toBeInTheDocument();
      expect(screen.queryByText('Agotado')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Agregar al carrito' })).toBeDisabled();
    });

    it('al agregar → el contador vuelve a 1 y se ve el total del carrito', async () => {
      // Arrange
      agregarItem.mockResolvedValue(carritoCon({ idVariante: 11, cantidad: 2 }));
      paginaCliente();
      await userEvent.click(await screen.findByRole('button', { name: 'Aumentar cantidad' }));

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

      // Assert
      expect(await screen.findByText(/En tu carrito: 2/)).toBeInTheDocument();
      expect(agregarItem).toHaveBeenCalledWith(11, 2);
      expect(screen.getByLabelText('Cantidad')).toHaveValue(1);
      expect(screen.queryByRole('link', { name: 'Ir al carrito' })).not.toBeInTheDocument();
    });

    it('si el carrito no se puede leer → la ficha se muestra como siempre', async () => {
      // Arrange
      obtenerCarrito.mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Falla.'));

      // Act
      paginaCliente();

      // Assert
      expect(await screen.findByRole('button', { name: '40' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.queryByText(/En tu carrito/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Agregar al carrito' })).toBeEnabled();
    });
  });
});
