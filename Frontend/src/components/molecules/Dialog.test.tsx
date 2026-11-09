import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

function dialogo(props: Partial<Parameters<typeof Dialog>[0]> = {}) {
  return (
    <Dialog abierto titulo="Registrar movimiento" onCerrar={vi.fn()} {...props}>
      <input aria-label="Cantidad" />
      <button type="button">Guardar</button>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('cerrado → no renderiza nada', () => {
    // Act
    render(dialogo({ abierto: false }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abierto → diálogo modal con su título, descripción y contenido', () => {
    // Act
    render(dialogo({ descripcion: 'SKU CAM-01' }));

    // Assert
    const caja = screen.getByRole('dialog', { name: 'Registrar movimiento' });
    expect(caja).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('SKU CAM-01')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad')).toBeInTheDocument();
  });

  it('abierto → el foco pasa al primer control del contenido', () => {
    // Act
    render(dialogo());

    // Assert
    expect(screen.getByLabelText('Cantidad')).toHaveFocus();
  });

  it('Escape → llama a onCerrar', async () => {
    // Arrange
    const onCerrar = vi.fn();
    render(dialogo({ onCerrar }));

    // Act
    await userEvent.keyboard('{Escape}');

    // Assert
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('clic en la capa de fondo → llama a onCerrar', async () => {
    // Arrange
    const onCerrar = vi.fn();
    render(dialogo({ onCerrar }));
    const capa = screen.getByRole('dialog').previousElementSibling as HTMLElement;

    // Act
    await userEvent.click(capa);

    // Assert
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('clic dentro de la caja → no cierra', async () => {
    // Arrange
    const onCerrar = vi.fn();
    render(dialogo({ onCerrar }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    // Assert
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('Tab en el último control → vuelve al primero', async () => {
    // Arrange
    render(dialogo());
    screen.getByRole('button', { name: 'Guardar' }).focus();

    // Act
    await userEvent.tab();

    // Assert
    expect(screen.getByLabelText('Cantidad')).toHaveFocus();
  });

  it('Shift+Tab en el primer control → salta al último', async () => {
    // Arrange
    render(dialogo());

    // Act
    await userEvent.tab({ shift: true });

    // Assert
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
  });

  it('ancho lg → caja más ancha que la de md', () => {
    // Act
    render(dialogo({ ancho: 'lg' }));

    // Assert
    expect(screen.getByRole('dialog')).toHaveClass('max-w-2xl');
  });

  it('al cerrarse → devuelve el foco a donde estaba', () => {
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
