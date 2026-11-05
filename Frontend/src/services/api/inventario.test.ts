import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../http';
import { inventarioApi } from './inventario';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

describe('inventarioApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('existencias → arma el query con filtros, omite vacíos y conserva false', async () => {
    // Act
    await inventarioApi.existencias({ page: 1, pageSize: 20, activo: false, q: '' });

    // Assert
    expect(pedir).toHaveBeenCalledWith('/inventario/existencias?page=1&pageSize=20&activo=false');
  });

  it('kardex → GET por variante con filtros', async () => {
    // Act
    await inventarioApi.kardex(11, { desde: '2026-11-01', page: 2 });

    // Assert
    expect(pedir).toHaveBeenCalledWith('/inventario/variantes/11/kardex?desde=2026-11-01&page=2');
  });

  it('tiposMovimiento → GET', async () => {
    // Act
    await inventarioApi.tiposMovimiento();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/inventario/tipos-movimiento');
  });

  it('registrarEntrada → POST /inventario/entradas', async () => {
    // Act
    await inventarioApi.registrarEntrada({ idVariante: 11, cantidad: 5, motivo: 'Compra' });

    // Assert
    expect(pedir).toHaveBeenCalledWith('/inventario/entradas', {
      method: 'POST',
      body: { idVariante: 11, cantidad: 5, motivo: 'Compra' },
    });
  });

  it('registrarAjuste → POST /inventario/ajustes', async () => {
    // Act
    await inventarioApi.registrarAjuste({
      idVariante: 11,
      tipo: 'SALIDA',
      cantidad: 2,
      motivo: 'Merma',
    });

    // Assert
    expect(pedir).toHaveBeenCalledWith('/inventario/ajustes', {
      method: 'POST',
      body: { idVariante: 11, tipo: 'SALIDA', cantidad: 2, motivo: 'Merma' },
    });
  });
});
