import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from '../auth/tokenStore';
import { ApiError, request } from './http';

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const errorBackend = (code: string, message: string) => ({
  error: { code, message },
  requestId: 'req-1',
});

describe('request', () => {
  const fetchFalso = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchFalso);
    tokenStore.clear();
  });

  afterEach(() => {
    fetchFalso.mockReset();
    vi.unstubAllGlobals();
  });

  it('envía el access token y devuelve el JSON', async () => {
    tokenStore.set('token-1');
    fetchFalso.mockResolvedValue(json(200, { status: 'ok' }));

    await expect(request('/health')).resolves.toEqual({ status: 'ok' });

    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url).toBe('/api/health');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1');
    expect(init?.credentials).toBe('include');
  });

  it('convierte la respuesta de error del backend en ApiError', async () => {
    fetchFalso.mockResolvedValue(
      json(409, {
        error: {
          code: 'STOCK_INSUFICIENTE',
          message: 'Solo hay 1 unidad disponible.',
          details: [{ field: 'cantidad', message: 'Disponible: 1' }],
        },
        requestId: 'abc-123',
      }),
    );

    const error = await request('/carrito/items').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'STOCK_INSUFICIENTE',
      message: 'Solo hay 1 unidad disponible.',
      details: [{ field: 'cantidad', message: 'Disponible: 1' }],
      requestId: 'abc-123',
    });
  });

  it('ante dos 401 simultáneos renueva la sesión una sola vez y reintenta ambas', async () => {
    tokenStore.set('vencido');
    fetchFalso.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/refresh')) {
        return json(200, { accessToken: 'nuevo', expiraEn: 900 });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer nuevo'
        ? json(200, { ruta: String(url) })
        : json(401, errorBackend('TOKEN_EXPIRADO', 'El token expiró.'));
    });

    const [a, b] = await Promise.all([request('/pedidos'), request('/direcciones')]);

    expect(a).toEqual({ ruta: '/api/pedidos' });
    expect(b).toEqual({ ruta: '/api/direcciones' });
    const renovaciones = fetchFalso.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/refresh'),
    );
    expect(renovaciones).toHaveLength(1);
    expect(tokenStore.get()).toBe('nuevo');
  });

  it('si la sesión no se puede renovar, avisa que expiró y lanza el 401', async () => {
    tokenStore.set('vencido');
    const alExpirar = vi.fn();
    const desuscribir = tokenStore.onSesionExpirada(alExpirar);
    fetchFalso.mockImplementation(async (url) =>
      String(url).endsWith('/auth/refresh')
        ? json(401, errorBackend('REFRESH_INVALIDO', 'Sesión inválida.'))
        : json(401, errorBackend('TOKEN_EXPIRADO', 'El token expiró.')),
    );

    await expect(request('/pedidos')).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_EXPIRADO',
    });
    expect(alExpirar).toHaveBeenCalledOnce();
    expect(tokenStore.get()).toBeNull();
    desuscribir();
  });

  it('no intenta renovar cuando se indica sinRenovar (login)', async () => {
    fetchFalso.mockResolvedValue(
      json(401, errorBackend('CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.')),
    );

    await expect(
      request('/auth/login', { method: 'POST', sinRenovar: true }),
    ).rejects.toMatchObject({
      code: 'CREDENCIALES_INVALIDAS',
    });
    expect(fetchFalso).toHaveBeenCalledOnce();
  });

  it('devuelve como datos los status indicados en estadosValidos', async () => {
    fetchFalso.mockResolvedValue(json(503, { status: 'caido', sqlServer: 'down', redis: 'up' }));

    await expect(request('/health', { estadosValidos: [503] })).resolves.toMatchObject({
      status: 'caido',
    });
  });

  it('un fallo de red se convierte en ApiError SIN_CONEXION', async () => {
    fetchFalso.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(request('/health')).rejects.toMatchObject({ status: 0, code: 'SIN_CONEXION' });
  });
});
