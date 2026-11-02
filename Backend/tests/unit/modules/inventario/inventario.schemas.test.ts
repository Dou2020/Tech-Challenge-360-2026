import { describe, expect, it } from 'vitest';
import {
  ajusteBody,
  entradaBody,
  kardexQuery,
  listarExistenciasQuery,
} from '../../../../src/modules/inventario/inventario.schemas.js';

describe('kardexQuery', () => {
  it('acepta fechas, instantes con zona y normaliza el tipo a mayúsculas', () => {
    expect(
      kardexQuery.parse({
        desde: '2026-11-01',
        hasta: '2026-11-02T10:00:00Z',
        tipo: 'ajuste_salida',
      }),
    ).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-02T10:00:00Z',
      tipo: 'AJUSTE_SALIDA',
      page: 1,
      pageSize: 20,
      sort: 'fecha:desc',
    });
  });

  it('vacíos equivalen a sin filtro', () => {
    expect(kardexQuery.parse({ desde: '', hasta: ' ', tipo: '' })).toMatchObject({
      desde: undefined,
      hasta: undefined,
      tipo: undefined,
    });
  });

  it('rechaza un instante sin zona, una fecha imposible, desde > hasta y otro orden', () => {
    expect(kardexQuery.safeParse({ desde: '2026-11-01T10:00:00' }).success).toBe(false);
    expect(kardexQuery.safeParse({ desde: '2026-02-30' }).success).toBe(false);
    expect(kardexQuery.safeParse({ desde: '01/11/2026' }).success).toBe(false);
    expect(kardexQuery.safeParse({ desde: '2026-11-02', hasta: '2026-11-01' }).success).toBe(false);
    expect(kardexQuery.safeParse({ sort: 'cantidad:asc' }).success).toBe(false);
    expect(kardexQuery.safeParse({ tipo: "AJUSTE'; --" }).success).toBe(false);
  });
});

describe('listarExistenciasQuery', () => {
  it('convierte bajoStock y usa existenciaDisponible:asc por defecto', () => {
    expect(listarExistenciasQuery.parse({ bajoStock: 'true', idCategoria: '3' })).toMatchObject({
      bajoStock: true,
      idCategoria: 3,
      sort: 'existenciaDisponible:asc',
    });
    expect(listarExistenciasQuery.safeParse({ sort: 'precio:asc' }).success).toBe(false);
    expect(listarExistenciasQuery.safeParse({ bajoStock: '1' }).success).toBe(false);
  });
});

describe('entradaBody y ajusteBody', () => {
  it('la entrada acepta motivo ausente o vacío como null', () => {
    expect(entradaBody.parse({ idVariante: 1, cantidad: 5 })).toEqual({
      idVariante: 1,
      cantidad: 5,
      motivo: null,
    });
    expect(entradaBody.parse({ idVariante: 1, cantidad: 5, motivo: '  ' }).motivo).toBeNull();
  });

  it('rechaza cantidades no enteras, cero o negativas', () => {
    for (const cantidad of [0, -1, 1.5, '3']) {
      expect(entradaBody.safeParse({ idVariante: 1, cantidad }).success).toBe(false);
    }
  });

  it('el ajuste exige motivo (máx. 300) y tipo ENTRADA o SALIDA', () => {
    const base = { idVariante: 1, tipo: 'SALIDA', cantidad: 1 };
    expect(ajusteBody.safeParse(base).success).toBe(false);
    expect(ajusteBody.safeParse({ ...base, motivo: '   ' }).success).toBe(false);
    expect(ajusteBody.safeParse({ ...base, motivo: 'x'.repeat(301) }).success).toBe(false);
    expect(ajusteBody.safeParse({ ...base, tipo: 'MERMA', motivo: 'Dañado' }).success).toBe(false);
    expect(ajusteBody.parse({ ...base, motivo: ' Dañado ' }).motivo).toBe('Dañado');
  });
});
