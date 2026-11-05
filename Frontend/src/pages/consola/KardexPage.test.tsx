import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inventarioApi } from '../../services/api/inventario';
import { renderizar } from '../../test/renderizar';
import KardexPage from './KardexPage';

vi.mock('../../services/api/inventario', () => ({
  inventarioApi: { kardex: vi.fn(), tiposMovimiento: vi.fn() },
}));
const api = vi.mocked(inventarioApi);

describe('KardexPage', () => {
  beforeEach(() => {
    api.kardex.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    api.tiposMovimiento.mockReset().mockResolvedValue([]);
  });

  it.each(['abc', '0', '-4'])(
    'id de variante inválido (%s) → NoEncontrado sin llamar a la API',
    (id) => {
      // Act
      renderizar(<KardexPage />, {
        ruta: `/consola/inventario/${id}/kardex`,
        patron: '/consola/inventario/:idVariante/kardex',
      });

      // Assert
      expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
      expect(api.kardex).not.toHaveBeenCalled();
    },
  );

  it('sin estado de navegación → título con el id de la variante', async () => {
    // Act
    renderizar(<KardexPage />, {
      ruta: '/consola/inventario/41/kardex',
      patron: '/consola/inventario/:idVariante/kardex',
    });

    // Assert
    expect(screen.getByRole('heading', { name: 'Kardex de la variante 41' })).toBeInTheDocument();
    expect(await screen.findByText('Sin movimientos')).toBeInTheDocument();
    expect(api.kardex).toHaveBeenCalledWith(41, expect.objectContaining({ page: 1 }));
  });

  it('con SKU y producto en el estado (viene del inventario) → los muestra en el encabezado', () => {
    // Act
    renderizar(<KardexPage />, {
      ruta: '/consola/inventario/41/kardex',
      patron: '/consola/inventario/:idVariante/kardex',
      estadoRuta: { sku: 'CAM-LIM-NEG-M', producto: 'Camiseta' },
    });

    // Assert
    expect(screen.getByRole('heading', { name: 'Kardex de CAM-LIM-NEG-M' })).toBeInTheDocument();
    expect(screen.getByText('Camiseta')).toBeInTheDocument();
  });

  it('enlace de regreso al inventario', () => {
    // Act
    renderizar(<KardexPage />, {
      ruta: '/consola/inventario/41/kardex',
      patron: '/consola/inventario/:idVariante/kardex',
    });

    // Assert
    expect(screen.getByRole('link', { name: '← Volver al inventario' })).toHaveAttribute(
      'href',
      '/consola/inventario',
    );
  });
});
