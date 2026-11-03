import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('en carga no cambia su nombre accesible, se marca ocupado y no se puede pulsar', () => {
    // Arrange / Act
    render(<Button cargando>Guardar</Button>);

    // Assert
    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).toHaveAttribute('aria-busy', 'true');
    expect(boton).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
