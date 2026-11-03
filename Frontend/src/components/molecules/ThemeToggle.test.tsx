import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CLAVE_TEMA } from '../../utils/tema';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('sin preferencia guardada marca "Tema del sistema"', () => {
    // Act
    render(<ThemeToggle />);

    // Assert
    expect(screen.getByRole('group', { name: 'Tema' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tema del sistema' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Tema oscuro' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('al elegir "Tema oscuro" queda marcado y la página pasa a oscuro', async () => {
    // Arrange
    render(<ThemeToggle />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Tema oscuro' }));

    // Assert
    expect(screen.getByRole('button', { name: 'Tema oscuro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement).toHaveClass('dark');
  });

  it('muestra la preferencia guardada al montarse', () => {
    // Arrange
    localStorage.setItem(CLAVE_TEMA, 'claro');

    // Act
    render(<ThemeToggle />);

    // Assert
    expect(screen.getByRole('button', { name: 'Tema claro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
