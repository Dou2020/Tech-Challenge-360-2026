import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inventarioApi } from '../../services/api/inventario';
import { pedidosApi } from '../../services/api/pedidos';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { Existencia } from '../../types/inventario';
import OperacionPage from './OperacionPage';

vi.mock('../../services/api/pedidos', () => ({ pedidosApi: { listar: vi.fn() } }));
vi.mock('../../services/api/inventario', () => ({ inventarioApi: { existencias: vi.fn() } }));
const pedidos = vi.mocked(pedidosApi);
const inventario = vi.mocked(inventarioApi);

const TOTALES: Record<string, number> = { PAGADO: 7, EN_PREPARACION: 3, DESPACHADO: 2 };

const existencia: Existencia = {
  idVariante: 4,
  sku: 'AUD-BT-NEG',
  idProducto: 2,
  producto: 'Audífonos Bluetooth',
  idCategoria: 1,
  categoria: 'Electrónica',
  descripcion: null,
  precio: '299.00',
  existenciaFisica: 1,
  existenciaReservada: 0,
  existenciaDisponible: 1,
  bajoStock: true,
  umbralBajoStock: 5,
  activo: true,
  productoActivo: true,
  categoriaActiva: true,
};

function paginaPedidos(total: number) {
  return { items: [], page: 1, pageSize: 1, total };
}

function montar() {
  return renderizar(<OperacionPage />, { ruta: '/consola/operacion' });
}

describe('OperacionPage', () => {
  beforeEach(() => {
    pedidos.listar
      .mockReset()
      .mockImplementation((params) =>
        Promise.resolve(paginaPedidos(TOTALES[String(params.estado)] ?? 0)),
      );
    inventario.existencias
      .mockReset()
      .mockResolvedValue({ items: [existencia], page: 1, pageSize: 5, total: 9 });
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    pedidos.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    montar();

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando panel de operación' })).toBeInTheDocument();
  });

  it('pide un total por estado de la cola y las 5 variantes con menos disponible', async () => {
    // Act
    montar();

    // Assert
    await screen.findByText('Por preparar');
    expect(pedidos.listar).toHaveBeenCalledTimes(3);
    for (const estado of ['PAGADO', 'EN_PREPARACION', 'DESPACHADO']) {
      expect(pedidos.listar).toHaveBeenCalledWith({ estado, page: 1, pageSize: 1 });
    }
    expect(inventario.existencias).toHaveBeenCalledWith({
      bajoStock: 'true',
      activo: 'true',
      sort: 'existenciaDisponible:asc',
      page: 1,
      pageSize: 5,
    });
  });

  it.each([
    ['Por preparar', '7', 'PAGADO'],
    ['Por despachar', '3', 'EN_PREPARACION'],
    ['Por entregar', '2', 'DESPACHADO'],
  ])(
    'tarjeta %s → muestra el total y enlaza a la lista filtrada',
    async (titulo, total, estado) => {
      // Act
      montar();

      // Assert
      const tarjeta = (await screen.findByText(titulo)).parentElement!;
      expect(within(tarjeta).getByText(total)).toBeInTheDocument();
      expect(within(tarjeta).getByRole('link', { name: 'Ver pedidos' })).toHaveAttribute(
        'href',
        `/consola/pedidos?estado=${estado}`,
      );
    },
  );

  it('bajo stock → total, tabla con enlace al kardex y "Ver todas" al inventario filtrado', async () => {
    // Act
    montar();

    // Assert
    const tarjeta = (await screen.findByText('Bajo stock')).parentElement!;
    expect(within(tarjeta).getByText('9')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('link', { name: 'Ver inventario' })).toHaveAttribute(
      'href',
      '/consola/inventario?bajoStock=true&activo=true',
    );
    const tabla = screen.getByRole('table', { name: 'Variantes por agotarse' });
    const fila = within(tabla).getByRole('row', { name: /AUD-BT-NEG/ });
    expect(within(fila).getByText('Audífonos Bluetooth')).toBeInTheDocument();
    expect(within(fila).getByRole('cell', { name: '1' })).toBeInTheDocument();
    expect(within(fila).getByRole('cell', { name: '5' })).toBeInTheDocument();
    expect(within(fila).getByRole('link', { name: 'Ver kardex de AUD-BT-NEG' })).toHaveAttribute(
      'href',
      '/consola/inventario/4/kardex',
    );
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute(
      'href',
      '/consola/inventario?bajoStock=true&activo=true',
    );
  });

  it('variante agotada con descripción → muestra la descripción y el badge Agotado', async () => {
    // Arrange
    inventario.existencias.mockResolvedValue({
      items: [
        { ...existencia, descripcion: 'Color negro', existenciaFisica: 0, existenciaDisponible: 0 },
        { ...existencia, idVariante: 5, sku: 'AUD-BT-BLA' },
      ],
      page: 1,
      pageSize: 5,
      total: 2,
    });

    // Act
    montar();

    // Assert
    const tabla = await screen.findByRole('table', { name: 'Variantes por agotarse' });
    const agotada = within(tabla).getByRole('row', { name: /AUD-BT-NEG/ });
    expect(within(agotada).getByText('Color negro')).toBeInTheDocument();
    expect(within(agotada).getByText('Agotado')).toBeInTheDocument();
    const otra = within(tabla).getByRole('row', { name: /AUD-BT-BLA/ });
    expect(within(otra).queryByText('Agotado')).not.toBeInTheDocument();
  });

  it('sin variantes en bajo stock → estado vacío y total 0', async () => {
    // Arrange
    inventario.existencias.mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });

    // Act
    montar();

    // Assert
    expect(await screen.findByText('Ninguna variante en bajo stock')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const tarjeta = screen.getByText('Bajo stock').parentElement!;
    expect(within(tarjeta).getByText('0')).toBeInTheDocument();
  });

  it('falla un total de pedidos → error con referencia', async () => {
    // Arrange
    pedidos.listar.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falló el servidor.', undefined, 'req-9'),
    );

    // Act
    montar();

    // Assert
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Falló el servidor.');
    expect(alerta).toHaveTextContent('req-9');
  });

  it('falla el inventario → Reintentar vuelve a pedir y muestra el panel', async () => {
    // Arrange
    inventario.existencias.mockRejectedValueOnce(
      new ApiError(500, 'ERROR_INTERNO', 'Falló el servidor.'),
    );
    montar();
    await screen.findByRole('alert');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(
      await screen.findByRole('table', { name: 'Variantes por agotarse' }),
    ).toBeInTheDocument();
    expect(inventario.existencias).toHaveBeenCalledTimes(2);
  });
});
