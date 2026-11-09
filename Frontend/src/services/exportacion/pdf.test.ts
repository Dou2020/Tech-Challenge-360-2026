import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DefinicionExportacion } from '../../types/exportacion';
import { exportarPdf } from './pdf';

const doc = vi.hoisted(() => ({
  setProperties: vi.fn(),
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  setPage: vi.fn(),
  save: vi.fn(),
  getNumberOfPages: vi.fn(() => 2),
  internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
}));
const constructor = vi.hoisted(() => vi.fn());

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(opciones: unknown) {
      constructor(opciones);
      return doc;
    }
  },
}));
const autoTable = vi.hoisted(() => vi.fn());
vi.mock('jspdf-autotable', () => ({ autoTable }));

interface Fila {
  nombre: string;
  monto: string;
  fecha: string;
}

const columnas: DefinicionExportacion<Fila>['columnas'] = [
  { titulo: 'Cliente', tipo: 'texto', valor: (f) => f.nombre },
  { titulo: 'Última actividad', tipo: 'fecha', valor: (f) => f.fecha },
  { titulo: 'Valor', tipo: 'moneda', valor: (f) => f.monto },
];

const def: DefinicionExportacion<Fila> = {
  reporte: 'carritos-abandonados',
  titulo: 'Carritos abandonados',
  rango: { desde: '2026-11-01', hasta: '2026-11-30' },
  columnas,
  filas: [{ nombre: 'Ana', monto: '298.00', fecha: '2026-11-04T03:30:00.000Z' }],
};

const ahora = new Date('2026-11-09T03:30:00.000Z');

describe('exportarPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hasta 5 columnas → carta vertical en puntos', () => {
    // Act
    exportarPdf(def, ahora);

    // Assert
    expect(constructor).toHaveBeenCalledWith({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter',
      compress: true,
    });
  });

  it('más de 5 columnas → horizontal', () => {
    // Arrange
    const ancho = { ...def, columnas: [...columnas, ...columnas] };

    // Act
    exportarPdf(ancho, ahora);

    // Assert
    expect(constructor).toHaveBeenCalledWith(expect.objectContaining({ orientation: 'landscape' }));
  });

  it('encabezado con título, periodo y fecha de generación sin espacios especiales', () => {
    // Act
    exportarPdf({ ...def, extra: 'Agrupación: semana' }, ahora);

    // Assert
    const textos = doc.text.mock.calls.map(([texto]) => texto as string);
    expect(textos.slice(0, 4)).toEqual([
      'Carritos abandonados',
      'Del 01/11/2026 al 30/11/2026',
      'Agrupación: semana',
      'Generado: 8/11/2026, 9:30 p. m.',
    ]);
    expect(doc.setProperties).toHaveBeenCalledWith({
      title: 'Carritos abandonados',
      creator: 'ShopCart',
    });
  });

  it('tabla con cabecera, celdas formateadas y montos alineados a la derecha', () => {
    // Act
    exportarPdf(def, ahora);

    // Assert
    expect(autoTable).toHaveBeenCalledTimes(1);
    const [destino, opciones] = autoTable.mock.calls[0]!;
    expect(destino).toBe(doc);
    expect(opciones).toMatchObject({
      head: [['Cliente', 'Última actividad', 'Valor']],
      body: [['Ana', '3/11/2026, 9:30 p. m.', 'Q 298.00']],
      columnStyles: { 2: { halign: 'right' } },
    });
    expect(opciones.columnStyles).not.toHaveProperty('0');
  });

  it('cabecera de una columna numérica → alineada a la derecha; texto y cuerpo no se tocan', () => {
    // Arrange
    exportarPdf(def, ahora);
    const { didParseCell } = autoTable.mock.calls[0]![1];
    const celda = (section: string, index: number) => {
      const cell = { styles: { halign: 'left' } };
      didParseCell({ section, column: { index }, cell });
      return cell.styles.halign;
    };

    // Act
    const alineaciones = [celda('head', 2), celda('head', 0), celda('body', 2)];

    // Assert
    expect(alineaciones).toEqual(['right', 'left', 'left']);
  });

  it('numera cada página en el pie y guarda con el nombre del reporte', () => {
    // Act
    exportarPdf(def, ahora);

    // Assert
    expect(doc.setPage.mock.calls).toEqual([[1], [2]]);
    expect(doc.text).toHaveBeenCalledWith('Página 2 de 2', 572, 772, { align: 'right' });
    expect(doc.text).toHaveBeenCalledWith('ShopCart · Carritos abandonados', 40, 772);
    expect(doc.save).toHaveBeenCalledWith('carritos-abandonados_2026-11-01_2026-11-30.pdf');
  });
});
