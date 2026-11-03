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

  it('con FormData lo envía sin cambios y sin Content-Type (lo fija el navegador)', async () => {
    fetchFalso.mockResolvedValue(json(201, { ok: true }));
    const formulario = new FormData();
    formulario.append('orden', '0');

    await request('/productos/1/imagenes/archivo', { method: 'POST', body: formulario });

    const [, init] = fetchFalso.mock.calls[0]!;
    expect(init?.body).toBe(formulario);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
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

  it('error sin cuerpo del backend → ApiError ERROR_HTTP con el status', async () => {
    // Arrange
    fetchFalso.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));

    // Act & Assert
    await expect(request('/pedidos')).rejects.toMatchObject({
      status: 502,
      code: 'ERROR_HTTP',
      message: 'La solicitud falló (HTTP 502).',
    });
  });

  it('respuesta 204 → devuelve undefined', async () => {
    // Arrange
    fetchFalso.mockResolvedValue(new Response(null, { status: 204 }));

    // Act
    const resultado = await request<void>('/direcciones/5', { method: 'DELETE' });

    // Assert
    expect(resultado).toBeUndefined();
  });

  it('body y headers propios → serializa el JSON y conserva X-Cart-Token e Idempotency-Key', async () => {
    // Arrange
    fetchFalso.mockResolvedValue(json(200, {}));

    // Act
    await request('/carrito/items', {
      method: 'POST',
      body: { idVariante: 41, cantidad: 2 },
      headers: { 'X-Cart-Token': 'tok-1', 'Idempotency-Key': 'clave-1' },
    });

    // Assert
    const [, init] = fetchFalso.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(init?.body).toBe(JSON.stringify({ idVariante: 41, cantidad: 2 }));
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Cart-Token')).toBe('tok-1');
    expect(headers.get('Idempotency-Key')).toBe('clave-1');
  });

  it('sin token en memoria → no envía Authorization', async () => {
    // Arrange
    fetchFalso.mockResolvedValue(json(200, {}));

    // Act
    await request('/catalogo/categorias');

    // Assert
    const [, init] = fetchFalso.mock.calls[0]!;
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('el refresh falla por red → avisa que la sesión expiró y lanza el 401', async () => {
    // Arrange
    tokenStore.set('vencido');
    const alExpirar = vi.fn();
    const desuscribir = tokenStore.onSesionExpirada(alExpirar);
    fetchFalso.mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/refresh')) throw new TypeError('Failed to fetch');
      return json(401, errorBackend('TOKEN_EXPIRADO', 'El token expiró.'));
    });

    // Act & Assert
    await expect(request('/pedidos')).rejects.toMatchObject({ status: 401 });
    expect(alExpirar).toHaveBeenCalledOnce();
    desuscribir();
  });

  it('tras un refresh fallido → la siguiente renovación vuelve a intentarse', async () => {
    // Arrange
    tokenStore.set('vencido');
    let intentos = 0;
    fetchFalso.mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        intentos += 1;
        return intentos === 1
          ? json(401, errorBackend('REFRESH_INVALIDO', 'Sesión inválida.'))
          : json(200, { accessToken: 'nuevo', expiraEn: 900 });
      }
      return new Headers(fetchFalso.mock.calls.at(-1)?.[1]?.headers).get('Authorization') ===
        'Bearer nuevo'
        ? json(200, { ok: true })
        : json(401, errorBackend('TOKEN_EXPIRADO', 'El token expiró.'));
    });
    await expect(request('/pedidos')).rejects.toMatchObject({ status: 401 });
    tokenStore.set('vencido');

    // Act
    const resultado = await request('/pedidos');

    // Assert
    expect(intentos).toBe(2);
    expect(resultado).toEqual({ ok: true });
  });
});
