import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogoApi } from '../../services/api/catalogo';
import { inventarioApi } from '../../services/api/inventario';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { Existencia, MovimientoRegistrado } from '../../types/inventario';
import InventarioPage from './InventarioPage';

vi.mock('../../services/api/inventario', () => ({
  inventarioApi: {
    existencias: vi.fn(),
    registrarEntrada: vi.fn(),
    registrarAjuste: vi.fn(),
  },
}));
vi.mock('../../services/api/catalogo', () => ({ catalogoApi: { categorias: vi.fn() } }));
const api = vi.mocked(inventarioApi);

const existencia: Existencia = {
  idVariante: 41,
  sku: 'CAM-BAS-M-AZ',
  idProducto: 7,
  producto: 'Camiseta básica',
  idCategoria: 2,
  categoria: 'Ropa',
  descripcion: null,
  precio: '149.00',
  existenciaFisica: 9,
  existenciaReservada: 2,
  existenciaDisponible: 4,
  bajoStock: true,
  umbralBajoStock: 5,
  activo: true,
  productoActivo: true,
  categoriaActiva: true,
};

describe('InventarioPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    vi.mocked(catalogoApi.categorias).mockResolvedValue([]);
    api.existencias.mockResolvedValue({ items: [existencia], page: 1, pageSize: 20, total: 1 });
  });

  it('lista existencias con los filtros de la URL y marca el bajo stock', async () => {
    // Arrange / Act
    renderizar(<InventarioPage />, {
      ruta: '/consola/inventario?q=CAM&idCategoria=2&bajoStock=true&activo=true&sort=sku:asc',
    });

    // Assert
    const tabla = await screen.findByRole('table', { name: 'Existencias por variante' });
    expect(api.existencias).toHaveBeenCalledWith({
      q: 'CAM',
      idCategoria: '2',
      bajoStock: 'true',
      activo: 'true',
      sort: 'sku:asc',
      page: 1,
      pageSize: 20,
    });
    expect(within(tabla).getByText('Bajo stock')).toBeInTheDocument();
    expect(within(tabla).getByRole('link', { name: 'Ver kardex de CAM-BAS-M-AZ' })).toHaveAttribute(
      'href',
      '/consola/inventario/41/kardex',
    );
  });

  it('registra un ajuste de salida y refresca las existencias', async () => {
    // Arrange
    api.registrarAjuste.mockResolvedValue({
      ...existencia,
      idMovimientoInventario: 9811,
      existenciaFisica: 6,
      existenciaDisponible: 4,
    } as unknown as MovimientoRegistrado);
    renderizar(<InventarioPage />, { ruta: '/consola/inventario' });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Registrar movimiento de CAM-BAS-M-AZ' }),
    );
    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'Ajuste de salida');
    await userEvent.type(screen.getByLabelText('Cantidad'), '3');
    await userEvent.type(screen.getByLabelText('Motivo'), 'Producto dañado');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    // Assert
    await waitFor(() =>
      expect(api.registrarAjuste).toHaveBeenCalledWith({
        idVariante: 41,
        tipo: 'SALIDA',
        cantidad: 3,
        motivo: 'Producto dañado',
      }),
    );
    await waitFor(() => expect(api.existencias).toHaveBeenCalledTimes(2));
  });

  async function abrirPanel() {
    renderizar(<InventarioPage />, { ruta: '/consola/inventario' });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Registrar movimiento de CAM-BAS-M-AZ' }),
    );
  }

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.existencias.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<InventarioPage />, { ruta: '/consola/inventario' });

    // Assert
    expect(
      screen.getByRole('status', { name: 'Cargando existencias por variante' }),
    ).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar vuelve a pedir las existencias', async () => {
    // Arrange
    api.existencias
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-71'))
      .mockResolvedValueOnce({ items: [existencia], page: 1, pageSize: 20, total: 1 });
    renderizar(<InventarioPage />, { ruta: '/consola/inventario' });
    expect(await screen.findByText('Referencia: req-71')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('CAM-BAS-M-AZ')).toBeInTheDocument();
    expect(api.existencias).toHaveBeenCalledTimes(2);
  });

  it('sin variantes ni filtros → vacío simple', async () => {
    // Arrange
    api.existencias.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    // Act
    renderizar(<InventarioPage />, { ruta: '/consola/inventario' });

    // Assert
    expect(await screen.findByText('Sin variantes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('sin variantes con filtros → vacío con "Limpiar filtros"', async () => {
    // Arrange
    api.existencias.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    // Act
    renderizar(<InventarioPage />, { ruta: '/consola/inventario?q=zzz' });

    // Assert
    expect(await screen.findByText('No hay variantes con esos filtros')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Limpiar filtros' })).toHaveLength(2);
  });

  it('cambiar categoría → idCategoria en la URL y vuelve a la página 1', async () => {
    // Arrange
    vi.mocked(catalogoApi.categorias).mockResolvedValue([
      { idCategoria: 2, nombre: 'Ropa', descripcion: null, cantidadProductos: 3 },
    ]);
    const { router } = renderizar(<InventarioPage />, { ruta: '/consola/inventario?page=3' });
    await screen.findByText('CAM-BAS-M-AZ');
    await screen.findByRole('option', { name: 'Ropa' });

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Ropa');

    // Assert
    expect(router.state.location.search).toBe('?idCategoria=2');
    expect(api.existencias).toHaveBeenLastCalledWith(
      expect.objectContaining({ idCategoria: '2', page: 1 }),
    );
  });

  it('cambiar el filtro de variante activa → activo en la URL', async () => {
    // Arrange
    const { router } = renderizar(<InventarioPage />, { ruta: '/consola/inventario' });
    await screen.findByText('CAM-BAS-M-AZ');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Variante'), 'Inactivas');

    // Assert
    expect(router.state.location.search).toBe('?activo=false');
  });

  it('variante inactiva → la marca en la tabla', async () => {
    // Arrange
    api.existencias.mockResolvedValue({
      items: [{ ...existencia, activo: false, bajoStock: false }],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    // Act
    renderizar(<InventarioPage />, { ruta: '/consola/inventario' });

    // Assert
    expect(await screen.findByText('Variante inactiva')).toBeInTheDocument();
    expect(screen.queryByText('Bajo stock')).not.toBeInTheDocument();
  });

  it('el enlace al kardex lleva el SKU y el producto en el state', async () => {
    // Arrange
    renderizar(<InventarioPage />, {
      ruta: '/consola/inventario',
      rutas: [{ path: '/consola/inventario/:id/kardex', element: <p>Kardex</p> }],
    });

    // Act
    await userEvent.click(await screen.findByRole('link', { name: 'Ver kardex de CAM-BAS-M-AZ' }));

    // Assert
    expect(await screen.findByText('Kardex')).toBeInTheDocument();
  });

  it('entrada por compra sin motivo → manda la entrada sin motivo y avisa con las cifras del backend', async () => {
    // Arrange
    api.registrarEntrada.mockResolvedValue({
      ...existencia,
      existenciaFisica: 14,
      existenciaDisponible: 9,
    } as unknown as MovimientoRegistrado);
    await abrirPanel();
    await userEvent.type(screen.getByLabelText('Cantidad'), '5');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    // Assert
    expect(
      await screen.findByText('Movimiento registrado en CAM-BAS-M-AZ: física 14, disponible 9.'),
    ).toBeInTheDocument();
    expect(api.registrarEntrada).toHaveBeenCalledWith({ idVariante: 41, cantidad: 5 });
  });

  it('un 422 EXISTENCIA_NEGATIVA queda en el campo cantidad del panel', async () => {
    // Arrange
    api.registrarAjuste.mockRejectedValue(
      new ApiError(422, 'EXISTENCIA_NEGATIVA', 'La existencia quedaría negativa.'),
    );
    await abrirPanel();
    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'Ajuste de salida');
    await userEvent.type(screen.getByLabelText('Cantidad'), '50');
    await userEvent.type(screen.getByLabelText('Motivo'), 'Merma');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    // Assert
    expect(await screen.findByLabelText('Cantidad')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/dejaría la existencia en negativo/)).toBeInTheDocument();
  });

  it('Cerrar → oculta el panel sin llamar a la API', async () => {
    // Arrange
    await abrirPanel();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    // Assert
    expect(screen.queryByRole('heading', { name: 'Registrar movimiento' })).not.toBeInTheDocument();
    expect(api.registrarEntrada).not.toHaveBeenCalled();
  });
});
