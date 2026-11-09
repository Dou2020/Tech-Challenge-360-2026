import sql from 'mssql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSp } from '../../../../src/db/executeSp.js';
import { catalogoRepository } from '../../../../src/modules/catalogo/catalogo.repository.js';
import type { FilaImagen, FilaProducto } from '../../../../src/modules/catalogo/catalogo.types.js';

vi.mock('../../../../src/db/executeSp.js', () => ({ executeSp: vi.fn() }));

const PRODUCTO = { IDProducto: 7 } as FilaProducto;
const IMAGEN = { IDProductoImagen: 3 } as FilaImagen;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(executeSp).mockResolvedValue({
    filas: [PRODUCTO],
    resultSets: [[PRODUCTO], [], [], [IMAGEN]],
    returnValue: 0,
  });
});

describe('catalogoRepository (imágenes)', () => {
  it('ordenarImagenes envía los IDs como JSON en un NVarChar(MAX)', async () => {
    // Act
    const resultado = await catalogoRepository.ordenarImagenes(1, 7, [9, 4, 6]);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Productos_OrdenarImagenes', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 1 },
      { nombre: 'IDProducto', tipo: sql.Int, valor: 7 },
      { nombre: 'Imagenes', tipo: sql.NVarChar(sql.MAX), valor: '[9,4,6]' },
    ]);
    expect(resultado.imagenes).toEqual([IMAGEN]);
  });

  it('agregarImagen sin orden envía Orden NULL', async () => {
    // Act
    await catalogoRepository.agregarImagen(1, 7, {
      url: 'https://x.test/a.png',
      esPrincipal: false,
    });

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Productos_AgregarImagen', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 1 },
      { nombre: 'IDProducto', tipo: sql.Int, valor: 7 },
      { nombre: 'Url', tipo: sql.NVarChar(500), valor: 'https://x.test/a.png' },
      { nombre: 'Orden', tipo: sql.Int, valor: null },
      { nombre: 'EsPrincipal', tipo: sql.Bit, valor: false },
    ]);
  });

  it('agregarImagen con orden 0 conserva el 0 (no lo convierte en NULL)', async () => {
    // Act
    await catalogoRepository.agregarImagen(1, 7, {
      url: 'https://x.test/a.png',
      orden: 0,
      esPrincipal: true,
    });

    // Assert
    expect(executeSp).toHaveBeenCalledWith(
      'SP_Productos_AgregarImagen',
      expect.arrayContaining([{ nombre: 'Orden', tipo: sql.Int, valor: 0 }]),
    );
  });
});
