import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../http';
import { perfilApi } from './perfil';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

describe('perfilApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('obtener → GET /perfil', async () => {
    // Act
    await perfilApi.obtener();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/perfil');
  });

  it('actualizar → PUT con nombre, apellido y teléfono', async () => {
    // Arrange
    const datos = { nombre: 'Ana', apellido: 'López', telefono: '5555-1234' };

    // Act
    await perfilApi.actualizar(datos);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/perfil', { method: 'PUT', body: datos });
  });

  it('cambiarContrasena → PUT /perfil/contrasena', async () => {
    // Arrange
    const datos = { contrasenaActual: 'Vieja#2026', contrasenaNueva: 'Nueva#2026' };

    // Act
    await perfilApi.cambiarContrasena(datos);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/perfil/contrasena', { method: 'PUT', body: datos });
  });
});
