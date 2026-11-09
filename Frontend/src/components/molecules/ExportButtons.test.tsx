import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExportButtons } from './ExportButtons';

describe('ExportButtons', () => {
  it('muestra Excel y PDF agrupados con el nombre del reporte', () => {
    // Act
    render(<ExportButtons titulo="Ventas por día" onExportar={vi.fn()} />);

    // Assert
    expect(screen.getByRole('group', { name: 'Exportar ventas por día' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Exportar ventas por día a Excel' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar ventas por día a PDF' })).toBeEnabled();
  });

  it('clic en PDF → llama a onExportar con "pdf"', async () => {
    // Arrange
    const onExportar = vi.fn().mockResolvedValue(undefined);
    render(<ExportButtons titulo="Top" onExportar={onExportar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Exportar top a PDF' }));

    // Assert
    expect(onExportar).toHaveBeenCalledWith('pdf');
  });

  it('mientras genera → el botón queda ocupado y ambos deshabilitados; al terminar se liberan', async () => {
    // Arrange
    let terminar!: () => void;
    const onExportar = vi.fn(() => new Promise<void>((resolver) => (terminar = resolver)));
    render(<ExportButtons titulo="Top" onExportar={onExportar} />);
    const excel = screen.getByRole('button', { name: 'Exportar top a Excel' });
    const pdf = screen.getByRole('button', { name: 'Exportar top a PDF' });

    // Act
    await userEvent.click(excel);

    // Assert
    expect(excel).toHaveAttribute('aria-busy', 'true');
    expect(excel).toBeDisabled();
    expect(pdf).toBeDisabled();
    terminar();
    expect(await screen.findByRole('button', { name: 'Exportar top a Excel' })).toBeEnabled();
    expect(pdf).toBeEnabled();
  });

  it('deshabilitado → ningún botón se puede pulsar', () => {
    // Act
    render(<ExportButtons titulo="Top" onExportar={vi.fn()} deshabilitado />);

    // Assert
    expect(screen.getByRole('button', { name: 'Exportar top a Excel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar top a PDF' })).toBeDisabled();
  });
});
