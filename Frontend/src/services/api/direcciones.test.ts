import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatosDireccion } from '../../types/direcciones';
import { request } from '../http';
import { direccionesApi } from './direcciones';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

const datos: DatosDireccion = {
  alias: 'Casa',
  nombreDestinatario: 'Ana López',
  telefono: '5555-1234',
  linea1: '5a avenida 10-20',
  municipio: 'Mixco',
  departamento: 'Guatemala',
};

describe('direccionesApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('listar → GET /direcciones', async () => {
    // Act
    await direccionesApi.listar();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/direcciones');
  });

  it('obtener → GET por id', async () => {
    // Act
    await direccionesApi.obtener(5);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/direcciones/5');
  });

  it('crear → POST con los datos', async () => {
    // Act
    await direccionesApi.crear(datos);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/direcciones', { method: 'POST', body: datos });
  });

  it('actualizar → PUT por id con los datos', async () => {
    // Act
    await direccionesApi.actualizar(5, datos);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/direcciones/5', { method: 'PUT', body: datos });
  });

  it('desactivar → DELETE por id', async () => {
    // Act
    await direccionesApi.desactivar(5);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/direcciones/5', { method: 'DELETE' });
  });
});
