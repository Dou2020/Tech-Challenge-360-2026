import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DefinicionExportacion } from '../../types/exportacion';
import { exportarExcel } from './excel';
import { exportarReporte } from './index';
import { exportarPdf } from './pdf';

vi.mock('./excel', () => ({ exportarExcel: vi.fn() }));
vi.mock('./pdf', () => ({ exportarPdf: vi.fn() }));

const def: DefinicionExportacion<{ a: string }> = {
  reporte: 'r',
  titulo: 'R',
  rango: {},
  columnas: [{ titulo: 'A', tipo: 'texto', valor: (f) => f.a }],
  filas: [{ a: 'x' }],
};

describe('exportarReporte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excel → usa el generador de Excel', async () => {
    // Act
    await exportarReporte('excel', def);

    // Assert
    expect(exportarExcel).toHaveBeenCalledWith(def);
    expect(exportarPdf).not.toHaveBeenCalled();
  });

  it('pdf → usa el generador de PDF', async () => {
    // Act
    await exportarReporte('pdf', def);

    // Assert
    expect(exportarPdf).toHaveBeenCalledWith(def);
    expect(exportarExcel).not.toHaveBeenCalled();
  });

  it('un error del generador → se propaga', async () => {
    // Arrange
    vi.mocked(exportarExcel).mockRejectedValueOnce(new Error('sin memoria'));

    // Act
    const resultado = exportarReporte('excel', def);

    // Assert
    await expect(resultado).rejects.toThrow('sin memoria');
  });
});
