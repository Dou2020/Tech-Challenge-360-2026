import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { crearAdmin, crearCliente, crearOperador } from '../../test/fixtures/usuarios';
import { crearAuth, renderizar } from '../../test/renderizar';
import { AccountMenu } from './AccountMenu';

describe('AccountMenu', () => {
  it('sin sesión → no renderiza nada', () => {
    // Act
    renderizar(<AccountMenu />);

    // Assert
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('cerrado → el menú no se ve y el botón indica aria-expanded false', () => {
    // Act
    renderizar(<AccountMenu />, {
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
    });

    // Assert
    expect(screen.getByRole('button', { name: /Ana/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Cliente → ve Mis pedidos, Direcciones y Perfil, y no la Consola', async () => {
    // Arrange
    renderizar(<AccountMenu />, {
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
    });

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    // Assert
    expect(screen.getByRole('menuitem', { name: 'Mis pedidos' })).toHaveAttribute(
      'href',
      '/cuenta/pedidos',
    );
    expect(screen.getByRole('menuitem', { name: 'Direcciones' })).toHaveAttribute(
      'href',
      '/cuenta/direcciones',
    );
    expect(screen.getByRole('menuitem', { name: 'Perfil' })).toHaveAttribute(
      'href',
      '/cuenta/perfil',
    );
    expect(screen.queryByRole('menuitem', { name: 'Consola' })).not.toBeInTheDocument();
  });

  it('Cliente → el enlace Tarjetas va a /cuenta/tarjetas', async () => {
    // Arrange
    renderizar(<AccountMenu />, {
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
    });

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    // Assert
    expect(screen.getByRole('menuitem', { name: 'Tarjetas' })).toHaveAttribute(
      'href',
      '/cuenta/tarjetas',
    );
  });

  it.each([
    ['Operador', crearOperador(), '/consola/pedidos'],
    ['Administrador', crearAdmin(), '/consola'],
  ])(
    '%s → ve la Consola (hacia su inicio) y ninguna opción de cliente',
    async (_rol, usuario, destino) => {
      // Arrange
      renderizar(<AccountMenu />, { auth: crearAuth({ usuario, estado: 'autenticado' }) });

      // Act
      await userEvent.click(screen.getByRole('button', { name: new RegExp(usuario.nombre) }));

      // Assert
      expect(screen.getByRole('menuitem', { name: 'Consola' })).toHaveAttribute('href', destino);
      expect(screen.queryByRole('menuitem', { name: 'Mis pedidos' })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Direcciones' })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Tarjetas' })).not.toBeInTheDocument();
    },
  );

  it('Salir → cierra la sesión', async () => {
    // Arrange
    const cerrarSesion = vi.fn().mockResolvedValue(undefined);
    renderizar(<AccountMenu />, {
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado', cerrarSesion }),
    });
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    // Act
    await userEvent.click(screen.getByRole('menuitem', { name: 'Salir' }));

    // Assert
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it('Escape → cierra el menú', async () => {
    // Arrange
    renderizar(<AccountMenu />, {
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
    });
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    // Act
    await userEvent.keyboard('{Escape}');

    // Assert
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clic fuera → cierra el menú', async () => {
    // Arrange
    renderizar(
      <>
        <p>Fuera</p>
        <AccountMenu />
      </>,
      { auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }) },
    );
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    // Act
    await userEvent.click(screen.getByText('Fuera'));

    // Assert
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('elegir una opción → cierra el menú', async () => {
    // Arrange
    renderizar(<AccountMenu />, {
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
      rutas: [{ path: '/cuenta/perfil', element: <p>Pantalla de perfil</p> }],
    });
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    // Act
    await userEvent.click(screen.getByRole('menuitem', { name: 'Perfil' }));

    // Assert
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
