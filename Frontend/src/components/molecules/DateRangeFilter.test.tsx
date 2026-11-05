import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateRangeFilter } from './DateRangeFilter';

function filtro(props: Partial<Parameters<typeof DateRangeFilter>[0]> = {}) {
  const acciones = { onCambiar: vi.fn(), onRestablecer: vi.fn() };
  render(
    <DateRangeFilter
      desde="2026-11-01"
      hasta="2026-11-30"
      valido
      esPorDefecto
      {...acciones}
      {...props}
    />,
  );
  return acciones;
}

describe('DateRangeFilter', () => {
  it('muestra el rango recibido', () => {
    // Act
    filtro();

    // Assert
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-11-30');
  });

  it('rango por defecto → no ofrece "Últimos 30 días"', () => {
    // Act
    filtro();

    // Assert
    expect(screen.queryByRole('button', { name: 'Últimos 30 días' })).not.toBeInTheDocument();
  });

  it('rango inválido → error en "Hasta" con aria-invalid', () => {
    // Act
    filtro({ valido: false });

    // Assert
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Debe ser igual o posterior a la fecha inicial.')).toBeInTheDocument();
  });

  it('cambiar "Desde" → emite solo desde', async () => {
    // Arrange
    const { onCambiar } = filtro({ desde: '' });

    // Act
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-05');

    // Assert
    expect(onCambiar).toHaveBeenLastCalledWith({ desde: '2026-10-05' });
  });

  it('cambiar "Hasta" → emite solo hasta', async () => {
    // Arrange
    const { onCambiar } = filtro({ hasta: '' });

    // Act
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-12-01');

    // Assert
    expect(onCambiar).toHaveBeenLastCalledWith({ hasta: '2026-12-01' });
  });

  it('rango distinto del defecto → "Últimos 30 días" restablece', async () => {
    // Arrange
    const { onRestablecer } = filtro({ esPorDefecto: false });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Últimos 30 días' }));

    // Assert
    expect(onRestablecer).toHaveBeenCalledTimes(1);
  });
});
