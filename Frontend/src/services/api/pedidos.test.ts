import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../http';
import { pedidosApi } from './pedidos';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

describe('pedidosApi (consultas y cancelación del Cliente)', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('listar → arma el query con los filtros y omite los vacíos', async () => {
    // Act
    await pedidosApi.listar({ estado: 'PAGADO', page: 2, pageSize: 10, sort: 'fecha:desc', q: '' });

    // Assert
    expect(pedir).toHaveBeenCalledWith(
      '/pedidos?estado=PAGADO&page=2&pageSize=10&sort=fecha%3Adesc',
    );
  });

  it('obtener → GET del detalle', async () => {
    // Act
    await pedidosApi.obtener(1503);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/pedidos/1503');
  });

  it('historial → GET del historial de estados', async () => {
    // Act
    await pedidosApi.historial(1503);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/pedidos/1503/historial');
  });

  it('devoluciones → GET de las devoluciones', async () => {
    // Act
    await pedidosApi.devoluciones(1503);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/pedidos/1503/devoluciones');
  });

  it('cancelar con motivo → POST con el motivo', async () => {
    // Act
    await pedidosApi.cancelar(1503, 'Me equivoqué');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/pedidos/1503/cancelar', {
      method: 'POST',
      body: { motivo: 'Me equivoqué' },
    });
  });

  it('cancelar sin motivo → POST con body vacío', async () => {
    // Act
    await pedidosApi.cancelar(1503);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/pedidos/1503/cancelar', { method: 'POST', body: {} });
  });

  it('estados → GET /pedidos/estados', async () => {
    // Act
    await pedidosApi.estados();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/pedidos/estados');
  });

  it('cambiarEstado con comentario → PATCH con estado y comentario', async () => {
    // Act
    await pedidosApi.cambiarEstado(1503, 'DESPACHADO', 'Salió a las 9');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/pedidos/1503/estado', {
      method: 'PATCH',
      body: { estado: 'DESPACHADO', comentario: 'Salió a las 9' },
    });
  });

  it('cambiarEstado sin comentario → PATCH solo con estado', async () => {
    // Act
    await pedidosApi.cambiarEstado(1503, 'EN_PREPARACION');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/pedidos/1503/estado', {
      method: 'PATCH',
      body: { estado: 'EN_PREPARACION' },
    });
  });

  it('registrarDevolucion → POST con las líneas', async () => {
    // Arrange
    const datos = { motivo: 'Defecto', lineas: [{ idPedidoDetalle: 3021, cantidad: 1 }] };

    // Act
    await pedidosApi.registrarDevolucion(1503, datos as never);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/pedidos/1503/devoluciones', {
      method: 'POST',
      body: datos,
    });
  });
});
