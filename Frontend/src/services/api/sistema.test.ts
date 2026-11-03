import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../http';
import { sistemaApi } from './sistema';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

describe('sistemaApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('obtenerEstado → GET /health aceptando el 503 como dato', async () => {
    // Act
    await sistemaApi.obtenerEstado();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/health', { estadosValidos: [503] });
  });
});
