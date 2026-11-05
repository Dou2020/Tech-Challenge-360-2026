import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { Atributo, VarianteGestion } from '../../types/gestion';
import { VariantForm } from './VariantForm';

const atributos: Atributo[] = [
  {
    idAtributo: 1,
    nombre: 'Talla',
    cantidadValores: 2,
    valores: [
      { idValorAtributo: 5, valor: 'M', cantidadVariantes: 0 },
      { idValorAtributo: 6, valor: 'L', cantidadVariantes: 0 },
    ],
  },
];

const existente = {
  idVariante: 17,
  sku: 'SUD-M',
  precio: '249.00',
  valores: [{ idAtributo: 1, atributo: 'Talla', idValorAtributo: 5, valor: 'M' }],
} as VarianteGestion;

function montar(props: Partial<Parameters<typeof VariantForm>[0]> = {}) {
  const acciones = { onGuardar: vi.fn().mockResolvedValue(undefined), onCancelar: vi.fn() };
  renderizar(<VariantForm atributos={atributos} {...acciones} {...props} />);
  return acciones;
}

describe('VariantForm', () => {
  it('crear → pide SKU, precio y existencia y envía los valores como IDs', async () => {
    // Arrange
    const { onGuardar } = montar();
    await userEvent.type(screen.getByLabelText('SKU'), 'SUD-L');
    await userEvent.type(screen.getByLabelText('Precio'), '259.00');
    await userEvent.type(screen.getByLabelText('Existencia inicial'), '4');
    await userEvent.selectOptions(screen.getByLabelText('Talla'), 'L');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        sku: 'SUD-L',
        precio: '259.00',
        existenciaInicial: 4,
        valores: [6],
      }),
    );
  });

  it('existencia vacía → se envía como 0', async () => {
    // Arrange
    const { onGuardar } = montar();
    await userEvent.type(screen.getByLabelText('SKU'), 'SUD-L');
    await userEvent.type(screen.getByLabelText('Precio'), '259');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith(
        expect.objectContaining({ existenciaInicial: 0, valores: [] }),
      ),
    );
  });

  it('formulario vacío → errores por campo con aria-invalid y sin guardar', async () => {
    // Arrange
    const { onGuardar } = montar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));

    // Assert
    expect(await screen.findByText('Ingresa el SKU.')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Precio')).toHaveAttribute('aria-invalid', 'true');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('editar → no muestra precio ni existencia, precarga SKU y valor y envía los valores', async () => {
    // Arrange
    const { onGuardar } = montar({ variante: existente });
    expect(screen.queryByLabelText('Precio')).not.toBeInTheDocument();
    expect(screen.getByLabelText('SKU')).toHaveValue('SUD-M');
    expect(screen.getByLabelText('Talla')).toHaveValue('5');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar variante' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith(
        expect.objectContaining({ sku: 'SUD-M', valores: [5] }),
      ),
    );
  });

  it('409 DUPLICADO → mensaje en el campo SKU', async () => {
    // Arrange
    montar({ onGuardar: vi.fn().mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.')) });
    await userEvent.type(screen.getByLabelText('SKU'), 'SUD-L');
    await userEvent.type(screen.getByLabelText('Precio'), '259');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));

    // Assert
    expect(await screen.findByText('Ya existe una variante con ese SKU.')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU')).toHaveAttribute('aria-invalid', 'true');
  });

  it('details del backend → cada mensaje queda en su campo', async () => {
    // Arrange
    montar({
      onGuardar: vi
        .fn()
        .mockRejectedValue(
          new ApiError(400, 'VALIDACION', 'Inválido', [
            { field: 'precio', message: 'Precio fuera de rango.' },
          ]),
        ),
    });
    await userEvent.type(screen.getByLabelText('SKU'), 'SUD-L');
    await userEvent.type(screen.getByLabelText('Precio'), '259');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));

    // Assert
    expect(await screen.findByText('Precio fuera de rango.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('otro error de la API → alerta con su mensaje', async () => {
    // Arrange
    montar({
      onGuardar: vi
        .fn()
        .mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.')),
    });
    await userEvent.type(screen.getByLabelText('SKU'), 'SUD-L');
    await userEvent.type(screen.getByLabelText('Precio'), '259');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Falla del servidor.');
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Arrange
    montar({ onGuardar: vi.fn().mockRejectedValue(new Error('red')) });
    await userEvent.type(screen.getByLabelText('SKU'), 'SUD-L');
    await userEvent.type(screen.getByLabelText('Precio'), '259');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la variante.');
  });

  it('sin atributos → indica cómo crearlos', () => {
    // Act
    montar({ atributos: [] });

    // Assert
    expect(screen.getByText(/Aún no hay atributos/)).toBeInTheDocument();
  });

  it('Cancelar → llama a onCancelar', async () => {
    // Arrange
    const { onCancelar } = montar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
