import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  atributosApi,
  categoriasApi,
  productosApi,
  variantesApi,
} from '../../services/api/gestion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { ProductoGestion } from '../../types/gestion';
import ProductoEditarPage from './ProductoEditarPage';

vi.mock('../../services/api/gestion', () => ({
  productosApi: {
    obtener: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
    agregarImagen: vi.fn(),
    subirImagen: vi.fn(),
    quitarImagen: vi.fn(),
    ordenarImagenes: vi.fn(),
    agregarVariante: vi.fn(),
  },
  variantesApi: { actualizar: vi.fn(), cambiarPrecio: vi.fn(), cambiarEstado: vi.fn() },
  categoriasApi: { listar: vi.fn() },
  atributosApi: { listar: vi.fn(), crear: vi.fn(), agregarValor: vi.fn() },
}));

const producto: ProductoGestion = {
  idProducto: 8,
  nombre: 'Sudadero con capucha',
  descripcion: null,
  idCategoria: 1,
  categoria: 'Camisetas',
  categoriaActiva: true,
  activo: true,
  fechaCreacion: '2026-11-01T15:30:00.000Z',
  fechaModificacion: null,
  tieneVentas: true,
  puedeEliminarse: false,
  variantes: [
    {
      idVariante: 17,
      idProducto: 8,
      sku: 'SUD-CAP-NEG-M',
      precio: '249.00',
      existenciaFisica: 10,
      existenciaReservada: 0,
      existenciaDisponible: 10,
      activo: true,
      descripcion: 'Talla M',
      valores: [],
    },
  ],
  imagenes: [{ idProductoImagen: 4, url: 'https://img.test/a.jpg', orden: 0, esPrincipal: true }],
};

function abrir() {
  return renderizar(<ProductoEditarPage />, {
    ruta: '/consola/productos/8',
    patron: '/consola/productos/:id',
    rutas: [{ path: '/consola/productos', element: <p>Lista de productos</p> }],
  });
}

