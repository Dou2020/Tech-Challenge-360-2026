import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ResultadoSp } from '../../../../src/db/executeSp.js';
import {
  camposPaginacion,
  parametrosPaginacion,
  respuestaPaginada,
} from '../../../../src/shared/utils/paginacion.js';

describe('camposPaginacion', () => {
  const esquema = z.object({
    q: z.string().optional(),
    ...camposPaginacion(['precio', 'nombre'], 'nombre:asc'),
  });

  it('aplica los valores por defecto y convierte page y pageSize', () => {
    expect(esquema.parse({})).toEqual({ page: 1, pageSize: 20, sort: 'nombre:asc' });
    expect(esquema.parse({ page: '3', pageSize: '50', sort: 'precio:desc' })).toEqual({
      page: 3,
      pageSize: 50,
      sort: 'precio:desc',
    });
  });

  it('rechaza pageSize mayor que 100, page 0 y campos de orden fuera de la lista', () => {
    expect(esquema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(esquema.safeParse({ page: '0' }).success).toBe(false);
    expect(esquema.safeParse({ sort: 'IDProducto:asc' }).success).toBe(false);
    expect(esquema.safeParse({ sort: 'precio' }).success).toBe(false);
    expect(esquema.safeParse({ sort: 'precio:asc; DROP TABLE Pedido' }).success).toBe(false);
  });
});

describe('parametrosPaginacion y respuestaPaginada', () => {
  const paginacion = { page: 2, pageSize: 10, sort: 'nombre:asc' };

  it('arma los parámetros @Pagina, @TamanoPagina y @Orden', () => {
    expect(
      parametrosPaginacion(paginacion).map(({ nombre, valor }) => ({ nombre, valor })),
    ).toEqual([
      { nombre: 'Pagina', valor: 2 },
      { nombre: 'TamanoPagina', valor: 10 },
      { nombre: 'Orden', valor: 'nombre:asc' },
    ]);
  });

  it('lee las filas del primer result set y el total del segundo', () => {
    const filas = [{ Nombre: 'Camisa' }, { Nombre: 'Pantalón' }];
    const resultado: ResultadoSp<{ Nombre: string }> = {
      filas,
      resultSets: [filas, [{ Total: 12 }]],
      returnValue: 0,
    };

    expect(respuestaPaginada(resultado, paginacion, (fila) => fila.Nombre)).toEqual({
      items: ['Camisa', 'Pantalón'],
      page: 2,
      pageSize: 10,
      total: 12,
    });
  });

  it('devuelve total 0 si el SP no trae el segundo result set', () => {
    const resultado: ResultadoSp<unknown> = { filas: [], resultSets: [[]], returnValue: 0 };

    expect(respuestaPaginada(resultado, paginacion).total).toBe(0);
  });
});
