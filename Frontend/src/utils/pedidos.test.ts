import { describe, expect, it } from 'vitest';
import type { EstadosPedido } from '../types/pedidos';
import { destinosPermitidos } from './pedidos';

const catalogo: EstadosPedido = {
  estados: [
    { codigo: 'PAGADO', nombre: 'Pagado', esFinal: false },
    { codigo: 'EN_PREPARACION', nombre: 'En preparación', esFinal: false },
    { codigo: 'CANCELADO', nombre: 'Cancelado', esFinal: true },
  ],
  transiciones: [
    {
      origen: 'PAGADO',
      destino: 'EN_PREPARACION',
      rol: 'Operador',
      permitida: true,
      via: 'ESTADO',
    },
    {
      origen: 'PAGADO',
      destino: 'EN_PREPARACION',
      rol: 'Administrador',
      permitida: true,
      via: 'ESTADO',
    },
    { origen: 'PAGADO', destino: 'CANCELADO', rol: 'Cliente', permitida: false, via: 'CANCELAR' },
    { origen: 'PAGADO', destino: 'CANCELADO', rol: 'Operador', permitida: true, via: 'CANCELAR' },
    {
      origen: 'EN_PREPARACION',
      destino: 'DESPACHADO',
      rol: 'Cliente',
      permitida: false,
      via: 'ESTADO',
    },
    {
      origen: 'ENTREGADO',
      destino: 'DEVUELTO',
      rol: 'Operador',
      permitida: true,
      via: 'DEVOLUCION',
    },
  ],
};

describe('destinosPermitidos', () => {
  it('solo permitidas desde el origen, sin repetir y con el nombre del catálogo', () => {
    // Act
    const destinos = destinosPermitidos(catalogo, 'PAGADO');

    // Assert
    expect(destinos).toEqual([
      { estado: 'EN_PREPARACION', nombre: 'En preparación', via: 'ESTADO' },
      { estado: 'CANCELADO', nombre: 'Cancelado', via: 'CANCELAR' },
    ]);
  });

  it('una transición no permitida para el rol no es destino', () => {
    // Act
    const destinos = destinosPermitidos(catalogo, 'EN_PREPARACION');

    // Assert
    expect(destinos).toEqual([]);
  });

  it('las devoluciones quedan fuera (son por línea)', () => {
    // Act
    const destinos = destinosPermitidos(catalogo, 'ENTREGADO');

    // Assert
    expect(destinos).toEqual([]);
  });

  it('destino que no está en el catálogo de estados → usa la etiqueta de la configuración', () => {
    // Arrange
    const sinEstados: EstadosPedido = { estados: [], transiciones: catalogo.transiciones };

    // Act
    const destinos = destinosPermitidos(sinEstados, 'PAGADO');

    // Assert
    expect(destinos.map((d) => d.nombre)).toEqual(['En preparación', 'Cancelado']);
  });

  it('sin catálogo (aún no carga) → ningún destino', () => {
    // Act
    const destinos = destinosPermitidos(undefined, 'PAGADO');

    // Assert
    expect(destinos).toEqual([]);
  });
});
