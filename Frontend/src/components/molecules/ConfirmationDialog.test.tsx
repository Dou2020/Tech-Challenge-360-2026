import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './ConfirmationDialog';

function dialogo(props: Partial<Parameters<typeof ConfirmationDialog>[0]> = {}) {
  return (
    <ConfirmationDialog
      abierto
      titulo="¿Eliminar?"
      descripcion="No se puede deshacer."
      textoConfirmar="Eliminar"
      onConfirmar={vi.fn()}
      onCancelar={vi.fn()}
      {...props}
    />
  );
}

describe('ConfirmationDialog', () => {
  it('cerrado → no renderiza nada', () => {
    // Act
    render(dialogo({ abierto: false }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abierto → es un diálogo modal con título y descripción', () => {
    // Act
    render(dialogo());

    // Assert
    const caja = screen.getByRole('dialog', { name: '¿Eliminar?' });
    expect(caja).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('No se puede deshacer.')).toBeInTheDocument();
  });

  it('abierto → el foco pasa al primer elemento enfocable del diálogo', () => {
    // Act
    render(dialogo());

    // Assert
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('Escape → cancela', async () => {
    // Arrange
    const onCancelar = vi.fn();
    render(dialogo({ onCancelar }));

    // Act
    await userEvent.keyboard('{Escape}');

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('clic en Confirmar → llama a onConfirmar', async () => {
    // Arrange
    const onConfirmar = vi.fn();
    render(dialogo({ onConfirmar }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    // Assert
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it('clic en Cancelar → llama a onCancelar', async () => {
    // Arrange
    const onCancelar = vi.fn();
    render(dialogo({ onCancelar }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('Tab en el último elemento → el foco vuelve al primero (queda atrapado)', async () => {
    // Arrange
    render(dialogo());
    screen.getByRole('button', { name: 'Eliminar' }).focus();

    // Act
    await userEvent.tab();

    // Assert
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('Shift+Tab en el primer elemento → el foco salta al último', async () => {
    // Arrange
    render(dialogo());
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    // Act
    await userEvent.tab({ shift: true });

    // Assert
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveFocus();
  });

  it('cargando → deshabilita los dos botones', () => {
    // Act
    render(dialogo({ cargando: true }));

    // Assert
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Eliminar/ })).toBeDisabled();
  });

  it('al cerrarse → devuelve el foco al elemento que lo tenía antes', async () => {
    // Arrange
    function Prueba({ abierto }: { abierto: boolean }) {
      return (
        <>
          <button type="button">Abrir</button>
          {dialogo({ abierto })}
        </>
      );
    }
    const { rerender } = render(<Prueba abierto={false} />);
    screen.getByRole('button', { name: 'Abrir' }).focus();
    rerender(<Prueba abierto />);

    // Act
    rerender(<Prueba abierto={false} />);

    // Assert
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
  });
});
