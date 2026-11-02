import { describe, expect, it } from 'vitest';
import {
  carritosQuery,
  rangoQuery,
  topProductosQuery,
  ventasQuery,
} from '../../../../src/modules/reportes/reportes.schemas.js';

describe('esquemas de reportes', () => {
  it('acepta fechas vacías y rechaza formatos que no son YYYY-MM-DD', () => {
    // Arrange
    const validos = { desde: '', hasta: '2026-10-31' };
    const invalidos = { desde: '2026-10-31T00:00:00Z' };

    // Act
    const a = rangoQuery.safeParse(validos);
    const b = rangoQuery.safeParse(invalidos);

    // Assert
    expect(a.success).toBe(true);
    expect(b.success).toBe(false);
  });

  it('rechaza desde posterior a hasta', () => {
    // Arrange
    const query = { desde: '2026-10-31', hasta: '2026-10-01' };

    // Act
    const resultado = ventasQuery.safeParse(query);

    // Assert
    expect(resultado.success).toBe(false);
  });

  it('agrupacion por defecto dia; inválida falla; limite entre 1 y 100', () => {
    // Arrange
    const porDefecto = ventasQuery.parse({});

    // Act
    const mala = ventasQuery.safeParse({ agrupacion: 'anio' });
    const limites = [0, 101, 100].map((l) => topProductosQuery.safeParse({ limite: l }).success);

    // Assert
    expect(porDefecto.agrupacion).toBe('dia');
    expect(mala.success).toBe(false);
    expect(limites).toEqual([false, false, true]);
  });

  it('el orden de carritos solo admite fecha, valor, unidades y cliente', () => {
    // Arrange
    const ok = carritosQuery.safeParse({ sort: 'cliente:desc' });

    // Act
    const mal = carritosQuery.safeParse({ sort: 'otro:asc' });

    // Assert
    expect(ok.success).toBe(true);
    expect(mal.success).toBe(false);
  });
});
