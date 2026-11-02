import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * src/config/env.ts valida process.env al importarse y llama a process.exit(1) si algo falla.
 * Cada caso reinicia los módulos, ajusta el entorno y vuelve a importarlo.
 */

class SalidaDelProceso extends Error {}

let salida: ReturnType<typeof vi.spyOn>;
let errores: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  salida = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new SalidaDelProceso();
  });
  errores = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const cargarEnv = () => import('../../../src/config/env.js');

describe('CORREO_TRANSPORTE', () => {
  it.each([
    ['SMTP_HOST', { SMTP_HOST: '', CORREO_REMITENTE: 'ShopCart <no-responder@shopcart.gt>' }],
    ['CORREO_REMITENTE', { SMTP_HOST: 'localhost', CORREO_REMITENTE: '' }],
  ])('smtp sin %s → falla la validación y termina el proceso', async (faltante, valores) => {
    // Arrange
    vi.stubEnv('CORREO_TRANSPORTE', 'smtp');
    for (const [nombre, valor] of Object.entries(valores)) vi.stubEnv(nombre, valor);

    // Act & Assert
    await expect(cargarEnv()).rejects.toBeInstanceOf(SalidaDelProceso);
    expect(salida).toHaveBeenCalledWith(1);
    expect(String(errores.mock.calls[0]?.[0])).toContain(faltante);
  });

  it('smtp sin ninguna de las dos variables menciona ambas', async () => {
    // Arrange
    vi.stubEnv('CORREO_TRANSPORTE', 'smtp');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('CORREO_REMITENTE', '');

    // Act & Assert
    await expect(cargarEnv()).rejects.toBeInstanceOf(SalidaDelProceso);
    const mensaje = String(errores.mock.calls[0]?.[0]);
    expect(mensaje).toContain('SMTP_HOST');
    expect(mensaje).toContain('CORREO_REMITENTE');
  });

  it('smtp con host y remitente carga con los valores por defecto del puerto', async () => {
    // Arrange
    vi.stubEnv('CORREO_TRANSPORTE', 'smtp');
    vi.stubEnv('SMTP_HOST', 'localhost');
    vi.stubEnv('CORREO_REMITENTE', 'ShopCart <no-responder@shopcart.gt>');

    // Act
    const { env } = await cargarEnv();

    // Assert
    expect(salida).not.toHaveBeenCalled();
    expect(env).toMatchObject({
      CORREO_TRANSPORTE: 'smtp',
      SMTP_HOST: 'localhost',
      SMTP_PORT: 587,
    });
  });

  it('memoria no exige SMTP_HOST ni CORREO_REMITENTE', async () => {
    // Arrange
    vi.stubEnv('CORREO_TRANSPORTE', 'memoria');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('CORREO_REMITENTE', '');

    // Act
    const { env } = await cargarEnv();

    // Assert
    expect(salida).not.toHaveBeenCalled();
    expect(env.CORREO_TRANSPORTE).toBe('memoria');
    expect(env.SMTP_HOST).toBeUndefined();
  });

  it('un transporte desconocido falla la validación', async () => {
    // Arrange
    vi.stubEnv('CORREO_TRANSPORTE', 'sendgrid');

    // Act & Assert
    await expect(cargarEnv()).rejects.toBeInstanceOf(SalidaDelProceso);
    expect(String(errores.mock.calls[0]?.[0])).toContain('CORREO_TRANSPORTE');
  });
});

describe('variables de contraseñas y enlaces', () => {
  it('APP_URL_PUBLICA pierde las barras finales y los tokens tienen sus vigencias por defecto', async () => {
    // Arrange
    vi.stubEnv('APP_URL_PUBLICA', 'https://tienda.shopcart.gt///');

    // Act
    const { env } = await cargarEnv();

    // Assert
    expect(env).toMatchObject({
      APP_URL_PUBLICA: 'https://tienda.shopcart.gt',
      TOKEN_CREAR_HORAS: 72,
      TOKEN_RESTABLECER_MIN: 60,
      RATE_LIMIT_CONTRASENA_MAX: 10,
    });
  });

  it.each(['-1', 'abc', '1.5'])(
    'RATE_LIMIT_CONTRASENA_MAX = "%s" falla la validación',
    async (valor) => {
      // Arrange
      vi.stubEnv('RATE_LIMIT_CONTRASENA_MAX', valor);

      // Act & Assert
      await expect(cargarEnv()).rejects.toBeInstanceOf(SalidaDelProceso);
      expect(String(errores.mock.calls[0]?.[0])).toContain('RATE_LIMIT_CONTRASENA_MAX');
    },
  );

  it('RATE_LIMIT_CONTRASENA_MAX = 0 es válido (desactiva el límite)', async () => {
    // Arrange
    vi.stubEnv('RATE_LIMIT_CONTRASENA_MAX', '0');

    // Act
    const { env } = await cargarEnv();

    // Assert
    expect(env.RATE_LIMIT_CONTRASENA_MAX).toBe(0);
  });
});
