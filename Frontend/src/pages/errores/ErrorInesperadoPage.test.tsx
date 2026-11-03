import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorInesperadoPage from './ErrorInesperadoPage';

function montar(error: unknown) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <p>Normal</p>,
      loader: () => {
        throw error;
      },
      errorElement: <ErrorInesperadoPage />,
      hydrateFallbackElement: <p>Cargando</p>,
    },
  ]);
  render(<RouterProvider router={router} />);
}

describe('ErrorInesperadoPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('error cualquiera → ofrece volver al inicio', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act
    montar(new Error('falló'));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('falla la descarga de un chunk → ofrece recargar', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act
    montar(new TypeError('Failed to fetch dynamically imported module: /x.js'));

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'No se pudo cargar la página' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
  });

  it('respuesta de error de una ruta (404) → muestra el estado HTTP y vuelve al inicio', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act
    montar(new Response(null, { status: 404, statusText: 'Not Found' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Error 404' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recargar' })).not.toBeInTheDocument();
  });

  it('click en "Recargar" → recarga la página', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    montar(new TypeError('Importing a module script failed.'));
    const boton = await screen.findByRole('button', { name: 'Recargar' });

    // Act
    await userEvent.click(boton);

    // Assert
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
