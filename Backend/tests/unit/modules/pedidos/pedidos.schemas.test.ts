import { describe, expect, it } from 'vitest';
import {
  cambiarEstadoBody,
  devolucionBody,
  listarPedidosQuery,
} from '../../../../src/modules/pedidos/pedidos.schemas.js';

describe('esquemas de pedidos', () => {
  it('cambiarEstadoBody normaliza el código a mayúsculas', () => {
    // Act
    const r = cambiarEstadoBody.parse({ estado: 'despachado', comentario: ' ' });

    // Assert
    expect(r).toEqual({ estado: 'DESPACHADO', comentario: null });
  });

  it.each([
    ['sin líneas', { motivo: 'x', lineas: [] }],
    ['cantidad 0', { motivo: 'x', lineas: [{ idPedidoDetalle: 1, cantidad: 0 }] }],
    ['sin motivo', { motivo: '', lineas: [{ idPedidoDetalle: 1, cantidad: 1 }] }],
  ])('devolucionBody rechaza %s', (_caso, cuerpo) => {
    // Act
    const r = devolucionBody.safeParse(cuerpo);

    // Assert
    expect(r.success).toBe(false);
  });

  it('listarPedidosQuery rechaza desde > hasta y un sort fuera de la lista', () => {
    // Act
    const rango = listarPedidosQuery.safeParse({ desde: '2026-11-02', hasta: '2026-11-01' });
    const orden = listarPedidosQuery.safeParse({ sort: 'cliente:asc' });

    // Assert
    expect(rango.success).toBe(false);
    expect(orden.success).toBe(false);
  });
});
