import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { crearPedidoDetalle } from '../../test/fixtures/pedidos';
import { renderizar } from '../../test/renderizar';
import { ReturnForm } from './ReturnForm';

const linea = { ...crearPedidoDetalle().lineas[0]!, cantidadDevolvible: 2 };

describe('ReturnForm', () => {
  it('respeta el tope por línea y exige motivo', async () => {
    // Arrange
    const onEnviar = vi.fn();
    renderizar(<ReturnForm lineas={[linea]} onEnviar={onEnviar} />);

    // Act
    await userEvent.type(screen.getByLabelText(/Camiseta/), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }));

    // Assert
    expect(await screen.findByText('Máximo 2.')).toBeInTheDocument();
    expect(screen.getByText('Indica el motivo.')).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('exige al menos una línea con unidades', async () => {
    // Arrange
    renderizar(<ReturnForm lineas={[linea]} onEnviar={vi.fn()} />);

    // Act
    await userEvent.type(screen.getByLabelText('Motivo de la devolución'), 'Defecto');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }));

    // Assert
    expect(
      await screen.findByText('Indica la cantidad de al menos una línea.'),
    ).toBeInTheDocument();
  });

  it('envía solo las líneas con cantidad tras confirmar', async () => {
    // Arrange
    const onEnviar = vi.fn().mockResolvedValue(undefined);
    renderizar(<ReturnForm lineas={[linea]} onEnviar={onEnviar} />);
    await userEvent.type(screen.getByLabelText(/Camiseta/), '1');
    await userEvent.type(screen.getByLabelText('Motivo de la devolución'), 'Talla incorrecta');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }));

    // Act
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(
      dialogo.querySelector<HTMLButtonElement>('button:last-of-type') as HTMLButtonElement,
    );

    // Assert
    await waitFor(() =>
      expect(onEnviar).toHaveBeenCalledWith({
        motivo: 'Talla incorrecta',
        lineas: [{ idPedidoDetalle: 3021, cantidad: 1 }],
      }),
    );
  });

  it('un 422 CANTIDAD_DEVOLUCION_EXCEDIDA muestra un mensaje claro', async () => {
    // Arrange
    const onEnviar = vi
      .fn()
      .mockRejectedValue(new ApiError(422, 'CANTIDAD_DEVOLUCION_EXCEDIDA', 'Excede.'));
    renderizar(<ReturnForm lineas={[linea]} onEnviar={onEnviar} />);
    await userEvent.type(screen.getByLabelText(/Camiseta/), '1');
    await userEvent.type(screen.getByLabelText('Motivo de la devolución'), 'Defecto');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }));
    const dialogo = await screen.findByRole('dialog');

    // Act
    await userEvent.click(
      dialogo.querySelector<HTMLButtonElement>('button:last-of-type') as HTMLButtonElement,
    );

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('supera lo que queda por devolver');
  });

  async function enviarConError(error: unknown, onCancelar?: () => void) {
    const onEnviar = vi.fn().mockRejectedValue(error);
    renderizar(
      <ReturnForm lineas={[linea]} onEnviar={onEnviar} {...(onCancelar ? { onCancelar } : {})} />,
    );
    await userEvent.type(screen.getByLabelText(/Camiseta/), '1');
    await userEvent.type(screen.getByLabelText('Motivo de la devolución'), 'Defecto');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(
      dialogo.querySelector<HTMLButtonElement>('button:last-of-type') as HTMLButtonElement,
    );
  }

  it('todas las unidades ya devueltas → lo indica y no muestra formulario', () => {
    // Act
    renderizar(<ReturnForm lineas={[{ ...linea, cantidadDevolvible: 0 }]} onEnviar={vi.fn()} />);

    // Assert
    expect(
      screen.getByText('Todas las unidades de este pedido ya se devolvieron.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Motivo de la devolución')).not.toBeInTheDocument();
  });

  it('un 409 TRANSICION_NO_PERMITIDA → explica que el estado cambió', async () => {
    // Act
    await enviarConError(new ApiError(409, 'TRANSICION_NO_PERMITIDA', 'No permitida.'));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('ya no admite devoluciones');
  });

  it('otro error de la API → muestra su mensaje', async () => {
    // Act
    await enviarConError(new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Falla del servidor.');
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Act
    await enviarConError(new Error('red'));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo registrar la devolución.',
    );
  });

  it('details sobre el motivo → quedan en el campo motivo', async () => {
    // Act
    await enviarConError(
      new ApiError(400, 'VALIDACION', 'Inválido', [
        { field: 'motivo', message: 'Motivo demasiado vago.' },
      ]),
    );

    // Assert
    expect(await screen.findByLabelText('Motivo de la devolución')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText('Motivo demasiado vago.')).toBeInTheDocument();
  });

  it('cantidad decimal → error "Debe ser un entero." y sin enviar', async () => {
    // Arrange
    const onEnviar = vi.fn();
    renderizar(<ReturnForm lineas={[linea]} onEnviar={onEnviar} />);
    await userEvent.type(screen.getByLabelText(/Camiseta/), '1.5');
    await userEvent.type(screen.getByLabelText('Motivo de la devolución'), 'Defecto');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }));

    // Assert
    expect(await screen.findByText('Debe ser un entero.')).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('cancelar el diálogo de confirmación → no envía', async () => {
    // Arrange
    const onEnviar = vi.fn();
    renderizar(<ReturnForm lineas={[linea]} onEnviar={onEnviar} />);
    await userEvent.type(screen.getByLabelText(/Camiseta/), '1');
    await userEvent.type(screen.getByLabelText('Motivo de la devolución'), 'Defecto');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }));
    const dialogo = await screen.findByRole('dialog');

    // Act
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('botón Cancelar del formulario → llama a onCancelar', async () => {
    // Arrange
    const onCancelar = vi.fn();
    renderizar(<ReturnForm lineas={[linea]} onEnviar={vi.fn()} onCancelar={onCancelar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
