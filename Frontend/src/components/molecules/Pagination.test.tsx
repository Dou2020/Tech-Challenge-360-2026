import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('muestra el rango y el total', () => {
    // Act
    render(<Pagination page={2} pageSize={12} total={30} onPageChange={vi.fn()} />);

    // Assert
    expect(screen.getByText('Mostrando 13–24 de 30')).toBeInTheDocument();
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
  });

  it('sin resultados → 0–0 de 0 y ambos botones deshabilitados', () => {
    // Act
    render(<Pagination page={1} pageSize={12} total={0} onPageChange={vi.fn()} />);

    // Assert
    expect(screen.getByText('Mostrando 0–0 de 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('última página → el rango termina en el total y no hay siguiente', () => {
    // Act
    render(<Pagination page={3} pageSize={12} total={30} onPageChange={vi.fn()} />);

    // Assert
    expect(screen.getByText('Mostrando 25–30 de 30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('primera página → no hay anterior', () => {
    // Act
    render(<Pagination page={1} pageSize={12} total={30} onPageChange={vi.fn()} />);

    // Assert
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  });

  it('clic en siguiente → pide la página 3', async () => {
    // Arrange
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={12} total={30} onPageChange={onPageChange} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    // Assert
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('clic en anterior → pide la página 1', async () => {
    // Arrange
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={12} total={30} onPageChange={onPageChange} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));

    // Assert
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('sin onPageSizeChange → no muestra el selector de tamaño', () => {
    // Act
    render(<Pagination page={1} pageSize={12} total={30} onPageChange={vi.fn()} />);

    // Assert
    expect(screen.queryByLabelText('Por página')).not.toBeInTheDocument();
  });

  it('cambiar el tamaño → emite el número elegido', async () => {
    // Arrange
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        page={1}
        pageSize={12}
        total={100}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Por página'), '24');

    // Assert
    expect(onPageSizeChange).toHaveBeenCalledWith(24);
  });

  it('tamaño fuera de las opciones → se agrega y queda ordenado', () => {
    // Act
    render(
      <Pagination
        page={1}
        pageSize={20}
        total={100}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    );

    // Assert
    const opciones = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['12', '20', '24', '48']);
  });
});
