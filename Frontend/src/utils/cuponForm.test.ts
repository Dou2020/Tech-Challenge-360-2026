import { describe, expect, it } from 'vitest';
import type { Cupon } from '../types/administracion';
import {
  cuponVacio,
  datosDeFormulario,
  esquemaCupon,
  estadoDeCupon,
  formularioDeCupon,
  type FormularioCupon,
} from './cuponForm';

const cupon: Cupon = {
  idCupon: 3,
  codigo: 'VERANO25',
  descripcion: 'Verano',
  tipoDescuento: 'MONTO_FIJO',
  valor: '25.00',
  idCategoria: 2,
  categoria: 'Ropa',
  montoMinimo: '100.00',
  fechaInicio: '2026-11-01T06:00:00.000Z',
  fechaFin: '2026-12-01T05:59:00.000Z',
  limiteUsosTotal: 10,
  limiteUsosPorCliente: 2,
  usosActuales: 4,
  usosDisponibles: 6,
  activo: true,
  vigente: true,
  agotado: false,
  cantidadPedidos: 4,
  cantidadCarritos: 0,
  puedeEliminarse: false,
};

const valido: FormularioCupon = {
  ...cuponVacio(),
  codigo: 'nuevo-10',
  valor: '10',
  fechaInicio: '2026-11-01T00:00',
  fechaFin: '2026-12-01T00:00',
  limiteUsosTotal: '5',
};

describe('cuponForm', () => {
  it('formularioDeCupon → convierte las fechas UTC a hora de Guatemala y todo a texto', () => {
    // Act
    const f = formularioDeCupon(cupon);

    // Assert
    expect(f).toMatchObject({
      codigo: 'VERANO25',
      descripcion: 'Verano',
      tipoDescuento: 'MONTO_FIJO',
      valor: '25.00',
      idCategoria: '2',
      montoMinimo: '100.00',
      fechaInicio: '2026-11-01T00:00',
      fechaFin: '2026-11-30T23:59',
      limiteUsosTotal: '10',
      limiteUsosPorCliente: '2',
    });
  });

  it('formularioDeCupon con descripción y categoría nulas → campos vacíos', () => {
    // Act
    const f = formularioDeCupon({ ...cupon, descripcion: null, idCategoria: null });

    // Assert
    expect(f.descripcion).toBe('');
    expect(f.idCategoria).toBe('');
  });

  it('datosDeFormulario → código en mayúsculas y fechas de Guatemala como UTC', () => {
    // Act
    const d = datosDeFormulario(valido);

    // Assert
    expect(d).toEqual({
      codigo: 'NUEVO-10',
      tipoDescuento: 'PORCENTAJE',
      valor: '10',
      montoMinimo: '0',
      fechaInicio: '2026-11-01T06:00:00.000Z',
      fechaFin: '2026-12-01T06:00:00.000Z',
      limiteUsosTotal: 5,
      limiteUsosPorCliente: 1,
    });
  });

  it('datosDeFormulario con categoría, descripción y monto mínimo vacío → los incluye o usa "0"', () => {
    // Act
    const d = datosDeFormulario({
      ...valido,
      idCategoria: '2',
      descripcion: 'Oferta',
      montoMinimo: '',
    });

    // Assert
    expect(d).toMatchObject({ idCategoria: 2, descripcion: 'Oferta', montoMinimo: '0' });
  });

  it('esquemaCupon → acepta un formulario válido', () => {
    // Act & Assert
    expect(esquemaCupon.safeParse(valido).success).toBe(true);
  });

  it.each([
    ['código vacío', { codigo: '' }, 'codigo'],
    ['código con caracteres inválidos', { codigo: 'a b' }, 'codigo'],
    ['valor 0', { valor: '0' }, 'valor'],
    ['valor con 3 decimales', { valor: '1.234' }, 'valor'],
    ['porcentaje mayor que 100', { valor: '101' }, 'valor'],
    ['monto mínimo inválido', { montoMinimo: 'x' }, 'montoMinimo'],
    ['sin fecha de inicio', { fechaInicio: '' }, 'fechaInicio'],
    ['fin igual al inicio', { fechaFin: '2026-11-01T00:00' }, 'fechaFin'],
    ['fin antes del inicio', { fechaFin: '2026-10-01T00:00' }, 'fechaFin'],
    ['límite total 0', { limiteUsosTotal: '0' }, 'limiteUsosTotal'],
    ['límite total decimal', { limiteUsosTotal: '1.5' }, 'limiteUsosTotal'],
    ['por cliente mayor que el total', { limiteUsosPorCliente: '6' }, 'limiteUsosPorCliente'],
  ])('esquemaCupon → %s se rechaza en %s', (_caso, cambios, campo) => {
    // Act
    const r = esquemaCupon.safeParse({ ...valido, ...cambios });

    // Assert
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues.some((i) => i.path[0] === campo)).toBe(true);
  });

  it('esquemaCupon → un monto fijo puede pasar de 100', () => {
    // Act & Assert
    expect(
      esquemaCupon.safeParse({ ...valido, tipoDescuento: 'MONTO_FIJO', valor: '250' }).success,
    ).toBe(true);
  });

  it.each([
    [{ activo: false }, 'Inactivo'],
    [{ agotado: true }, 'Agotado'],
    [{ vigente: true }, 'Vigente'],
    [{ vigente: false, fechaFin: '2026-01-01T00:00:00.000Z' }, 'Vencido'],
    [{ vigente: false, fechaFin: '2099-01-01T00:00:00.000Z' }, 'Próximo'],
  ] as const)('estadoDeCupon(%j) → %s', (cambios, esperado) => {
    // Act & Assert
    expect(estadoDeCupon({ ...cupon, ...cambios }, Date.parse('2026-11-15T00:00:00Z'))).toBe(
      esperado,
    );
  });
});
