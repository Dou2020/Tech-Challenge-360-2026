import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchBox } from './SearchBox';

describe('SearchBox', () => {
  it('Enter → emite el texto sin espacios sobrantes', async () => {
    // Arrange
    const onBuscar = vi.fn();
    render(<SearchBox etiqueta="Buscar productos" onBuscar={onBuscar} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar productos' }), '  tenis ');

    // Act
    await userEvent.keyboard('{Enter}');

    // Assert
    expect(onBuscar).toHaveBeenCalledWith('tenis');
  });

  it('clic en el botón → emite el texto', async () => {
    // Arrange
    const onBuscar = vi.fn();
    render(<SearchBox etiqueta="Buscar productos" onBuscar={onBuscar} />);
    await userEvent.type(screen.getByRole('searchbox'), 'gorra');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Buscar productos' }));

    // Assert
    expect(onBuscar).toHaveBeenCalledWith('gorra');
  });

  it('valor inicial → se muestra en el cuadro', () => {
    // Act
    render(<SearchBox valor="camisa" onBuscar={vi.fn()} />);

    // Assert
    expect(screen.getByRole('searchbox')).toHaveValue('camisa');
  });

  it('el valor cambia desde fuera (navegación) → el cuadro se reinicia', () => {
    // Arrange
    const { rerender } = render(<SearchBox valor="camisa" onBuscar={vi.fn()} />);

    // Act
    rerender(<SearchBox valor="gorra" onBuscar={vi.fn()} />);

    // Assert
    expect(screen.getByRole('searchbox')).toHaveValue('gorra');
  });

  it('sin maxLength → limita a 150 caracteres', () => {
    // Act
    render(<SearchBox onBuscar={vi.fn()} />);

    // Assert
    expect(screen.getByRole('searchbox')).toHaveAttribute('maxLength', '150');
  });

  it('con maxLength → usa ese límite', () => {
    // Act
    render(<SearchBox maxLength={100} onBuscar={vi.fn()} />);

    // Assert
    expect(screen.getByRole('searchbox')).toHaveAttribute('maxLength', '100');
  });
});
