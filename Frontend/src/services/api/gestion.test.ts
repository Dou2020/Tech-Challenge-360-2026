import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../http';
import { atributosApi, categoriasApi, productosApi, variantesApi } from './gestion';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

describe('gestion (categorías, productos, variantes, atributos)', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it.each([
    [
      'categoriasApi.listar',
      () => categoriasApi.listar({ page: 2, activo: 'true', q: '' }),
      '/categorias?page=2&activo=true',
      undefined,
    ],
    [
      'categoriasApi.crear',
      () => categoriasApi.crear({ nombre: 'Calzado' } as never),
      '/categorias',
      { method: 'POST', body: { nombre: 'Calzado' } },
    ],
    [
      'categoriasApi.actualizar',
      () => categoriasApi.actualizar(3, { nombre: 'Zapatos' } as never),
      '/categorias/3',
      { method: 'PUT', body: { nombre: 'Zapatos' } },
    ],
    [
      'categoriasApi.cambiarEstado',
      () => categoriasApi.cambiarEstado(3, false),
      '/categorias/3/estado',
      { method: 'PATCH', body: { activo: false } },
    ],
    [
      'categoriasApi.eliminar',
      () => categoriasApi.eliminar(3),
      '/categorias/3',
      { method: 'DELETE' },
    ],
    [
      'productosApi.listar',
      () => productosApi.listar({ sort: 'nombre:asc' }),
      '/productos?sort=nombre%3Aasc',
      undefined,
    ],
    ['productosApi.obtener', () => productosApi.obtener(5), '/productos/5', undefined],
    [
      'productosApi.crear',
      () => productosApi.crear({ nombre: 'Tenis' } as never),
      '/productos',
      { method: 'POST', body: { nombre: 'Tenis' } },
    ],
    [
      'productosApi.actualizar',
      () => productosApi.actualizar(5, { nombre: 'Tenis 2' } as never),
      '/productos/5',
      { method: 'PUT', body: { nombre: 'Tenis 2' } },
    ],
    [
      'productosApi.cambiarEstado',
      () => productosApi.cambiarEstado(5, true),
      '/productos/5/estado',
      { method: 'PATCH', body: { activo: true } },
    ],
    ['productosApi.eliminar', () => productosApi.eliminar(5), '/productos/5', { method: 'DELETE' }],
    [
      'productosApi.agregarImagen',
      () => productosApi.agregarImagen(5, { url: 'https://i/1.jpg' } as never),
      '/productos/5/imagenes',
      { method: 'POST', body: { url: 'https://i/1.jpg' } },
    ],
    [
      'productosApi.quitarImagen',
      () => productosApi.quitarImagen(5, 9),
      '/productos/5/imagenes/9',
      { method: 'DELETE' },
    ],
    [
      'productosApi.agregarVariante',
      () => productosApi.agregarVariante(5, { sku: 'X' } as never),
      '/productos/5/variantes',
      { method: 'POST', body: { sku: 'X' } },
    ],
    [
      'variantesApi.actualizar',
      () => variantesApi.actualizar(11, { sku: 'X', valores: [1, 2] }),
      '/variantes/11',
      { method: 'PUT', body: { sku: 'X', valores: [1, 2] } },
    ],
    [
      'variantesApi.cambiarPrecio',
      () => variantesApi.cambiarPrecio(11, '99.50'),
      '/variantes/11/precio',
      { method: 'PATCH', body: { precio: '99.50' } },
    ],
    [
      'variantesApi.cambiarEstado',
      () => variantesApi.cambiarEstado(11, false),
      '/variantes/11/estado',
      { method: 'PATCH', body: { activo: false } },
    ],
    ['atributosApi.listar', () => atributosApi.listar(), '/atributos', undefined],
    [
      'atributosApi.crear',
      () => atributosApi.crear('Talla'),
      '/atributos',
      { method: 'POST', body: { nombre: 'Talla' } },
    ],
    [
      'atributosApi.agregarValor',
      () => atributosApi.agregarValor(1, 'XL'),
      '/atributos/1/valores',
      { method: 'POST', body: { valor: 'XL' } },
    ],
  ] as const)('%s → llama al endpoint correcto', async (_nombre, llamar, ruta, opciones) => {
    // Act
    await llamar();

    // Assert
    if (opciones) expect(pedir).toHaveBeenCalledWith(ruta, opciones);
    else expect(pedir).toHaveBeenCalledWith(ruta);
  });

  it('productosApi.subirImagen → multipart con imagen, orden y esPrincipal', async () => {
    // Arrange
    const archivo = new File(['x'], 'foto.png', { type: 'image/png' });

    // Act
    await productosApi.subirImagen(5, { archivo, orden: 2, esPrincipal: true });

    // Assert
    const [ruta, opciones] = pedir.mock.calls[0]!;
    expect(ruta).toBe('/productos/5/imagenes/archivo');
    expect(opciones).toMatchObject({ method: 'POST' });
    const cuerpo = (opciones as { body: FormData }).body;
    expect(cuerpo.get('imagen')).toBeInstanceOf(File);
    expect(cuerpo.get('orden')).toBe('2');
    expect(cuerpo.get('esPrincipal')).toBe('true');
  });
});
