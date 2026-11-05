import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import type { ParametroConfiguracion } from '../../types/administracion';
import { ConfigParameterRow } from './ConfigParameterRow';

const parametro: ParametroConfiguracion = {
  idConfiguracion: 1,
  clave: 'MinutosReserva',
  valor: '15',
  descripcion: 'Minutos que dura la reserva',
};

describe('ConfigParameterRow', () => {
  it('muestra clave, descripción, valor y la ayuda del rango', () => {
    // Act
    render(<ConfigParameterRow parametro={parametro} onGuardar={vi.fn()} />);

    // Assert
    expect(screen.getByText('MinutosReserva')).toBeInTheDocument();
    expect(screen.getByText('Minutos que dura la reserva')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor de MinutosReserva')).toHaveValue('15');
    expect(screen.getByText('Entero de 1 a 120 minutos.')).toBeInTheDocument();
  });

  it('sin descripción → no la muestra', () => {
    // Act
    render(
      <ConfigParameterRow parametro={{ ...parametro, descripcion: null }} onGuardar={vi.fn()} />,
    );

    // Assert
    expect(screen.queryByText('Minutos que dura la reserva')).not.toBeInTheDocument();
  });

  it('valor válido → llama a onGuardar con el texto limpio y muestra "Guardado"', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    render(<ConfigParameterRow parametro={parametro} onGuardar={onGuardar} />);
    const campo = screen.getByLabelText('Valor de MinutosReserva');
    await userEvent.clear(campo);
    await userEvent.type(campo, ' 20 ');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar MinutosReserva' }));

    // Assert
    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith('MinutosReserva', '20'));
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
  });

  it('editar después de guardar → quita el "Guardado"', async () => {
    // Arrange
    render(
      <ConfigParameterRow parametro={parametro} onGuardar={vi.fn().mockResolvedValue(undefined)} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar MinutosReserva' }));
    await screen.findByText('Guardado');

    // Act
    await userEvent.type(screen.getByLabelText('Valor de MinutosReserva'), '0');

    // Assert
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('valor inválido → error con aria-invalid y sin llamar a onGuardar', async () => {
    // Arrange
    const onGuardar = vi.fn();
    render(<ConfigParameterRow parametro={parametro} onGuardar={onGuardar} />);
    const campo = screen.getByLabelText('Valor de MinutosReserva');
    await userEvent.clear(campo);
    await userEvent.type(campo, '500');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar MinutosReserva' }));

    // Assert
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findAllByText('Entero de 1 a 120 minutos.')).not.toHaveLength(0);
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('valor vacío → "Es obligatorio."', async () => {
    // Arrange
    render(<ConfigParameterRow parametro={parametro} onGuardar={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText('Valor de MinutosReserva'));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar MinutosReserva' }));

    // Assert
    expect(await screen.findByText('Es obligatorio.')).toBeInTheDocument();
  });

  it.each([
    [new ApiError(400, 'VALIDACION', 'El backend lo rechazó.'), 'El backend lo rechazó.'],
    [new Error('red'), 'No se pudo guardar el parámetro.'],
  ])('onGuardar falla (%#) → muestra el mensaje en el campo', async (error, mensaje) => {
    // Arrange
    render(
      <ConfigParameterRow parametro={parametro} onGuardar={vi.fn().mockRejectedValue(error)} />,
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar MinutosReserva' }));

    // Assert
    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('el servidor devuelve otro valor (otra pestaña) → el campo lo adopta', () => {
    // Arrange
    const { rerender } = render(<ConfigParameterRow parametro={parametro} onGuardar={vi.fn()} />);

    // Act
    rerender(<ConfigParameterRow parametro={{ ...parametro, valor: '30' }} onGuardar={vi.fn()} />);

    // Assert
    expect(screen.getByLabelText('Valor de MinutosReserva')).toHaveValue('30');
  });

  it('parámetro sin reglas → sin texto de ayuda', () => {
    // Act
    render(
      <ConfigParameterRow
        parametro={{ ...parametro, clave: 'NombreTienda', valor: 'X' }}
        onGuardar={vi.fn()}
      />,
    );

    // Assert
    expect(screen.queryByText(/Entero/)).not.toBeInTheDocument();
  });
});
