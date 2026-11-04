import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderizar } from '../../test/renderizar';
import { PaymentForm } from './PaymentForm';

async function llenar(titular: string, ultimos4: string) {
  if (titular) await userEvent.type(screen.getByLabelText('Titular de la tarjeta'), titular);
  if (ultimos4)
    await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), ultimos4);
}

describe('PaymentForm', () => {
  it('datos válidos → llama a onPagar con titular y últimos 4 dígitos', async () => {
    // Arrange
    const onPagar = vi.fn().mockResolvedValue(undefined);
    renderizar(<PaymentForm onPagar={onPagar} />);
    await llenar('Ana López', '4242');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    await waitFor(() =>
      expect(onPagar).toHaveBeenCalledWith({ titular: 'Ana López', ultimos4: '4242' }),
    );
  });

  it('formulario vacío → mensajes por campo con aria-invalid y sin llamar a onPagar', async () => {
    // Arrange
    const onPagar = vi.fn();
    renderizar(<PaymentForm onPagar={onPagar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(await screen.findByText('Ingresa el nombre del titular.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa exactamente 4 dígitos.')).toBeInTheDocument();
    expect(screen.getByLabelText('Titular de la tarjeta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Últimos 4 dígitos de la tarjeta')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onPagar).not.toHaveBeenCalled();
  });

  it.each(['12', 'abcd', '12a4'])('últimos 4 inválidos (%s) → no paga', async (ultimos4) => {
    // Arrange
    const onPagar = vi.fn();
    renderizar(<PaymentForm onPagar={onPagar} />);
    await llenar('Ana López', ultimos4);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(await screen.findByText('Ingresa exactamente 4 dígitos.')).toBeInTheDocument();
    expect(onPagar).not.toHaveBeenCalled();
  });

  it('mientras paga → el botón queda deshabilitado', async () => {
    // Arrange
    let terminar: () => void = () => undefined;
    const onPagar = vi.fn(() => new Promise<void>((resolver) => (terminar = resolver)));
    renderizar(<PaymentForm onPagar={onPagar} />);
    await llenar('Ana López', '4242');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    await waitFor(() => expect(screen.getByRole('button', { name: /Pagar/ })).toBeDisabled());
    terminar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pagar' })).toBeEnabled());
  });

  it('deshabilitado → el botón no se puede usar', () => {
    // Act
    renderizar(<PaymentForm onPagar={vi.fn()} deshabilitado />);

    // Assert
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeDisabled();
  });
});
