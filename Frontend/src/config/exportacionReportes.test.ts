import { describe, expect, it } from 'vitest';
import type { ColumnaExportable } from '../types/exportacion';
import type { CarritoAbandonado } from '../types/reportes';
import { exportCarritos, exportCategorias, exportTop, exportVentas } from './exportacionReportes';

function valores<T>(columnas: ColumnaExportable<T>[], fila: T) {
  return columnas.map((c) => [c.titulo, c.tipo, c.valor(fila)]);
}

const carrito: CarritoAbandonado = {
  idCarrito: 10,
  idUsuario: 6,
  tipo: 'CLIENTE',
  cliente: 'Ana López',
  correo: 'cliente@shopcart.gt',
  cantidadLineas: 2,
  cantidadUnidades: 3,
  subtotal: '300.00',
  descuento: '30.00',
  valor: '270.00',
  fechaCreacion: '2026-11-01T10:00:00.000Z',
  fechaUltimaActividad: '2026-11-02T10:00:00.000Z',
  horasInactivo: 30,
};

describe('columnas de exportación de reportes', () => {
  it('ventas por periodo → día, enteros y monto tal como llegan', () => {
    // Act
    const resultado = valores(exportVentas, {
      periodoInicio: '2026-11-03',
      ventas: '500.00',
      pedidos: 2,
      unidadesNetas: 4,
    });

    // Assert
    expect(resultado).toEqual([
      ['Periodo (inicio)', 'dia', '2026-11-03'],
      ['Pedidos', 'entero', 2],
      ['Unidades', 'entero', 4],
      ['Ventas netas', 'moneda', '500.00'],
    ]);
  });

  it('ventas por categoría → sin el id, con bruta, reembolsado y neta', () => {
    // Act
    const resultado = valores(exportCategorias, {
      idCategoria: 1,
      categoria: 'Camisetas',
      unidadesVendidas: 5,
      unidadesDevueltas: 1,
      unidadesNetas: 4,
      ventaBruta: '600.00',
      montoReembolsado: '100.00',
      ventaNeta: '500.00',
    });

    // Assert
    expect(resultado).toEqual([
      ['Categoría', 'texto', 'Camisetas'],
      ['Vendidas', 'entero', 5],
      ['Devueltas', 'entero', 1],
      ['Netas', 'entero', 4],
      ['Venta bruta', 'moneda', '600.00'],
      ['Reembolsado', 'moneda', '100.00'],
      ['Venta neta', 'moneda', '500.00'],
    ]);
  });

  it('productos más vendidos → producto, categoría, unidades y venta neta', () => {
    // Act
    const resultado = valores(exportTop, {
      idProducto: 7,
      producto: 'Camiseta básica',
      idCategoria: 1,
      categoria: 'Camisetas',
      unidadesNetas: 4,
      ventaNeta: '500.00',
    });

    // Assert
    expect(resultado).toEqual([
      ['Producto', 'texto', 'Camiseta básica'],
      ['Categoría', 'texto', 'Camisetas'],
      ['Unidades netas', 'entero', 4],
      ['Venta neta', 'moneda', '500.00'],
    ]);
  });

  it('carrito de un Cliente → todas sus columnas', () => {
    // Act
    const resultado = valores(exportCarritos, carrito);

    // Assert
    expect(resultado).toEqual([
      ['Tipo', 'texto', 'Cliente'],
      ['Cliente', 'texto', 'Ana López'],
      ['Correo', 'texto', 'cliente@shopcart.gt'],
      ['Líneas', 'entero', 2],
      ['Unidades', 'entero', 3],
      ['Subtotal', 'moneda', '300.00'],
      ['Descuento', 'moneda', '30.00'],
      ['Valor', 'moneda', '270.00'],
      ['Última actividad', 'fecha', '2026-11-02T10:00:00.000Z'],
      ['Horas inactivo', 'entero', 30],
    ]);
  });

  it('carrito de invitado → tipo "Invitado" y cliente/correo vacíos', () => {
    // Act
    const resultado = valores(exportCarritos, {
      ...carrito,
      tipo: 'INVITADO',
      idUsuario: null,
      cliente: null,
      correo: null,
    });

    // Assert
    expect(resultado.slice(0, 3)).toEqual([
      ['Tipo', 'texto', 'Invitado'],
      ['Cliente', 'texto', null],
      ['Correo', 'texto', null],
    ]);
  });
});
