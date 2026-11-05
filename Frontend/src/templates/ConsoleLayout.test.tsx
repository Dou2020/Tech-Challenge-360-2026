import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { crearAdmin, crearOperador } from '../test/fixtures/usuarios';
import { crearAuth, renderizar } from '../test/renderizar';
import { ConsoleLayout } from './ConsoleLayout';

function montar(usuario = crearAdmin(), cerrarSesion = vi.fn()) {
  return renderizar(<ConsoleLayout />, {
    auth: crearAuth({ usuario, estado: 'autenticado', cerrarSesion }),
    ruta: '/consola',
  });
}

describe('ConsoleLayout', () => {
  it('sin usuario → no renderiza nada', () => {
    // Act
    const { container } = renderizar(<ConsoleLayout />, { ruta: '/consola' });

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  it('Administrador → el menú trae todas las secciones, sin carrito', () => {
    // Act
    montar();

    // Assert
    const menu = screen.getAllByRole('navigation', { name: 'Menú de la consola' })[0]!;
    for (const titulo of [
      'Dashboard',
      'Operación',
      'Pedidos',
      'Inventario',
      'Productos',
      'Categorías',
      'Reportes',
    ]) {
      expect(within(menu).getByRole('link', { name: titulo })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: /Carrito/ })).not.toBeInTheDocument();
  });

  it('Operador → el menú solo trae Operación, Pedidos e Inventario', () => {
    // Act
    montar(crearOperador());

    // Assert
    const menu = screen.getAllByRole('navigation', { name: 'Menú de la consola' })[0]!;
    expect(
      within(menu)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Operación', 'Pedidos', 'Inventario']);
  });

  it('muestra nombre y rol del usuario', () => {
    // Act
    montar(crearOperador());

    // Assert
    expect(screen.getByText('Omar · Operador')).toBeInTheDocument();
  });

  it.each([
    ['Operador', crearOperador],
    ['Administrador', crearAdmin],
  ])('%s → el avatar enlaza a Mi perfil de la consola', (_rol, crear) => {
    // Act
    montar(crear());

    // Assert
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toHaveAttribute(
      'href',
      '/consola/perfil',
    );
  });

  it('el enlace de la sección actual queda marcado como activo', () => {
    // Act
    montar();

    // Assert
    const menu = screen.getAllByRole('navigation', { name: 'Menú de la consola' })[0]!;
    expect(within(menu).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(menu).getByRole('link', { name: 'Pedidos' })).not.toHaveAttribute('aria-current');
  });

  it('Salir → cierra la sesión', async () => {
    // Arrange
    const cerrarSesion = vi.fn().mockResolvedValue(undefined);
    montar(crearAdmin(), cerrarSesion);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));

    // Assert
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it('botón de menú → abre el menú móvil y Cerrar menú lo cierra', async () => {
    // Arrange
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getAllByRole('navigation', { name: 'Menú de la consola' })).toHaveLength(2);

    // Act
    await userEvent.click(screen.getAllByRole('button', { name: 'Cerrar menú' })[0]!);

    // Assert
    expect(screen.getAllByRole('navigation', { name: 'Menú de la consola' })).toHaveLength(1);
  });

  it('elegir una opción del menú móvil → lo cierra', async () => {
    // Arrange
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const movil = screen.getAllByRole('navigation', { name: 'Menú de la consola' })[1]!;

    // Act
    await userEvent.click(within(movil).getByRole('link', { name: 'Dashboard' }));

    // Assert
    expect(screen.getAllByRole('navigation', { name: 'Menú de la consola' })).toHaveLength(1);
  });

  it('Configuración y Bitácora aparecen solo para el Administrador', () => {
    // Act
    montar();

    // Assert
    const menu = screen.getAllByRole('navigation', { name: 'Menú de la consola' })[0]!;
    expect(within(menu).getByRole('link', { name: 'Configuración' })).toHaveAttribute(
      'href',
      '/consola/configuracion',
    );
    expect(within(menu).getByRole('link', { name: 'Bitácora' })).toBeInTheDocument();
  });

  it('el Operador no ve Configuración, Cupones, Usuarios ni Bitácora', () => {
    // Act
    montar(crearOperador());

    // Assert
    for (const titulo of ['Configuración', 'Cupones', 'Usuarios', 'Bitácora']) {
      expect(screen.queryByRole('link', { name: titulo })).not.toBeInTheDocument();
    }
  });
});
