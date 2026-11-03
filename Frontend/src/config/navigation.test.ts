import { describe, expect, it } from 'vitest';
import { inicioPorRol, menuConsola, menuPorRol } from './navigation';

describe('navigation', () => {
  it('Administrador → ve todas las secciones de la consola, incluida Configuración', () => {
    // Act
    const rutas = menuPorRol('Administrador').map((i) => i.ruta);

    // Assert
    expect(rutas).toEqual(menuConsola.map((i) => i.ruta));
    expect(rutas).toEqual(
      expect.arrayContaining([
        '/consola',
        '/consola/productos',
        '/consola/reportes',
        '/consola/cupones',
        '/consola/usuarios',
        '/consola/bitacora',
        '/consola/configuracion',
      ]),
    );
  });

  it('Operador → solo pedidos e inventario', () => {
    // Act
    const rutas = menuPorRol('Operador').map((i) => i.ruta);

    // Assert
    expect(rutas).toEqual(['/consola/pedidos', '/consola/inventario']);
  });

  it('Cliente → ninguna sección de la consola', () => {
    // Act & Assert
    expect(menuPorRol('Cliente')).toEqual([]);
  });

  it.each([
    ['Administrador', '/consola'],
    ['Operador', '/consola/pedidos'],
    ['Cliente', '/'],
  ] as const)('inicioPorRol(%s) → %s', (rol, ruta) => {
    // Act & Assert
    expect(inicioPorRol(rol)).toBe(ruta);
  });
});
