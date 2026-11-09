import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatosSucursal } from '../../types/sucursales';
import { request } from '../http';
import { sucursalesApi, sucursalesPublicasApi } from './sucursales';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

const datos: DatosSucursal = {
  nombre: 'Zona 10',
  telefono: '22334455',
  linea1: '6a avenida 12-34',
  municipio: 'Guatemala',
  departamento: 'Guatemala',
};

describe('sucursalesPublicasApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('listar → GET /catalogo/sucursales', async () => {
    // Act
    await sucursalesPublicasApi.listar();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/catalogo/sucursales');
  });
});

describe('sucursalesApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('listar → GET /sucursales con filtros, orden y paginación en la query', async () => {
    // Act
    await sucursalesApi.listar({
      q: 'zona',
      activo: 'true',
      sort: 'nombre:asc',
      page: 2,
      pageSize: 20,
    });

    // Assert
    const ruta = pedir.mock.calls[0]?.[0] as string;
    const [camino, query] = ruta.split('?');
    expect(camino).toBe('/sucursales');
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      q: 'zona',
      activo: 'true',
      sort: 'nombre:asc',
      page: '2',
      pageSize: '20',
    });
  });

  it('obtener → GET por id', async () => {
    // Act
    await sucursalesApi.obtener(3);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/sucursales/3');
  });

  it('crear → POST con los datos', async () => {
    // Act
    await sucursalesApi.crear(datos);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/sucursales', { method: 'POST', body: datos });
  });

  it('actualizar → PUT por id con los datos', async () => {
    // Act
    await sucursalesApi.actualizar(3, datos);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/sucursales/3', { method: 'PUT', body: datos });
  });

  it('cambiarEstado → PATCH /estado con { activo }', async () => {
    // Act
    await sucursalesApi.cambiarEstado(3, false);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/sucursales/3/estado', {
      method: 'PATCH',
      body: { activo: false },
    });
  });

  it('eliminar → DELETE por id', async () => {
    // Act
    await sucursalesApi.eliminar(3);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/sucursales/3', { method: 'DELETE' });
  });
});
