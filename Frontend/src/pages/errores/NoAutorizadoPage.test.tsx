import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderizar } from '../../test/renderizar';
import NoAutorizadoPage from './NoAutorizadoPage';

describe('NoAutorizadoPage', () => {
  it('muestra el 403 y un enlace para volver al inicio', () => {
    // Act
    renderizar(<NoAutorizadoPage />);

    // Assert
    expect(
      screen.getByRole('heading', { name: 'No tienes acceso a esta sección' }),
    ).toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});
