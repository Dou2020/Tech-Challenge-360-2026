import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { crearTarjeta } from '../../test/fixtures/tarjetas';
import { renderizar } from '../../test/renderizar';
import { PaymentForm } from './PaymentForm';

const visa = crearTarjeta();
const master = crearTarjeta({
  idTarjeta: 4,
  marca: 'MASTERCARD',
  tipo: 'DEBITO',
  ultimos4: '1111',
  predeterminada: false,
});

describe('PaymentForm con tarjetas', () => {
  it('con tarjetas guardadas → la predeterminada viene elegida y paga con su idTarjeta', async () => {
    // Arrange
    const onPagar = vi.fn().mockResolvedValue(undefined);
    renderizar(<PaymentForm onPagar={onPagar} tarjetas={[visa, master]} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(
      screen.getByRole('radio', { name: 'VISA · Crédito •••• 4242 — Ana López' }),
    ).toBeChecked();
    expect(screen.queryByLabelText('Titular de la tarjeta')).not.toBeInTheDocument();
    await waitFor(() => expect(onPagar).toHaveBeenCalledWith({ idTarjeta: 3 }));
  });

  async function otraTarjetaConGuardar(onPagar: () => Promise<unknown>) {
    renderizar(<PaymentForm onPagar={onPagar} tarjetas={[visa]} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Usar otra tarjeta' }));
    await userEvent.type(screen.getByLabelText('Titular de la tarjeta'), 'Luis Pérez');
    await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), '5555');
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Guardar esta tarjeta para próximas compras' }),
    );
  }

  it('guardar sin tipo ni marca → mensajes por campo y no paga', async () => {
    // Arrange
    const onPagar = vi.fn();
    await otraTarjetaConGuardar(onPagar);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(await screen.findByText('Elige crédito o débito.')).toBeInTheDocument();
    expect(screen.getByText('Elige la marca de la tarjeta.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de tarjeta')).toHaveAttribute('aria-invalid', 'true');
    expect(onPagar).not.toHaveBeenCalled();
  });

  it('guardar con tipo y marca → los envía junto con guardar: true', async () => {
    // Arrange
    const onPagar = vi.fn().mockResolvedValue(undefined);
    await otraTarjetaConGuardar(onPagar);
    await userEvent.selectOptions(screen.getByLabelText('Tipo de tarjeta'), 'DEBITO');
    await userEvent.selectOptions(screen.getByLabelText('Marca'), 'MASTERCARD');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    await waitFor(() =>
      expect(onPagar).toHaveBeenCalledWith({
        titular: 'Luis Pérez',
        ultimos4: '5555',
        tipo: 'DEBITO',
        marca: 'MASTERCARD',
        guardar: true,
      }),
    );
  });

  it('elegir otra guardada → paga con el idTarjeta de esa', async () => {
    // Arrange
    const onPagar = vi.fn().mockResolvedValue(undefined);
    renderizar(<PaymentForm onPagar={onPagar} tarjetas={[visa, master]} />);
    await userEvent.click(
      screen.getByRole('radio', { name: 'Mastercard · Débito •••• 1111 — Ana López' }),
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    await waitFor(() => expect(onPagar).toHaveBeenCalledWith({ idTarjeta: 4 }));
  });

  it('sin tarjetas → muestra el formulario de siempre con los campos nuevos y sin radios', () => {
    // Act
    renderizar(<PaymentForm onPagar={vi.fn()} />);

    // Assert
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Titular de la tarjeta')).toBeInTheDocument();
    expect(screen.getByLabelText('Últimos 4 dígitos de la tarjeta')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de tarjeta')).toBeInTheDocument();
    expect(screen.getByLabelText('Marca')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Guardar esta tarjeta para próximas compras' }),
    ).not.toBeChecked();
  });

  it('con una guardada preseleccionada, "Usar otra tarjeta" → muestra los campos de tarjeta nueva', async () => {
    // Arrange
    renderizar(<PaymentForm onPagar={vi.fn()} tarjetas={[visa]} />);

    // Act
    await userEvent.click(screen.getByRole('radio', { name: 'Usar otra tarjeta' }));

    // Assert
    expect(screen.getByLabelText('Titular de la tarjeta')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de tarjeta')).toBeInTheDocument();
    expect(screen.getByLabelText('Marca')).toBeInTheDocument();
  });

  it('volver a una guardada tras "Usar otra tarjeta" → oculta los campos', async () => {
    // Arrange
    renderizar(<PaymentForm onPagar={vi.fn()} tarjetas={[visa]} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Usar otra tarjeta' }));

    // Act
    await userEvent.click(
      screen.getByRole('radio', { name: 'VISA · Crédito •••• 4242 — Ana López' }),
    );

    // Assert
    expect(screen.queryByLabelText('Titular de la tarjeta')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tipo de tarjeta')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Marca')).not.toBeInTheDocument();
  });

  it('"Usar otra tarjeta" sin datos → valida titular y últimos 4 y no paga', async () => {
    // Arrange
    const onPagar = vi.fn();
    renderizar(<PaymentForm onPagar={onPagar} tarjetas={[visa]} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Usar otra tarjeta' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    expect(await screen.findByText('Ingresa el nombre del titular.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa exactamente 4 dígitos.')).toBeInTheDocument();
    expect(onPagar).not.toHaveBeenCalled();
  });

  it('sin guardar y sin tipo ni marca → paga solo con titular y últimos 4', async () => {
    // Arrange
    const onPagar = vi.fn().mockResolvedValue(undefined);
    await otraTarjetaConGuardar(onPagar);
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Guardar esta tarjeta para próximas compras' }),
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    await waitFor(() =>
      expect(onPagar).toHaveBeenCalledWith({ titular: 'Luis Pérez', ultimos4: '5555' }),
    );
  });

  it('sin guardar pero con tipo y marca → los envía igualmente, sin guardar', async () => {
    // Arrange
    const onPagar = vi.fn().mockResolvedValue(undefined);
    await otraTarjetaConGuardar(onPagar);
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Guardar esta tarjeta para próximas compras' }),
    );
    await userEvent.selectOptions(screen.getByLabelText('Tipo de tarjeta'), 'CREDITO');
    await userEvent.selectOptions(screen.getByLabelText('Marca'), 'VISA');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    // Assert
    await waitFor(() =>
      expect(onPagar).toHaveBeenCalledWith({
        titular: 'Luis Pérez',
        ultimos4: '5555',
        tipo: 'CREDITO',
        marca: 'VISA',
      }),
    );
  });
});
