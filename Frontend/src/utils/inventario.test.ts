import { describe, expect, it } from 'vitest';
import { estadoExistencia, proyectarExistencia } from './inventario';

describe('estadoExistencia', () => {
  it('disponible 0 → Agotado en rojo, aunque también sea bajo stock', () => {
    // Act
    const estado = estadoExistencia({ existenciaDisponible: 0, bajoStock: true });

    // Assert
    expect(estado).toEqual({ etiqueta: 'Agotado', tono: 'rojo' });
  });

  it('bajo stock con existencia → Bajo stock en ámbar', () => {
    // Act
    const estado = estadoExistencia({ existenciaDisponible: 3, bajoStock: true });

    // Assert
    expect(estado).toEqual({ etiqueta: 'Bajo stock', tono: 'ambar' });
  });

  it('por encima del umbral → null', () => {
    // Act
    const estado = estadoExistencia({ existenciaDisponible: 30, bajoStock: false });

    // Assert
    expect(estado).toBeNull();
  });
});

describe('proyectarExistencia', () => {
  const variante = { existenciaFisica: 9, existenciaDisponible: 7 };

  it.each([
    ['ENTRADA_COMPRA', { fisica: 13, disponible: 11 }],
    ['AJUSTE_ENTRADA', { fisica: 13, disponible: 11 }],
    ['AJUSTE_SALIDA', { fisica: 5, disponible: 3 }],
  ] as const)('%s de 4 → %o', (clase, esperado) => {
    // Act
    const resultado = proyectarExistencia(variante, clase, 4);

    // Assert
    expect(resultado).toEqual(esperado);
  });

  it('una salida mayor que lo disponible → disponible negativo (la vista previa avisa)', () => {
    // Act
    const resultado = proyectarExistencia(variante, 'AJUSTE_SALIDA', 8);

    // Assert
    expect(resultado).toEqual({ fisica: 1, disponible: -1 });
  });
});
