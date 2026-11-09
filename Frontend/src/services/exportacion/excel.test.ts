import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DefinicionExportacion } from '../../types/exportacion';
import type * as utilidades from '../../utils/exportacion';
import { descargarBlob, FORMATO_MONEDA_EXCEL } from '../../utils/exportacion';
import { exportarExcel } from './excel';

vi.mock('../../utils/exportacion', async (importOriginal) => ({
  ...(await importOriginal<typeof utilidades>()),
  descargarBlob: vi.fn(),
}));
const descargar = vi.mocked(descargarBlob);

interface Fila {
  nombre: string;
  monto: string;
  unidades: number;
}

const def: DefinicionExportacion<Fila> = {
  reporte: 'ventas-por-categoria',
  titulo: 'Ventas por categoría',
  rango: { desde: '2026-11-01', hasta: '2026-11-30' },
  extra: 'Agrupación: día',
  columnas: [
    { titulo: 'Categoría', tipo: 'texto', valor: (f) => f.nombre, ancho: 24 },
    { titulo: 'Unidades', tipo: 'entero', valor: (f) => f.unidades },
    { titulo: 'Venta neta', tipo: 'moneda', valor: (f) => f.monto },
  ],
  filas: [
    { nombre: 'Camisetas', monto: '1234.50', unidades: 4 },
    { nombre: 'Gorras', monto: '99.99', unidades: 1 },
  ],
};

/** Genera el archivo y lo vuelve a leer con exceljs. */
async function generarYLeer(definicion: DefinicionExportacion<Fila>) {
  await exportarExcel(definicion, new Date('2026-11-09T03:30:00.000Z'));
  const [blob, nombre] = descargar.mock.calls[0] ?? [];
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await (blob as Blob).arrayBuffer());
  return { nombre, blob: blob as Blob, hoja: libro.worksheets[0]! };
}

describe('exportarExcel', () => {
  beforeEach(() => {
    descargar.mockReset();
  });

  it('descarga un .xlsx con el nombre del reporte y el rango', async () => {
    // Act
    const { nombre, blob } = await generarYLeer(def);

    // Assert
    expect(nombre).toBe('ventas-por-categoria_2026-11-01_2026-11-30.xlsx');
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('encabezado: título, periodo, línea extra y fecha de generación', async () => {
    // Act
    const { hoja } = await generarYLeer(def);

    // Assert
    expect(hoja.name).toBe('Ventas por categoría');
    expect(hoja.getCell('A1').value).toBe('Ventas por categoría');
    expect(hoja.getCell('A1').font?.bold).toBe(true);
    expect(hoja.getCell('A2').value).toBe('Del 01/11/2026 al 30/11/2026');
    expect(hoja.getCell('A3').value).toBe('Agrupación: día');
    expect(String(hoja.getCell('A4').value)).toMatch(/^Generado: 8\/11\/2026/);
  });

  it('cabecera de la tabla con filtro y panel congelado', async () => {
    // Act
    const { hoja } = await generarYLeer(def);

    // Assert
    expect(hoja.getRow(6).values).toEqual([undefined, 'Categoría', 'Unidades', 'Venta neta']);
    expect(hoja.getCell('A6').font?.bold).toBe(true);
    expect(hoja.autoFilter).toBe('A6:C6');
    expect(hoja.views[0]).toMatchObject({ state: 'frozen', ySplit: 6 });
    expect(hoja.getColumn(1).width).toBe(24);
    expect(hoja.getColumn(2).width).toBe(14);
  });

  it('montos y enteros como números con formato, sin recalcular nada', async () => {
    // Act
    const { hoja } = await generarYLeer(def);

    // Assert
    expect(hoja.getRow(7).values).toEqual([undefined, 'Camisetas', 4, 1234.5]);
    expect(hoja.getCell('C7').numFmt).toBe(FORMATO_MONEDA_EXCEL);
    expect(hoja.getRow(8).values).toEqual([undefined, 'Gorras', 1, 99.99]);
    expect(hoja.rowCount).toBe(8);
  });

  it('título con caracteres no válidos en una hoja → se reemplazan; sin extra no hay esa fila', async () => {
    // Arrange
    const otra = { ...def, titulo: 'Ventas [día]: top/10', extra: undefined };

    // Act
    const { hoja } = await generarYLeer(otra);

    // Assert
    expect(hoja.name).toBe('Ventas  día   top 10');
    expect(String(hoja.getCell('A3').value)).toMatch(/^Generado:/);
  });
});
