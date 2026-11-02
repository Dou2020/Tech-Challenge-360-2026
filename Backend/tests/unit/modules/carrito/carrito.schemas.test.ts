import { describe, expect, it } from 'vitest';
import { agregarItemBody, fusionarBody } from '../../../../src/modules/carrito/carrito.schemas.js';

describe('esquemas del carrito', () => {
  it('rechaza cantidades no enteras o menores que 1', () => {
    expect(agregarItemBody.safeParse({ idVariante: 1, cantidad: 0 }).success).toBe(false);
    expect(agregarItemBody.safeParse({ idVariante: 1, cantidad: 1.5 }).success).toBe(false);
    expect(agregarItemBody.safeParse({ idVariante: 1, cantidad: 2 }).success).toBe(true);
  });

  it('fusionar acepta body ausente y exige UUID si viene', () => {
    expect(fusionarBody.safeParse(undefined).success).toBe(true);
    expect(fusionarBody.safeParse({ tokenInvitado: 'no-uuid' }).success).toBe(false);
  });
});
