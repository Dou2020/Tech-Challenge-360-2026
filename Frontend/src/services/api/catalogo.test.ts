import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../http';
import { catalogoApi } from './catalogo';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

describe('catalogoApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('categorias → GET /catalogo/categorias', async () => {
    // Act
    await catalogoApi.categorias();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/catalogo/categorias');
  });

  it('buscarProductos → arma el query string con los filtros y omite los vacíos', async () => {
    // Act
    await catalogoApi.buscarProductos({
      q: 'tenis',
      page: 2,
      pageSize: 12,
      sort: 'precio:desc',
      idCategoria: undefined,
    });

    // Assert
    expect(pedir).toHaveBeenCalledWith(
      '/catalogo/productos?q=tenis&page=2&pageSize=12&sort=precio%3Adesc',
    );
  });

  it('producto → GET del detalle por id', async () => {
    // Act
    await catalogoApi.producto(9);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/catalogo/productos/9');
  });

  it('metodosEnvio → GET /metodos-envio', async () => {
    // Act
    await catalogoApi.metodosEnvio();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/metodos-envio');
  });
});
