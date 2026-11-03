import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GrupoAtributo } from '../../utils/variantes';
import { VariantSelector } from './VariantSelector';

const grupos: GrupoAtributo[] = [
  {
    idAtributo: 1,
    atributo: 'Talla',
    valores: [
      { idValorAtributo: 10, valor: 'M' },
      { idValorAtributo: 11, valor: 'L' },
    ],
  },
  { idAtributo: 2, atributo: 'Color', valores: [{ idValorAtributo: 20, valor: 'Azul' }] },
];

describe('VariantSelector', () => {
  it('sin grupos → no renderiza nada', () => {
    // Act
    const { container } = render(<VariantSelector grupos={[]} seleccion={{}} onElegir={vi.fn()} />);

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  it('un grupo por atributo, con el valor elegido marcado', () => {
    // Act
    render(<VariantSelector grupos={grupos} seleccion={{ 1: 11, 2: 20 }} onElegir={vi.fn()} />);

    // Assert
    expect(screen.getByRole('group', { name: 'Talla' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'L' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'M' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clic en un valor → emite atributo y valor', async () => {
    // Arrange
    const onElegir = vi.fn();
    render(<VariantSelector grupos={grupos} seleccion={{ 1: 10 }} onElegir={onElegir} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'L' }));

    // Assert
    expect(onElegir).toHaveBeenCalledWith(1, 11);
  });
});
