import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { AuthLayout } from './AuthLayout';

describe('AuthLayout', () => {
  it('muestra la marca con enlace al inicio y la ruta hija dentro de la tarjeta', () => {
    // Arrange
    const router = createMemoryRouter(
      [
        {
          element: <AuthLayout />,
          children: [{ path: '/login', element: <p>Formulario de login</p> }],
        },
      ],
      { initialEntries: ['/login'] },
    );

    // Act
    render(<RouterProvider router={router} />);

    // Assert
    expect(screen.getByRole('link', { name: 'ShopCart' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Formulario de login')).toBeInTheDocument();
  });
});