describe('ProductoEditarPage', () => {
  beforeEach(() => {
    vi.mocked(productosApi.obtener).mockReset().mockResolvedValue(producto);
    vi.mocked(variantesApi.cambiarPrecio).mockReset();
    vi.mocked(productosApi.eliminar).mockReset();
    vi.mocked(productosApi.actualizar).mockReset();
    vi.mocked(productosApi.cambiarEstado).mockReset();
    vi.mocked(productosApi.quitarImagen).mockReset();
    vi.mocked(productosApi.agregarImagen).mockReset();
    vi.mocked(productosApi.subirImagen).mockReset();
    vi.mocked(productosApi.ordenarImagenes).mockReset();
    vi.mocked(categoriasApi.listar).mockResolvedValue({
      items: [
        {
          idCategoria: 1,
          nombre: 'Camisetas',
          descripcion: null,
          activo: true,
          cantidadProductos: 1,
          cantidadCupones: 0,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    vi.mocked(atributosApi.listar).mockResolvedValue([]);
  });

  it('cambiar el precio muestra anterior → nuevo, aclara que no afecta pedidos y lo envía', async () => {
    // Arrange
    vi.mocked(variantesApi.cambiarPrecio).mockResolvedValue({
      ...producto.variantes[0]!,
      precio: '259.00',
    });
    abrir();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cambiar precio de SUD-CAP-NEG-M' }),
    );
    const dialogo = screen.getByRole('dialog');

    // Act
    await userEvent.type(within(dialogo).getByLabelText('Nuevo precio'), '259');
    expect(dialogo).toHaveTextContent('Q 249.00 → Q 259.00');
    expect(dialogo).toHaveTextContent('conservan el precio');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cambiar precio' }));

    // Assert
    await waitFor(() => expect(variantesApi.cambiarPrecio).toHaveBeenCalledWith(17, '259'));
    expect(await screen.findByText('Precio de SUD-CAP-NEG-M actualizado.')).toBeInTheDocument();
  });

  it('un precio inválido se rechaza en el diálogo sin llamar a la API', async () => {
    // Arrange
    abrir();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cambiar precio de SUD-CAP-NEG-M' }),
    );
    const dialogo = screen.getByRole('dialog');

    // Act
    await userEvent.type(within(dialogo).getByLabelText('Nuevo precio'), '0');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cambiar precio' }));

    // Assert
    expect(await within(dialogo).findByText(/mayor que 0/)).toBeInTheDocument();
    expect(variantesApi.cambiarPrecio).not.toHaveBeenCalled();
  });

  it('eliminar un producto con ventas (409) sugiere desactivarlo', async () => {
    // Arrange
    vi.mocked(productosApi.eliminar).mockRejectedValue(
      new ApiError(409, 'PRODUCTO_CON_VENTAS', 'Tiene ventas.'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar producto' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Desactívalo para ocultarlo');
  });

  it('agrega una imagen por URL como principal', async () => {
    // Arrange
    vi.mocked(productosApi.agregarImagen).mockResolvedValue(producto);
    abrir();
    await userEvent.click(await screen.findByRole('radio', { name: 'Usar una URL' }));
    await userEvent.type(
      await screen.findByLabelText('URL de la imagen'),
      'https://img.test/b.jpg',
    );
    await userEvent.click(screen.getByLabelText('Imagen principal'));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

    // Assert
    await waitFor(() =>
      expect(productosApi.agregarImagen).toHaveBeenCalledWith(8, {
        url: 'https://img.test/b.jpg',
        esPrincipal: true,
      }),
    );
  });

  it('sube un archivo como principal → llama a subirImagen y avisa', async () => {
    // Arrange
    vi.mocked(productosApi.subirImagen).mockResolvedValue(producto);
    abrir();
    const archivo = new File(['x'], 'foto.png', { type: 'image/png' });
    await userEvent.upload(await screen.findByLabelText('Archivo de imagen'), archivo);
    await userEvent.click(screen.getByLabelText('Imagen principal'));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

    // Assert
    await waitFor(() =>
      expect(productosApi.subirImagen).toHaveBeenCalledWith(8, {
        archivo,
        esPrincipal: true,
      }),
    );
    expect(await screen.findByText('Imagen subida.')).toBeInTheDocument();
  });

  it('subir un archivo demasiado grande (413) → mensaje en el campo y sin aviso de éxito', async () => {
    // Arrange
    vi.mocked(productosApi.subirImagen).mockRejectedValue(
      new ApiError(413, 'ARCHIVO_DEMASIADO_GRANDE', 'Archivo demasiado grande.'),
    );
    abrir();
    await userEvent.upload(
      await screen.findByLabelText('Archivo de imagen'),
      new File(['x'], 'foto.png', { type: 'image/png' }),
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

    // Assert
    expect(
      await screen.findByText('La imagen supera el tamaño máximo permitido (5 MB).'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Imagen subida.')).not.toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    vi.mocked(productosApi.obtener).mockReturnValue(new Promise(() => undefined));

    // Act
    abrir();

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando producto' })).toBeInTheDocument();
  });

  it('producto inexistente (404) → NoEncontrado', async () => {
    // Arrange
    vi.mocked(productosApi.obtener).mockRejectedValue(
      new ApiError(404, 'NO_ENCONTRADO', 'No existe.'),
    );

    // Act
    abrir();

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Página no encontrada' }),
    ).toBeInTheDocument();
  });

  it.each(['abc', '0'])('id inválido (%s) → NoEncontrado sin llamar a la API', (id) => {
    // Act
    renderizar(<ProductoEditarPage />, {
      ruta: `/consola/productos/${id}`,
      patron: '/consola/productos/:id',
    });

    // Assert
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(productosApi.obtener).not.toHaveBeenCalled();
  });

  it('error del servidor → ErrorState con requestId y Reintentar', async () => {
    // Arrange
    vi.mocked(productosApi.obtener)
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-41'))
      .mockResolvedValueOnce(producto);
    abrir();
    expect(await screen.findByText('Referencia: req-41')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Sudadero con capucha' }),
    ).toBeInTheDocument();
  });

  it('llega desde el alta (state.creado) → muestra el aviso de producto creado', async () => {
    // Act
    renderizar(<ProductoEditarPage />, {
      ruta: '/consola/productos/8',
      patron: '/consola/productos/:id',
      estadoRuta: { creado: true },
    });

    // Assert
    expect(
      await screen.findByText('Producto creado. Puedes completar imágenes y variantes.'),
    ).toBeInTheDocument();
  });

  it('guardar los datos → PUT con nombre y categoría, y avisa', async () => {
    // Arrange
    vi.mocked(productosApi.actualizar).mockResolvedValue({ ...producto, nombre: 'Sudadero nuevo' });
    abrir();
    const nombre = await screen.findByLabelText('Nombre');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Sudadero nuevo');

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    // Assert
    expect(await screen.findByText('Producto actualizado.')).toBeInTheDocument();
    expect(productosApi.actualizar).toHaveBeenCalledWith(8, {
      idCategoria: 1,
      nombre: 'Sudadero nuevo',
    });
  });

  it('desactivar → confirma, envía activo false y avisa', async () => {
    // Arrange
    vi.mocked(productosApi.cambiarEstado).mockResolvedValue({ ...producto, activo: false });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar producto' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    expect(
      await screen.findByText('Producto desactivado: ya no se ve en la tienda.'),
    ).toBeInTheDocument();
    expect(productosApi.cambiarEstado).toHaveBeenCalledWith(8, false);
  });

  it('producto inactivo → activar envía activo true y avisa', async () => {
    // Arrange
    vi.mocked(productosApi.obtener).mockResolvedValue({ ...producto, activo: false });
    vi.mocked(productosApi.cambiarEstado).mockResolvedValue(producto);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Activar producto' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    expect(await screen.findByText('Producto activado.')).toBeInTheDocument();
    expect(productosApi.cambiarEstado).toHaveBeenCalledWith(8, true);
  });

  it('error al cambiar el estado → aviso de error con requestId', async () => {
    // Arrange
    vi.mocked(productosApi.cambiarEstado).mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-42'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar producto' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-42')).toBeInTheDocument();
  });

  it('eliminar un producto sin historial → lo elimina y vuelve a la lista', async () => {
    // Arrange
    vi.mocked(productosApi.obtener).mockResolvedValue({
      ...producto,
      puedeEliminarse: true,
      tieneVentas: false,
    });
    vi.mocked(productosApi.eliminar).mockResolvedValue(undefined);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar producto' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    // Assert
    expect(await screen.findByText('Lista de productos')).toBeInTheDocument();
    expect(productosApi.eliminar).toHaveBeenCalledWith(8);
  });

  it('eliminar con 409 EN_USO → explica el historial de inventario y sugiere desactivar', async () => {
    // Arrange
    vi.mocked(productosApi.eliminar).mockRejectedValue(
      new ApiError(409, 'EN_USO', 'En uso.', [], 'req-43'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar producto' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'historial de inventario o reservas',
    );
  });

  it('eliminar con otro error → mensaje del backend', async () => {
    // Arrange
    vi.mocked(productosApi.eliminar).mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar producto' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
  });

  it('cancelar el diálogo → no llama a la API', async () => {
    // Arrange
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar producto' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(productosApi.eliminar).not.toHaveBeenCalled();
  });

  it('hacer principal una imagen → llama a ordenarImagenes con el orden nuevo y avisa', async () => {
    // Arrange
    vi.mocked(productosApi.obtener).mockResolvedValue({
      ...producto,
      imagenes: [
        { idProductoImagen: 4, url: 'https://img.test/a.jpg', orden: 0, esPrincipal: true },
        { idProductoImagen: 5, url: 'https://img.test/b.jpg', orden: 1, esPrincipal: false },
      ],
    });
    vi.mocked(productosApi.ordenarImagenes).mockResolvedValue(producto);
    abrir();

    // Act
    await userEvent.click(
      await screen.findByRole('button', { name: 'Hacer principal la imagen 2' }),
    );

    // Assert
    expect(await screen.findByText('Orden de imágenes guardado.')).toBeInTheDocument();
    expect(productosApi.ordenarImagenes).toHaveBeenCalledWith(8, [5, 4]);
  });

  it('ordenarImagenes falla → alerta con el mensaje, sin aviso de éxito y vuelve al orden anterior', async () => {
    // Arrange
    vi.mocked(productosApi.obtener).mockResolvedValue({
      ...producto,
      imagenes: [
        { idProductoImagen: 4, url: 'https://img.test/a.jpg', orden: 0, esPrincipal: true },
        { idProductoImagen: 5, url: 'https://img.test/b.jpg', orden: 1, esPrincipal: false },
      ],
    });
    vi.mocked(productosApi.ordenarImagenes).mockRejectedValue(
      new ApiError(400, 'VALIDACION', 'El conjunto de imágenes cambió.'),
    );
    abrir();

    // Act
    await userEvent.click(
      await screen.findByRole('button', { name: 'Hacer principal la imagen 2' }),
    );

    // Assert
    expect(await screen.findByText('El conjunto de imágenes cambió.')).toBeInTheDocument();
    expect(screen.queryByText('Orden de imágenes guardado.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'https://img.test/a.jpg');
  });

  it('quitar una imagen → confirma, llama a quitarImagen y avisa', async () => {
    // Arrange
    vi.mocked(productosApi.quitarImagen).mockResolvedValue(undefined);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: /Quitar imagen 1/ }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar imagen' }),
    );

    // Assert
    expect(await screen.findByText('Imagen eliminada.')).toBeInTheDocument();
    expect(productosApi.quitarImagen).toHaveBeenCalledWith(8, 4);
  });

  it('con categorías que no cargan → ErrorState en la sección de datos', async () => {
    // Arrange
    vi.mocked(categoriasApi.listar).mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla de categorías.', [], 'req-44'),
    );
    abrir();

    // Assert
    expect(await screen.findByText('Referencia: req-44')).toBeInTheDocument();
  });
});
