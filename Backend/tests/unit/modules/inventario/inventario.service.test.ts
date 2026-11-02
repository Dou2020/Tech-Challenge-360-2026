import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inventarioRepository } from '../../../../src/modules/inventario/inventario.repository.js';
import {
  aFiltrosKardexSp,
  aIdMovimiento,
  inventarioService,
} from '../../../../src/modules/inventario/inventario.service.js';
import type {
  FilaExistencia,
  FilaMovimiento,
  FilaMovimientoRegistrado,
} from '../../../../src/modules/inventario/inventario.types.js';

vi.mock('../../../../src/modules/inventario/inventario.repository.js', () => ({
  inventarioRepository: {
    listarTiposMovimiento: vi.fn(),
    listarExistencias: vi.fn(),
    consultarKardex: vi.fn(),
    registrarEntrada: vi.fn(),
    registrarAjuste: vi.fn(),
    liberarReservasVencidas: vi.fn(),
  },
}));

const repo = vi.mocked(inventarioRepository);
const PAGINACION = { page: 1, pageSize: 20, sort: 'fecha:desc' };
const OPERADOR = 2;

const filaMovimiento: FilaMovimiento = {
  // BIGINT: el driver lo entrega como string.
  IDMovimientoInventario: '9811',
  IDVariante: 41,
  Fecha: new Date('2026-11-01T15:30:00.000Z'),
  CodigoTipoMovimiento: 'AJUSTE_SALIDA',
  NombreTipoMovimiento: 'Ajuste de salida',
  Signo: -1,
  Cantidad: 3,
  ExistenciaAnterior: 9,
  ExistenciaNueva: 6,
  Motivo: 'Producto dañado en bodega',
  IDUsuario: OPERADOR,
  Usuario: 'Óscar Operador',
  IDPedido: null,
  NumeroPedido: null,
  IDDevolucion: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('aFiltrosKardexSp', () => {
  it('un día YYYY-MM-DD cubre el día completo de Guatemala (UTC-6), ambos inclusive', () => {
    expect(aFiltrosKardexSp({ desde: '2026-11-01', hasta: '2026-11-01' })).toEqual({
      desde: new Date('2026-11-01T06:00:00.000Z'),
      hasta: new Date('2026-11-02T05:59:59.999Z'),
      tipo: null,
    });
  });

  it('un instante con zona se usa tal cual, convertido a UTC', () => {
    expect(
      aFiltrosKardexSp({
        desde: '2026-11-01T09:30:00-06:00',
        hasta: '2026-11-03T15:00:00.250Z',
        tipo: 'AJUSTE_SALIDA',
      }),
    ).toEqual({
      desde: new Date('2026-11-01T15:30:00.000Z'),
      hasta: new Date('2026-11-03T15:00:00.250Z'),
      tipo: 'AJUSTE_SALIDA',
    });
  });

  it('sin fechas ni tipo manda NULL (sin filtro)', () => {
    expect(aFiltrosKardexSp({})).toEqual({ desde: null, hasta: null, tipo: null });
  });
});

describe('aIdMovimiento', () => {
  it('convierte el BIGINT del driver a number', () => {
    expect(aIdMovimiento('9811')).toBe(9811);
    expect(aIdMovimiento(12)).toBe(12);
  });

  it('falla en lugar de redondear un id fuera del rango seguro', () => {
    expect(() => aIdMovimiento('9007199254740993')).toThrow(/rango seguro/);
  });
});

describe('inventarioService', () => {
  it('consultarKardex pasa la variante, los filtros convertidos y la paginación al repositorio', async () => {
    repo.consultarKardex.mockResolvedValue({
      filas: [filaMovimiento],
      resultSets: [[filaMovimiento], [{ Total: 1 }]],
      returnValue: 0,
    });

    const respuesta = await inventarioService.consultarKardex(
      41,
      { desde: '2026-11-01', tipo: 'AJUSTE_SALIDA' },
      PAGINACION,
    );

    expect(repo.consultarKardex).toHaveBeenCalledWith(
      41,
      { desde: new Date('2026-11-01T06:00:00.000Z'), hasta: null, tipo: 'AJUSTE_SALIDA' },
      PAGINACION,
    );
    expect(respuesta).toEqual({
      items: [
        {
          idMovimientoInventario: 9811,
          idVariante: 41,
          fecha: '2026-11-01T15:30:00.000Z',
          codigoTipoMovimiento: 'AJUSTE_SALIDA',
          nombreTipoMovimiento: 'Ajuste de salida',
          signo: -1,
          cantidad: 3,
          existenciaAnterior: 9,
          existenciaNueva: 6,
          motivo: 'Producto dañado en bodega',
          idUsuario: OPERADOR,
          usuario: 'Óscar Operador',
          idPedido: null,
          numeroPedido: null,
          idDevolucion: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it('listarExistencias pasa los filtros y mapea montos y banderas', async () => {
    const fila: FilaExistencia = {
      IDVariante: 4,
      SKU: 'CAM-LIM-NEG-M',
      IDProducto: 2,
      Producto: 'Camiseta edición limitada',
      IDCategoria: 1,
      Categoria: 'Camisetas',
      Descripcion: 'Talla M / Color Negro',
      Precio: 199.9,
      ExistenciaFisica: 1,
      ExistenciaReservada: 0,
      ExistenciaDisponible: 1,
      BajoStock: true,
      UmbralBajoStock: 5,
      Activo: true,
      ProductoActivo: true,
      CategoriaActiva: false,
    };
    repo.listarExistencias.mockResolvedValue({
      filas: [fila],
      resultSets: [[fila], [{ Total: 1 }]],
      returnValue: 0,
    });
    const paginacion = { page: 1, pageSize: 20, sort: 'existenciaDisponible:asc' };

    const respuesta = await inventarioService.listarExistencias({ bajoStock: true }, paginacion);

    expect(repo.listarExistencias).toHaveBeenCalledWith({ bajoStock: true }, paginacion);
    expect(respuesta.items[0]).toMatchObject({
      idVariante: 4,
      precio: '199.90',
      bajoStock: true,
      umbralBajoStock: 5,
      activo: true,
      categoriaActiva: false,
    });
    expect(respuesta.total).toBe(1);
  });

  it('registrarAjuste devuelve el movimiento con la existencia resultante de la variante', async () => {
    const fila: FilaMovimientoRegistrado = {
      ...filaMovimiento,
      SKU: 'CAM-BAS-M-AZ',
      ExistenciaFisica: 6,
      ExistenciaReservada: 2,
      ExistenciaDisponible: 4,
    };
    repo.registrarAjuste.mockResolvedValue(fila);
    const datos = {
      idVariante: 41,
      tipo: 'SALIDA' as const,
      cantidad: 3,
      motivo: 'Producto dañado en bodega',
    };

    const respuesta = await inventarioService.registrarAjuste(OPERADOR, datos);

    expect(repo.registrarAjuste).toHaveBeenCalledWith(OPERADOR, datos);
    expect(respuesta).toMatchObject({
      idMovimientoInventario: 9811,
      existenciaAnterior: 9,
      existenciaNueva: 6,
      sku: 'CAM-BAS-M-AZ',
      existenciaFisica: 6,
      existenciaReservada: 2,
      existenciaDisponible: 4,
    });
  });

  it('liberarReservasVencidas devuelve los contadores del SP', async () => {
    repo.liberarReservasVencidas.mockResolvedValue({
      ReservasLiberadas: 2,
      UnidadesLiberadas: 5,
      VariantesAfectadas: 1,
    });

    expect(await inventarioService.liberarReservasVencidas()).toEqual({
      reservasLiberadas: 2,
      unidadesLiberadas: 5,
      variantesAfectadas: 1,
    });
  });
});
