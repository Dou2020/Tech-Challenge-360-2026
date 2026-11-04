import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import { CardForm } from './CardForm';

async function llenar(opciones: { tipo?: string; marca?: string } = {}) {
  await userEvent.type(screen.getByLabelText('Titular de la tarjeta'), 'Ana López');
  await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), '4242');
  if (opciones.tipo)
    await userEvent.selectOptions(screen.getByLabelText('Tipo de tarjeta'), opciones.tipo);
  if (opciones.marca) await userEvent.selectOptions(screen.getByLabelText('Marca'), opciones.marca);
}

const guardar = () => userEvent.click(screen.getByRole('button', { name: 'Guardar tarjeta' }));

describe('CardForm', () => {
  it('formulario vacío → mensajes por campo con aria-invalid y sin llamar a onGuardar', async () => {
    // Arrange
    const onGuardar = vi.fn();
    renderizar(<CardForm onGuardar={onGuardar} />);

    // Act
    await guardar();

    // Assert
    expect(await screen.findByText('Ingresa el nombre del titular.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa exactamente 4 dígitos.')).toBeInTheDocument();
    expect(screen.getByText('Elige crédito o débito.')).toBeInTheDocument();
    expect(screen.getByText('Elige la marca de la tarjeta.')).toBeInTheDocument();
    for (const campo of [
      'Titular de la tarjeta',
      'Últimos 4 dígitos de la tarjeta',
      'Tipo de tarjeta',
      'Marca',
    ]) {
      expect(screen.getByLabelText(campo)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it.each(['12', 'abcd', '12a4'])('últimos 4 inválidos (%s) → no guarda', async (ultimos4) => {
    // Arrange
    const onGuardar = vi.fn();
    renderizar(<CardForm onGuardar={onGuardar} />);
    await userEvent.type(screen.getByLabelText('Titular de la tarjeta'), 'Ana López');
    await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), ultimos4);
    await userEvent.selectOptions(screen.getByLabelText('Tipo de tarjeta'), 'CREDITO');
    await userEvent.selectOptions(screen.getByLabelText('Marca'), 'VISA');

    // Act
    await guardar();

    // Assert
    expect(await screen.findByText('Ingresa exactamente 4 dígitos.')).toBeInTheDocument();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('datos válidos → llama a onGuardar con predeterminada en false por omisión', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    renderizar(<CardForm onGuardar={onGuardar} />);
    await llenar({ tipo: 'DEBITO', marca: 'AMEX' });

    // Act
    await guardar();

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        titular: 'Ana López',
        ultimos4: '4242',
        tipo: 'DEBITO',
        marca: 'AMEX',
        predeterminada: false,
      }),
    );
  });

  it('casilla de predeterminada marcada → envía predeterminada: true', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    renderizar(<CardForm onGuardar={onGuardar} />);
    await llenar({ tipo: 'CREDITO', marca: 'VISA' });
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Usar como tarjeta predeterminada' }),
    );

    // Act
    await guardar();

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ predeterminada: true })),
    );
  });

  it.each([
    [
      '409 DUPLICADO',
      new ApiError(409, 'DUPLICADO', 'Ya tienes guardada una tarjeta con esos datos.'),
      'Ya tienes guardada una tarjeta con esos datos.',
    ],
    [
      '402 PAGO_RECHAZADO',
      new ApiError(402, 'PAGO_RECHAZADO', 'La tarjeta fue rechazada.'),
      'La tarjeta fue rechazada.',
    ],
  ])('%s → alerta general con el mensaje del backend', async (_caso, error, mensaje) => {
    // Arrange
    renderizar(<CardForm onGuardar={vi.fn().mockRejectedValue(error)} />);
    await llenar({ tipo: 'CREDITO', marca: 'VISA' });

    // Act
    await guardar();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje);
    expect(screen.getByLabelText('Titular de la tarjeta')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('VALIDACION con details → cada mensaje va a su campo y no hay alerta general', async () => {
    // Arrange
    const error = new ApiError(400, 'VALIDACION', 'Datos inválidos.', [
      { field: 'titular', message: 'El titular no es válido.' },
      { field: 'ultimos4', message: 'Los últimos 4 no son válidos.' },
    ]);
    renderizar(<CardForm onGuardar={vi.fn().mockRejectedValue(error)} />);
    await llenar({ tipo: 'CREDITO', marca: 'VISA' });

    // Act
    await guardar();

    // Assert
    expect(await screen.findByText('El titular no es válido.')).toBeInTheDocument();
    expect(screen.getByText('Los últimos 4 no son válidos.')).toBeInTheDocument();
    expect(screen.getByLabelText('Titular de la tarjeta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Últimos 4 dígitos de la tarjeta')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Arrange
    renderizar(<CardForm onGuardar={vi.fn().mockRejectedValue(new Error('red'))} />);
    await llenar({ tipo: 'CREDITO', marca: 'VISA' });

    // Act
    await guardar();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la tarjeta.');
  });

  it('mientras guarda → el botón queda deshabilitado', async () => {
    // Arrange
    let terminar: () => void = () => undefined;
    const onGuardar = vi.fn(() => new Promise<void>((resolver) => (terminar = resolver)));
    renderizar(<CardForm onGuardar={onGuardar} onCancelar={vi.fn()} />);
    await llenar({ tipo: 'CREDITO', marca: 'VISA' });

    // Act
    await guardar();

    // Assert
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Guardar tarjeta/ })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    terminar();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardar tarjeta' })).toBeEnabled(),
    );
  });

  it('Cancelar → llama a onCancelar', async () => {
    // Arrange
    const onCancelar = vi.fn();
    renderizar(<CardForm onGuardar={vi.fn()} onCancelar={onCancelar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('sin onCancelar → no muestra el botón Cancelar', () => {
    // Act
    renderizar(<CardForm onGuardar={vi.fn()} />);

    // Assert
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });
});
