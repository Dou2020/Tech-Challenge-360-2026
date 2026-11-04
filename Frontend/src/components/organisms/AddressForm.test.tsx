import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import { AddressForm } from './AddressForm';

async function llenarBase() {
  await userEvent.type(screen.getByLabelText('Alias'), 'Casa');
  await userEvent.type(screen.getByLabelText('Nombre del destinatario'), 'Ana López');
  await userEvent.type(screen.getByLabelText('Teléfono'), '5555-1234');
  await userEvent.type(screen.getByLabelText('Dirección'), '5a avenida 10-20');
}

describe('AddressForm', () => {
  it('el municipio depende del departamento elegido', async () => {
    // Arrange
    renderizar(<AddressForm onGuardar={vi.fn()} />);
    const municipio = screen.getByLabelText('Municipio');
    expect(municipio).toBeDisabled();

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Sacatepéquez');

    // Assert
    expect(municipio).toBeEnabled();
    expect(
      within(municipio).getByRole('option', { name: 'Antigua Guatemala' }),
    ).toBeInTheDocument();
    expect(within(municipio).queryByRole('option', { name: 'Mixco' })).not.toBeInTheDocument();
  });

  it('al cambiar de departamento se reinicia el municipio', async () => {
    // Arrange
    renderizar(<AddressForm onGuardar={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
    await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Sacatepéquez');

    // Assert
    expect(screen.getByLabelText('Municipio')).toHaveValue('');
  });

  it('valida teléfono y código postal sin llamar a la API', async () => {
    // Arrange
    const onGuardar = vi.fn();
    renderizar(<AddressForm onGuardar={onGuardar} />);
    await llenarBase();
    await userEvent.clear(screen.getByLabelText('Teléfono'));
    await userEvent.type(screen.getByLabelText('Teléfono'), '123');
    await userEvent.type(screen.getByLabelText('Código postal (opcional)'), '12');
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
    await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    // Assert
    expect(await screen.findByText(/Teléfono inválido/)).toBeInTheDocument();
    expect(screen.getByText('Debe tener 5 dígitos.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono')).toHaveAttribute('aria-invalid', 'true');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('envía solo los opcionales con valor', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    renderizar(<AddressForm onGuardar={onGuardar} />);
    await llenarBase();
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
    await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    // Assert
    await vi.waitFor(() => expect(onGuardar).toHaveBeenCalledOnce());
    expect(onGuardar).toHaveBeenCalledWith({
      alias: 'Casa',
      nombreDestinatario: 'Ana López',
      telefono: '5555-1234',
      linea1: '5a avenida 10-20',
      departamento: 'Guatemala',
      municipio: 'Mixco',
    });
  });

  it('muestra los details de la API en el campo correspondiente', async () => {
    // Arrange
    const onGuardar = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, 'VALIDACION', 'Datos inválidos.', [
          { field: 'linea1', message: 'La dirección ya existe.' },
        ]),
      );
    renderizar(<AddressForm onGuardar={onGuardar} />);
    await llenarBase();
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
    await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    // Assert
    const campo = await screen.findByLabelText('Dirección');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('La dirección ya existe.');
  });
});
