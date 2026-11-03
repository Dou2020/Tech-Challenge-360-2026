import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { QuantityStepper } from './QuantityStepper';

function Prueba({ inicial = 1, max }: { inicial?: number; max: number }) {
  const [valor, setValor] = useState(inicial);
  return <QuantityStepper valor={valor} onChange={setValor} max={max} />;
}

describe('QuantityStepper', () => {
  it('no permite superar la existencia disponible', async () => {
    // Arrange
    render(<Prueba inicial={2} max={3} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));

    // Assert
    expect(screen.getByLabelText('Cantidad')).toHaveValue(3);
    expect(screen.getByRole('button', { name: 'Aumentar cantidad' })).toBeDisabled();
  });

  it('recorta al tope un valor escrito a mano', async () => {
    // Arrange
    render(<Prueba max={5} />);
    const campo = screen.getByLabelText('Cantidad');

    // Act
    await userEvent.clear(campo);
    await userEvent.type(campo, '99');

    // Assert
    expect(campo).toHaveValue(5);
  });

  it('no baja de 1', () => {
    // Arrange
    render(<Prueba inicial={1} max={5} />);

    // Act
    const disminuir = screen.getByRole('button', { name: 'Disminuir cantidad' });

    // Assert
    expect(disminuir).toBeDisabled();
  });

  it('sin existencia queda deshabilitado', () => {
    // Arrange / Act
    render(<Prueba max={0} />);

    // Assert
    expect(screen.getByLabelText('Cantidad')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aumentar cantidad' })).toBeDisabled();
  });
});
