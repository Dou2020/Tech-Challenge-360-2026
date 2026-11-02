import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bitacoraRepository } from '../../../../src/modules/bitacora/bitacora.repository.js';
import {
  aFiltrosSp,
  aIdBitacora,
  aObjetoJson,
  bitacoraService,
} from '../../../../src/modules/bitacora/bitacora.service.js';
import type { FilaBitacora } from '../../../../src/modules/bitacora/bitacora.types.js';

vi.mock('../../../../src/modules/bitacora/bitacora.repository.js', () => ({
  bitacoraRepository: { listar: vi.fn(), listarModulos: vi.fn() },
}));

const repo = vi.mocked(bitacoraRepository);

const fila: FilaBitacora = {
  IDBitacora: '42',
  IDUsuario: 1,
  Usuario: 'Admin ShopCart',
  CorreoUsuario: 'admin@shopcart.gt',
  Modulo: 'Variantes',
  Entidad: 'Variante',
  IDRegistro: 5,
  Accion: 'MODIFICAR',
  ValorAnterior: '{"Precio":100.00}',
  ValorNuevo: '{"Precio":149.50}',
  Fecha: new Date('2026-11-01T12:00:00Z'),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('bitacoraService', () => {
  it('devuelve los valores como objetos, el id como number y el total como number', async () => {
    // Arrange
    repo.listar.mockResolvedValue({
      filas: [fila],
      resultSets: [[fila], [{ Total: '1' }]],
      returnValue: 0,
    });

    // Act
    const pagina = await bitacoraService.listar({}, { page: 1, pageSize: 20, sort: 'fecha:desc' });

    // Assert
    expect(pagina.total).toBe(1);
    expect(pagina.items[0]).toMatchObject({
      idBitacora: 42,
      valorAnterior: { Precio: 100 },
      valorNuevo: { Precio: 149.5 },
      fecha: '2026-11-01T12:00:00.000Z',
    });
  });

  it('lista los módulos como arreglo de texto', async () => {
    // Arrange
    repo.listarModulos.mockResolvedValue([{ Modulo: 'Cupones' }, { Modulo: 'Variantes' }]);

    // Act
    const modulos = await bitacoraService.listarModulos();

    // Assert
    expect(modulos).toEqual(['Cupones', 'Variantes']);
  });

  it('aObjetoJson: null → null; JSON válido → objeto; texto no JSON → el texto', () => {
    // Act
    const resultados = [aObjetoJson(null), aObjetoJson('{"a":1}'), aObjetoJson('no json')];

    // Assert
    expect(resultados).toEqual([null, { a: 1 }, 'no json']);
  });

  it('aIdBitacora rechaza un id fuera del rango seguro', () => {
    // Act
    const convertir = () => aIdBitacora('9007199254740993');

    // Assert
    expect(convertir).toThrow(/rango seguro/);
  });

  it('aFiltrosSp: un día es un día de Guatemala y lo ausente es null', () => {
    // Act
    const filtros = aFiltrosSp({ desde: '2026-11-01', hasta: '2026-11-01', modulo: 'Cupones' });

    // Assert
    expect(filtros).toMatchObject({
      modulo: 'Cupones',
      entidad: null,
      desde: new Date('2026-11-01T06:00:00.000Z'),
      hasta: new Date('2026-11-02T05:59:59.999Z'),
    });
  });
});
