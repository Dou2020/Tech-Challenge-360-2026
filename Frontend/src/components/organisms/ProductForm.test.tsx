import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { atributosApi } from '../../services/api/gestion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { CategoriaGestion } from '../../types/gestion';
import { ProductForm } from './ProductForm';

vi.mock('../../services/api/gestion', () => ({ atributosApi: { listar: vi.fn() } }));

const categorias: CategoriaGestion[] = [
  {
    idCategoria: 1,
    nombre: 'Camisetas',
    descripcion: null,
    activo: true,
    cantidadProductos: 0,
    cantidadCupones: 0,
  },
];

async function llenarBase() {
  await userEvent.type(screen.getByLabelText('Nombre'), 'Sudadero');
  await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Camisetas');
}

describe('ProductForm', () => {
  beforeEach(() => {
    vi.mocked(atributosApi.listar).mockResolvedValue([
      {
        idAtributo: 1,
        nombre: 'Talla',
        cantidadValores: 2,
        valores: [
          { idValorAtributo: 2, valor: 'M', cantidadVariantes: 0 },
          { idValorAtributo: 3, valor: 'L', cantidadVariantes: 0 },
        ],
      },
    ]);
  });

  it('crea el producto con variantes, enviando precio como texto y valores como IDs', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    renderizar(<ProductForm categorias={categorias} onGuardar={onGuardar} />);
    await llenarBase();
    await userEvent.type(screen.getByLabelText('SKU de la variante 1'), 'SUD-M');
    await userEvent.type(screen.getByLabelText('Precio de la variante 1'), '249.00');
    await userEvent.type(screen.getByLabelText('Existencia inicial de la variante 1'), '10');
    await userEvent.selectOptions(await screen.findByLabelText('Talla'), 'M');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        idCategoria: 1,
        nombre: 'Sudadero',
        variantes: [{ sku: 'SUD-M', precio: '249.00', existenciaInicial: 10, valores: [2] }],
      }),
    );
  });

  it('valida precio, SKU repetido y muestra los errores por campo', async () => {
    // Arrange
    const onGuardar = vi.fn();
    renderizar(<ProductForm categorias={categorias} onGuardar={onGuardar} />);
    await llenarBase();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));
    await userEvent.type(screen.getByLabelText('SKU de la variante 1'), 'IGUAL');
    await userEvent.type(screen.getByLabelText('SKU de la variante 2'), 'igual');
    await userEvent.type(screen.getByLabelText('Precio de la variante 1'), '0');
    await userEvent.type(screen.getByLabelText('Precio de la variante 2'), '10');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    // Assert
    expect(
      await screen.findByText('Ingresa un precio mayor que 0 con hasta 2 decimales.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Este SKU está repetido en el formulario.')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio de la variante 1')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('muestra los details de la API en el campo y el 409 DUPLICADO de SKU', async () => {
    // Arrange
    const onGuardar = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(400, 'VALIDACION', 'Datos inválidos.', [
          { field: 'variantes.0.precio', message: 'Precio fuera de rango.' },
        ]),
      )
      .mockRejectedValueOnce(new ApiError(409, 'DUPLICADO', 'SKU duplicado.'));
    renderizar(<ProductForm categorias={categorias} onGuardar={onGuardar} />);
    await llenarBase();
    await userEvent.type(screen.getByLabelText('SKU de la variante 1'), 'SUD-M');
    await userEvent.type(screen.getByLabelText('Precio de la variante 1'), '10');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    const campo = await screen.findByText('Precio fuera de rango.');
    await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    // Assert
    expect(campo).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('SKU ya existe');
  });

  it('al editar solo muestra los datos del producto, sin variantes', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    const producto = {
      idProducto: 8,
      nombre: 'Sudadero',
      descripcion: null,
      idCategoria: 1,
      categoria: 'Camisetas',
      categoriaActiva: true,
      activo: true,
      fechaCreacion: '2026-11-01T15:30:00.000Z',
      fechaModificacion: null,
      tieneVentas: false,
      puedeEliminarse: true,
      variantes: [],
      imagenes: [],
    };
    renderizar(<ProductForm categorias={categorias} producto={producto} onGuardar={onGuardar} />);

    // Act
    await userEvent.clear(screen.getByLabelText('Nombre'));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Sudadero nuevo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({ idCategoria: 1, nombre: 'Sudadero nuevo' }),
    );
    expect(screen.queryByText('Variantes')).not.toBeInTheDocument();
  });
});
