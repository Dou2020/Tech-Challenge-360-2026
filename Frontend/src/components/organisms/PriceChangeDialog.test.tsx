import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { VarianteGestion } from '../../types/gestion';
import { PriceChangeDialog } from './PriceChangeDialog';

const variante = { idVariante: 17, sku: 'SUD-M', precio: '249.00' } as VarianteGestion;

function abrir(onConfirmar = vi.fn().mockResolvedValue(undefined), onCancelar = vi.fn()) {
  renderizar(
    <PriceChangeDialog variante={variante} onConfirmar={onConfirmar} onCancelar={onCancelar} />,
  );
  return { onConfirmar, onCancelar };
}

describe('PriceChangeDialog', () => {
  it('muestra el precio actual y "—" mientras el nuevo no es válido', () => {
    // Act
    abrir();

    // Assert
    expect(screen.getByRole('dialog', { name: 'Cambiar el precio de SUD-M' })).toBeInTheDocument();
    expect(screen.getByText(/Q 249.00/)).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('con un precio válido → muestra "anterior → nuevo"', async () => {
    // Arrange
    abrir();

    // Act
    await userEvent.type(screen.getByLabelText('Nuevo precio'), '199.5');

    // Assert
    expect(screen.getByText('Q 199.50')).toBeInTheDocument();
  });

  it.each(['0', '-1', 'abc', '1.234'])(
    'precio inválido (%s) → error y sin llamar a onConfirmar',
    async (valor) => {
      // Arrange
      const { onConfirmar } = abrir();
      await userEvent.type(screen.getByLabelText('Nuevo precio'), valor);

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Cambiar precio' }));

      // Assert
      expect(
        await screen.findByText('Ingresa un precio mayor que 0 con hasta 2 decimales.'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Nuevo precio')).toHaveAttribute('aria-invalid', 'true');
      expect(onConfirmar).not.toHaveBeenCalled();
    },
  );

  it('precio válido → llama a onConfirmar con el texto limpio', async () => {
    // Arrange
    const { onConfirmar } = abrir();
    await userEvent.type(screen.getByLabelText('Nuevo precio'), ' 199.50 ');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar precio' }));

    // Assert
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith('199.50'));
  });

  it('el backend rechaza el precio → muestra su mensaje en el campo', async () => {
    // Arrange
    const onConfirmar = vi
      .fn()
      .mockRejectedValue(new ApiError(400, 'VALIDACION', 'El precio es demasiado alto.'));
    abrir(onConfirmar);
    await userEvent.type(screen.getByLabelText('Nuevo precio'), '99999');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar precio' }));

    // Assert
    expect(await screen.findByText('El precio es demasiado alto.')).toBeInTheDocument();
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Arrange
    abrir(vi.fn().mockRejectedValue(new Error('red')));
    await userEvent.type(screen.getByLabelText('Nuevo precio'), '10');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar precio' }));

    // Assert
    expect(await screen.findByText('No se pudo cambiar el precio.')).toBeInTheDocument();
  });

  it('Cancelar → llama a onCancelar', async () => {
    // Arrange
    const { onCancelar } = abrir();

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('aclara que los pedidos ya hechos conservan su precio', () => {
    // Act
    abrir();

    // Assert
    expect(screen.getByText(/conservan el precio con el que se vendieron/)).toBeInTheDocument();
  });
});
