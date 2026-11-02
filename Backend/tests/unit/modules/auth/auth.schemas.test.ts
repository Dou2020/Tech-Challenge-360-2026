import { describe, expect, it } from 'vitest';
import {
  establecerContrasenaSchema,
  loginSchema,
  olvidoSchema,
  registroSchema,
  verificarTokenSchema,
} from '../../../../src/modules/auth/auth.schemas.js';

describe('esquemas de auth', () => {
  it('normaliza el correo (espacios y mayúsculas) para que la clave de intentos sea una sola', () => {
    const datos = loginSchema.parse({ correo: '  Ana@ShopCart.GT ', contrasena: 'x' });

    expect(datos.correo).toBe('ana@shopcart.gt');
  });

  it('el registro no lleva contraseña: si viene, se descarta', () => {
    const resultado = registroSchema.parse({
      correo: 'ana@shopcart.gt',
      contrasena: 'Segura2026',
      nombre: 'Ana',
      apellido: 'López',
    });

    expect(resultado).toEqual({
      correo: 'ana@shopcart.gt',
      nombre: 'Ana',
      apellido: 'López',
      telefono: null,
    });
  });

  it('el teléfono es opcional y, si viene, debe tener formato válido', () => {
    const base = { correo: 'ana@shopcart.gt', nombre: 'Ana', apellido: 'López' };

    expect(registroSchema.parse({ ...base, telefono: '' }).telefono).toBeNull();
    expect(registroSchema.parse({ ...base, telefono: '+502 5555-1234' }).telefono).toBe(
      '+502 5555-1234',
    );
    expect(registroSchema.safeParse({ ...base, telefono: 'abc' }).success).toBe(false);
  });

  it('olvido normaliza el correo y exige uno válido', () => {
    expect(olvidoSchema.parse({ correo: ' Ana@ShopCart.GT ' }).correo).toBe('ana@shopcart.gt');
    expect(olvidoSchema.safeParse({ correo: 'no-es-correo' }).success).toBe(false);
  });

  it('verificar exige un token no vacío', () => {
    expect(verificarTokenSchema.safeParse({ token: ' abc ' }).data?.token).toBe('abc');
    expect(verificarTokenSchema.safeParse({ token: '' }).success).toBe(false);
    expect(verificarTokenSchema.safeParse({}).success).toBe(false);
  });

  it('establecer exige contraseña de 8+ caracteres con letra y número', () => {
    const base = { token: 'abc' };

    expect(establecerContrasenaSchema.safeParse({ ...base, contrasena: 'corta1' }).success).toBe(
      false,
    );
    expect(
      establecerContrasenaSchema.safeParse({ ...base, contrasena: 'sinnumeros' }).success,
    ).toBe(false);
    expect(establecerContrasenaSchema.safeParse({ ...base, contrasena: '12345678' }).success).toBe(
      false,
    );
    expect(
      establecerContrasenaSchema.safeParse({ ...base, contrasena: 'Segura2026' }).success,
    ).toBe(true);
  });
});
