import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatosTarjeta } from '../../types/tarjetas';
import { request } from '../http';
import { tarjetasApi } from './tarjetas';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

const datos: DatosTarjeta = {
  titular: 'Ana López',
  ultimos4: '4242',
  tipo: 'CREDITO',
  marca: 'VISA',
  predeterminada: true,
};

describe('tarjetasApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('listar → GET /tarjetas', async () => {
    // Act
    await tarjetasApi.listar();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/tarjetas');
  });

  it('crear → POST /tarjetas con los datos', async () => {
    // Act
    await tarjetasApi.crear(datos);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/tarjetas', { method: 'POST', body: datos });
  });

  it('marcarPredeterminada → PATCH /tarjetas/:id/predeterminada', async () => {
    // Act
    await tarjetasApi.marcarPredeterminada(4);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/tarjetas/4/predeterminada', { method: 'PATCH' });
  });

  it('eliminar → DELETE /tarjetas/:id', async () => {
    // Act
    await tarjetasApi.eliminar(4);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/tarjetas/4', { method: 'DELETE' });
  });
});
