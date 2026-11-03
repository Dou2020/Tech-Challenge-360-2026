import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderizar } from '../../test/renderizar';
import NoEncontradoPage from './NoEncontradoPage';

describe('NoEncontradoPage', () => {
  it('muestra el 404 y un enlace para volver al inicio', () => {
    // Act
    renderizar(<NoEncontradoPage />);

    // Assert
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});
