import { describe, expect, it } from 'vitest';
import { agregarItemBody, fusionarBody } from '../../src/modules/carrito/carrito.schemas.js';
import { cuponBody } from '../../src/modules/cupones/cupones.schemas.js';

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

describe('esquema de cupón', () => {
  const base = {
    codigo: 'prueba-10',
    tipoDescuento: 'PORCENTAJE',
    valor: '10',
    fechaInicio: '2026-11-01T00:00:00Z',
    fechaFin: '2026-12-01T00:00:00Z',
    limiteUsosTotal: 10,
  };

  it('aplica los defaults y convierte fechas y montos', () => {
    const resultado = cuponBody.parse(base);
    expect(resultado).toMatchObject({
      valor: 10,
      montoMinimo: 0,
      limiteUsosPorCliente: 1,
      idCategoria: null,
      descripcion: null,
    });
    expect(resultado.fechaInicio).toBeInstanceOf(Date);
  });

  it.each([
    ['porcentaje mayor que 100', { valor: '101' }],
    ['fechas sin zona', { fechaInicio: '2026-11-01T00:00:00' }],
    ['fin anterior al inicio', { fechaFin: '2026-10-01T00:00:00Z' }],
    ['límite por cliente mayor que el total', { limiteUsosPorCliente: 11 }],
    ['código con espacios', { codigo: 'DOS PALABRAS' }],
    ['tipo desconocido', { tipoDescuento: 'REGALO' }],
  ])('rechaza %s', (_nombre, cambio) => {
    expect(cuponBody.safeParse({ ...base, ...cambio }).success).toBe(false);
  });
});
