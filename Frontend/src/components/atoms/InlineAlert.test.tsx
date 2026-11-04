import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineAlert } from './InlineAlert';

describe('InlineAlert', () => {
  it('anuncia el mensaje como alerta', () => {
    // Act
    render(<InlineAlert>El correo ya está registrado.</InlineAlert>);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('El correo ya está registrado.');
  });
});
