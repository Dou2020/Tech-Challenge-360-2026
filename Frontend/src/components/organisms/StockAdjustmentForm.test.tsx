import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import { StockAdjustmentForm } from './StockAdjustmentForm';

const variante = {
  idVariante: 41,
  sku: 'CAM-BAS-M-AZ',
  producto: 'Camiseta',
  descripcion: null,
  existenciaFisica: 9,
  existenciaDisponible: 7,
};

describe('StockAdjustmentForm', () => {
  it('una entrada por compra no exige motivo', async () => {
    // Arrange
    const onEnviar = vi.fn().mockResolvedValue(undefined);
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);

    // Act
    await userEvent.type(screen.getByLabelText('Cantidad'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    // Assert
    await waitFor(() =>
      expect(onEnviar).toHaveBeenCalledWith({ clase: 'ENTRADA_COMPRA', cantidad: 5, motivo: '' }),
    );
  });

  it('un ajuste exige motivo', async () => {
    // Arrange
    const onEnviar = vi.fn();
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);
    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'Ajuste de salida');
    await userEvent.type(screen.getByLabelText('Cantidad'), '3');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    // Assert
    expect(await screen.findByText('El motivo es obligatorio en un ajuste.')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveAttribute('aria-invalid', 'true');
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('un 422 EXISTENCIA_NEGATIVA se muestra en el campo cantidad', async () => {
    // Arrange
    const onEnviar = vi
      .fn()
      .mockRejectedValue(new ApiError(422, 'EXISTENCIA_NEGATIVA', 'Existencia negativa.'));
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);
    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'Ajuste de salida');
    await userEvent.type(screen.getByLabelText('Cantidad'), '10');
    await userEvent.type(screen.getByLabelText('Motivo'), 'Dañado');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    // Assert
    expect(await screen.findByText(/dejaría la existencia en negativo/)).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad')).toHaveAttribute('aria-invalid', 'true');
  });

  async function enviarCon(cantidad: string, motivo = 'Merma', tipo = 'Ajuste de salida') {
    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), tipo);
    if (cantidad) await userEvent.type(screen.getByLabelText('Cantidad'), cantidad);
    if (motivo) await userEvent.type(screen.getByLabelText('Motivo'), motivo);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
  }

  it.each(['0', '-3', '2.5'])('cantidad inválida (%s) → error y sin enviar', async (cantidad) => {
    // Arrange
    const onEnviar = vi.fn();
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);

    // Act
    await enviarCon(cantidad);

    // Assert
    expect(await screen.findByText('Debe ser un entero mayor que 0.')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad')).toHaveAttribute('aria-invalid', 'true');
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('cantidad por encima del máximo → error y sin enviar', async () => {
    // Arrange
    const onEnviar = vi.fn();
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);

    // Act
    await enviarCon('1000001');

    // Assert
    expect(await screen.findByText(/Máximo .* unidades por movimiento/)).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('ajuste de entrada → envía la clase AJUSTE_ENTRADA con motivo', async () => {
    // Arrange
    const onEnviar = vi.fn().mockResolvedValue(undefined);
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);

    // Act
    await enviarCon('4', 'Conteo físico', 'Ajuste de entrada');

    // Assert
    await waitFor(() =>
      expect(onEnviar).toHaveBeenCalledWith({
        clase: 'AJUSTE_ENTRADA',
        cantidad: 4,
        motivo: 'Conteo físico',
      }),
    );
  });

  it('muestra producto, SKU y existencias de la variante', () => {
    // Act
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={vi.fn()} />);

    // Assert
    expect(
      screen.getByText(/Camiseta · SKU CAM-BAS-M-AZ · física 9, disponible 7/),
    ).toBeInTheDocument();
  });

  it('error genérico de la API → alerta con su mensaje', async () => {
    // Arrange
    const onEnviar = vi
      .fn()
      .mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'));
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);

    // Act
    await enviarCon('3');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Falla del servidor.');
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Arrange
    const onEnviar = vi.fn().mockRejectedValue(new Error('red'));
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);

    // Act
    await enviarCon('3');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo registrar el movimiento.',
    );
  });

  it('details del backend → cada mensaje queda en su campo', async () => {
    // Arrange
    const onEnviar = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, 'VALIDACION', 'Inválido', [
          { field: 'motivo', message: 'Motivo no permitido.' },
        ]),
      );
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);

    // Act
    await enviarCon('3');

    // Assert
    expect(await screen.findByText('Motivo no permitido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveAttribute('aria-invalid', 'true');
  });

  it('envío correcto → limpia el formulario', async () => {
    // Arrange
    renderizar(
      <StockAdjustmentForm variante={variante} onEnviar={vi.fn().mockResolvedValue(undefined)} />,
    );

    // Act
    await enviarCon('3');

    // Assert
    await waitFor(() => expect(screen.getByLabelText('Cantidad')).toHaveValue(null));
  });

  it('botón Cerrar → llama a onCancelar', async () => {
    // Arrange
    const onCancelar = vi.fn();
    renderizar(
      <StockAdjustmentForm variante={variante} onEnviar={vi.fn()} onCancelar={onCancelar} />,
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
  it('con descripción → la muestra junto al producto', () => {
    // Act
    renderizar(
      <StockAdjustmentForm
        variante={{ ...variante, descripcion: 'Talla M · Azul' }}
        onEnviar={vi.fn()}
      />,
    );

    // Assert
    expect(screen.getByText(/Camiseta · Talla M · Azul · SKU CAM-BAS-M-AZ/)).toBeInTheDocument();
  });

  it('sin cantidad válida → no muestra la vista previa', async () => {
    // Arrange
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={vi.fn()} />);

    // Act
    await userEvent.type(screen.getByLabelText('Cantidad'), '0');

    // Assert
    expect(screen.queryByText(/Quedaría/)).not.toBeInTheDocument();
  });

  it('entrada por compra → la vista previa suma a física y disponible', async () => {
    // Arrange
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={vi.fn()} />);

    // Act
    await userEvent.type(screen.getByLabelText('Cantidad'), '5');

    // Assert
    expect(screen.getByText('Quedaría: física 9 → 14, disponible 7 → 12.')).toBeInTheDocument();
  });

  it('ajuste de salida → la vista previa resta, sin aviso si alcanza', async () => {
    // Arrange
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'Ajuste de salida');

    // Act
    await userEvent.type(screen.getByLabelText('Cantidad'), '7');

    // Assert
    expect(screen.getByText('Quedaría: física 9 → 2, disponible 7 → 0.')).toBeInTheDocument();
    expect(screen.queryByText(/supera lo disponible/)).not.toBeInTheDocument();
  });

  it('salida mayor que lo disponible → avisa pero deja enviar', async () => {
    // Arrange: el envío queda pendiente para que el formulario no se limpie
    const onEnviar = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderizar(<StockAdjustmentForm variante={variante} onEnviar={onEnviar} />);

    // Act
    await enviarCon('8');

    // Assert
    expect(screen.getByText(/La salida supera lo disponible \(7\)/)).toBeInTheDocument();
    await waitFor(() =>
      expect(onEnviar).toHaveBeenCalledWith({
        clase: 'AJUSTE_SALIDA',
        cantidad: 8,
        motivo: 'Merma',
      }),
    );
  });
});
