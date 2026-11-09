import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  celdaExcel,
  celdaTexto,
  descargarBlob,
  encabezadoReporte,
  esNumerica,
  FORMATO_ENTERO_EXCEL,
  FORMATO_MONEDA_EXCEL,
  nombreArchivo,
  textoPdf,
  textoRango,
} from './exportacion';

const rango = { desde: '2026-10-10', hasta: '2026-11-08' };

describe('nombreArchivo', () => {
  it('reporte y rango → nombre con extensión de Excel', () => {
    // Act
    const nombre = nombreArchivo('ventas-por-dia', rango, 'excel');

    // Assert
    expect(nombre).toBe('ventas-por-dia_2026-10-10_2026-11-08.xlsx');
  });

  it('tildes, espacios y mayúsculas → slug limpio; sin rango no agrega fechas', () => {
    // Act
    const nombre = nombreArchivo('  Ventas por Categoría ', {}, 'pdf');

    // Assert
    expect(nombre).toBe('ventas-por-categoria.pdf');
  });

  it('reporte sin letras ni números → "reporte"', () => {
    // Act
    const nombre = nombreArchivo('***', { desde: '2026-11-01' }, 'pdf');

    // Assert
    expect(nombre).toBe('reporte_2026-11-01.pdf');
  });
});

describe('textoRango', () => {
  it.each([
    [rango, 'Del 10/10/2026 al 08/11/2026'],
    [{ desde: '2026-10-10' }, 'Desde el 10/10/2026'],
    [{ hasta: '2026-11-08' }, 'Hasta el 08/11/2026'],
    [{}, 'Todo el historial'],
  ])('%o → %s', (entrada, esperado) => {
    // Act
    const texto = textoRango(entrada);

    // Assert
    expect(texto).toBe(esperado);
  });
});

describe('encabezadoReporte', () => {
  it('con línea extra → periodo, extra y fecha de generación en hora de Guatemala', () => {
    // Arrange
    const ahora = new Date('2026-11-09T03:30:00.000Z');

    // Act
    const lineas = encabezadoReporte(rango, 'Agrupación: semana', ahora);

    // Assert
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toBe('Del 10/10/2026 al 08/11/2026');
    expect(lineas[1]).toBe('Agrupación: semana');
    expect(textoPdf(lineas[2] ?? '')).toBe('Generado: 8/11/2026, 9:30 p. m.');
  });

  it('sin línea extra → solo periodo y fecha de generación', () => {
    // Act
    const lineas = encabezadoReporte(rango);

    // Assert
    expect(lineas).toHaveLength(2);
  });
});

describe('celdaTexto', () => {
  it.each([
    ['moneda', '1234.50', 'Q 1,234.50'],
    ['dia', '2026-11-03', '03/11/2026'],
    ['entero', 7, '7'],
    ['texto', 'Camisetas', 'Camisetas'],
    ['texto', null, ''],
    ['moneda', '', ''],
  ] as const)('%s %o → %s', (tipo, valor, esperado) => {
    // Act
    const texto = textoPdf(celdaTexto(tipo, valor));

    // Assert
    expect(texto).toBe(esperado);
  });

  it('fecha → fecha y hora de Guatemala', () => {
    // Act
    const texto = textoPdf(celdaTexto('fecha', '2026-11-04T03:30:00.000Z'));

    // Assert
    expect(texto).toBe('3/11/2026, 9:30 p. m.');
  });
});

describe('celdaExcel', () => {
  it('moneda → número con formato de quetzales', () => {
    // Act
    const celda = celdaExcel('moneda', '125.50');

    // Assert
    expect(celda).toEqual({ valor: 125.5, formato: FORMATO_MONEDA_EXCEL });
  });

  it('entero → número con separador de miles', () => {
    // Act
    const celda = celdaExcel('entero', 1500);

    // Assert
    expect(celda).toEqual({ valor: 1500, formato: FORMATO_ENTERO_EXCEL });
  });

  it('día → texto dd/mm/aaaa, sin formato numérico', () => {
    // Act
    const celda = celdaExcel('dia', '2026-11-03');

    // Assert
    expect(celda).toEqual({ valor: '03/11/2026' });
  });

  it('null → celda vacía', () => {
    // Act
    const celda = celdaExcel('texto', null);

    // Assert
    expect(celda).toEqual({ valor: null });
  });
});

describe('esNumerica', () => {
  it.each([
    ['moneda', true],
    ['entero', true],
    ['texto', false],
    ['dia', false],
    ['fecha', false],
  ] as const)('%s → %s', (tipo, esperado) => {
    // Act
    const resultado = esNumerica(tipo);

    // Assert
    expect(resultado).toBe(esperado);
  });
});

describe('textoPdf', () => {
  it('espacios duros y finos → espacios normales', () => {
    // Act
    const texto = textoPdf('9:30 p. m.');

    // Assert
    expect(texto).toBe('9:30 p. m.');
  });
});

describe('descargarBlob', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('crea un enlace con download, lo pulsa, lo quita y libera la URL', () => {
    // Arrange
    vi.useFakeTimers();
    const crear = vi.fn(() => 'blob:abc');
    const liberar = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: crear, revokeObjectURL: liberar });
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('reporte.pdf');
      expect(this.href).toBe('blob:abc');
    });
    const blob = new Blob(['x']);

    // Act
    descargarBlob(blob, 'reporte.pdf');
    vi.runAllTimers();

    // Assert
    expect(crear).toHaveBeenCalledWith(blob);
    expect(clic).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(liberar).toHaveBeenCalledWith('blob:abc');
    clic.mockRestore();
  });
});
