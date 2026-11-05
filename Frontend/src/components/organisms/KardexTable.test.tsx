import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inventarioApi } from '../../services/api/inventario';
import { userEvent } from '@testing-library/user-event';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import { KardexTable } from './KardexTable';

vi.mock('../../services/api/inventario', () => ({
  inventarioApi: { kardex: vi.fn(), tiposMovimiento: vi.fn() },
}));
const api = vi.mocked(inventarioApi);

describe('KardexTable', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.tiposMovimiento.mockResolvedValue([
      {
        idTipoMovimientoInventario: 5,
        codigo: 'AJUSTE_SALIDA',
        nombre: 'Ajuste de salida',
        signo: -1,
      },
    ]);
  });

  it('pide el kardex con desde, hasta, tipo, orden y página de la URL', async () => {
    // Arrange
    api.kardex.mockResolvedValue({
      items: [
        {
          idMovimientoInventario: 9811,
          idVariante: 41,
          fecha: '2026-11-03T15:30:00.000Z',
          codigoTipoMovimiento: 'AJUSTE_SALIDA',
          nombreTipoMovimiento: 'Ajuste de salida',
          signo: -1,
          cantidad: 3,
          existenciaAnterior: 9,
          existenciaNueva: 6,
          motivo: 'Producto dañado en bodega',
          idUsuario: 2,
          usuario: 'Óscar Operador',
          idPedido: null,
          numeroPedido: null,
          idDevolucion: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    // Act
    renderizar(<KardexTable idVariante={41} />, {
      ruta: '/consola/inventario/41/kardex?desde=2026-11-01&hasta=2026-11-30&tipo=AJUSTE_SALIDA',
    });

    // Assert
    expect(await screen.findByText('Producto dañado en bodega')).toBeInTheDocument();
    expect(api.kardex).toHaveBeenCalledWith(41, {
      desde: '2026-11-01',
      hasta: '2026-11-30',
      tipo: 'AJUSTE_SALIDA',
      sort: 'fecha:desc',
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByText('3/11/2026, 9:30 a. m.')).toBeInTheDocument();
  });

  it('movimiento ligado a un pedido → enlaza a su gestión', async () => {
    // Arrange
    api.kardex.mockResolvedValue({ items: [MOV], page: 1, pageSize: 20, total: 1 });

    // Act
    renderizar(<KardexTable idVariante={41} />, { ruta: '/k' });

    // Assert
    expect(await screen.findByRole('link', { name: 'SC-2026-001503' })).toHaveAttribute(
      'href',
      '/consola/pedidos/1503',
    );
    expect(screen.getByText('−2')).toBeInTheDocument();
  });

  it('rango invertido → muestra el error y no manda las fechas', async () => {
    // Arrange
    api.kardex.mockResolvedValue({ items: [MOV], page: 1, pageSize: 20, total: 1 });

    // Act
    renderizar(<KardexTable idVariante={41} />, { ruta: '/k?desde=2026-11-30&hasta=2026-11-01' });

    // Assert
    expect(
      await screen.findByText('Debe ser igual o posterior a la fecha inicial.'),
    ).toBeInTheDocument();
    expect(api.kardex).toHaveBeenCalledWith(41, { sort: 'fecha:desc', page: 1, pageSize: 20 });
  });

  it('cambiar el tipo → tipo en la URL y vuelve a la página 1', async () => {
    // Arrange
    api.kardex.mockResolvedValue({ items: [MOV], page: 2, pageSize: 20, total: 40 });
    const { router } = renderizar(<KardexTable idVariante={41} />, { ruta: '/k?page=2' });
    await screen.findByRole('link', { name: 'SC-2026-001503' });
    await screen.findByRole('option', { name: 'Ajuste de salida' });

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'Ajuste de salida');

    // Assert
    expect(router.state.location.search).toBe('?tipo=AJUSTE_SALIDA');
    expect(api.kardex).toHaveBeenLastCalledWith(
      41,
      expect.objectContaining({ tipo: 'AJUSTE_SALIDA', page: 1 }),
    );
  });

  it('Limpiar filtros → quita los filtros de la URL', async () => {
    // Arrange
    api.kardex.mockResolvedValue({ items: [MOV], page: 1, pageSize: 20, total: 1 });
    const { router } = renderizar(<KardexTable idVariante={41} />, { ruta: '/k?tipo=VENTA' });
    await screen.findByRole('link', { name: 'SC-2026-001503' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    // Assert
    expect(router.state.location.search).toBe('');
  });

  it('sin movimientos con filtros → el vacío lo dice', async () => {
    // Arrange
    api.kardex.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    // Act
    renderizar(<KardexTable idVariante={41} />, { ruta: '/k?tipo=VENTA' });

    // Assert
    expect(await screen.findByText('No hay movimientos con esos filtros')).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar vuelve a pedir el kardex', async () => {
    // Arrange
    api.kardex
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-2'))
      .mockResolvedValueOnce({ items: [MOV], page: 1, pageSize: 20, total: 1 });
    renderizar(<KardexTable idVariante={41} />, { ruta: '/k' });
    expect(await screen.findByText('Referencia: req-2')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByRole('link', { name: 'SC-2026-001503' })).toBeInTheDocument();
    expect(api.kardex).toHaveBeenCalledTimes(2);
  });
});

const MOV = {
  idMovimientoInventario: 9812,
  idVariante: 41,
  fecha: '2026-11-03T16:30:00.000Z',
  codigoTipoMovimiento: 'VENTA',
  nombreTipoMovimiento: 'Venta',
  signo: -1,
  cantidad: 2,
  existenciaAnterior: 8,
  existenciaNueva: 6,
  motivo: 'Pedido pagado',
  idUsuario: 6,
  usuario: 'Ana López',
  idPedido: 1503,
  numeroPedido: 'SC-2026-001503',
  idDevolucion: null,
};
