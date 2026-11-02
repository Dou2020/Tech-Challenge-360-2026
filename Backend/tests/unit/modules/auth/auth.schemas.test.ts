import { describe, expect, it } from 'vitest';
import { loginSchema, registroSchema } from '../../../../src/modules/auth/auth.schemas.js';

describe('esquemas de auth', () => {
  it('normaliza el correo (espacios y mayúsculas) para que la clave de intentos sea una sola', () => {
    const datos = loginSchema.parse({ correo: '  Ana@ShopCart.GT ', contrasena: 'x' });

    expect(datos.correo).toBe('ana@shopcart.gt');
  });

  it('el registro exige contraseña de 8+ caracteres con letra y número', () => {
    const base = { correo: 'ana@shopcart.gt', nombre: 'Ana', apellido: 'López' };

    expect(registroSchema.safeParse({ ...base, contrasena: 'corta1' }).success).toBe(false);
    expect(registroSchema.safeParse({ ...base, contrasena: 'sinnumeros' }).success).toBe(false);
    expect(registroSchema.safeParse({ ...base, contrasena: '12345678' }).success).toBe(false);
    expect(registroSchema.parse({ ...base, contrasena: 'Segura2026' })).toMatchObject({
      telefono: null,
    });
  });

  it('el teléfono es opcional y, si viene, debe tener formato válido', () => {
    const base = {
      correo: 'ana@shopcart.gt',
      contrasena: 'Segura2026',
      nombre: 'Ana',
      apellido: 'López',
    };

    expect(registroSchema.parse({ ...base, telefono: '' }).telefono).toBeNull();
    expect(registroSchema.parse({ ...base, telefono: '+502 5555-1234' }).telefono).toBe(
      '+502 5555-1234',
    );
    expect(registroSchema.safeParse({ ...base, telefono: 'abc' }).success).toBe(false);
  });
});
