import type { Categoria, ProductoResumen } from '../../types/catalogo';

export function crearProductoResumen(parcial: Partial<ProductoResumen> = {}): ProductoResumen {
  return {
    idProducto: 9,
    nombre: 'Camisa básica',
    descripcion: null,
    idCategoria: 2,
    categoria: 'Camisetas',
    precioMinimo: '149.00',
    precioMaximo: '149.00',
    disponible: true,
    imagenPrincipal: null,
    fechaCreacion: '2026-10-20T12:00:00.000Z',
    ...parcial,
  };
}

export function crearCategoria(parcial: Partial<Categoria> = {}): Categoria {
  return {
    idCategoria: 2,
    nombre: 'Camisetas',
    descripcion: null,
    cantidadProductos: 5,
    ...parcial,
  };
}
