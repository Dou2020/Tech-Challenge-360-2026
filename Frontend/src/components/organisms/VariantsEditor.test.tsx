import { zodResolver } from '@hookform/resolvers/zod';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { atributosApi } from '../../services/api/gestion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import {
  esquemaProductoNuevo,
  varianteVacia,
  type FormularioProducto,
} from '../../utils/productoForm';
import { VariantsEditor } from './VariantsEditor';

vi.mock('../../services/api/gestion', () => ({
  atributosApi: { listar: vi.fn(), crear: vi.fn(), agregarValor: vi.fn() },
}));

function Arnes({
  cantidad = 1,
  onValido = vi.fn(),
}: {
  cantidad?: number;
  onValido?: (v: unknown) => void;
}) {
  const { control, register, handleSubmit, formState } = useForm<FormularioProducto>({
    resolver: zodResolver(esquemaProductoNuevo),
    defaultValues: {
      idCategoria: '1',
      nombre: 'Producto',
      descripcion: '',
      variantes: Array.from({ length: cantidad }, varianteVacia),
    },
  });
  return (
    <form onSubmit={(e) => void handleSubmit(onValido)(e)}>
      <VariantsEditor control={control} register={register} errors={formState.errors} />
      <button type="submit">Enviar</button>
    </form>
  );
}

describe('VariantsEditor', () => {
  beforeEach(() => {
    vi.mocked(atributosApi.listar)
      .mockReset()
      .mockResolvedValue([
        {
          idAtributo: 1,
          nombre: 'Talla',
          cantidadValores: 2,
          valores: [
            { idValorAtributo: 5, valor: 'M', cantidadVariantes: 0 },
            { idValorAtributo: 6, valor: 'L', cantidadVariantes: 0 },
          ],
        },
      ]);
  });

  it('con una sola variante → no ofrece quitarla', () => {
    // Act
    renderizar(<Arnes />);

    // Assert
    expect(screen.queryByRole('button', { name: /Quitar variante/ })).not.toBeInTheDocument();
  });

  it('Agregar variante → suma un bloque numerado y permite quitarlo', async () => {
    // Arrange
    renderizar(<Arnes />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));

    // Assert
    expect(screen.getByLabelText('SKU de la variante 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar variante 2' })).toBeInTheDocument();
  });

  it('Quitar variante → la elimina', async () => {
    // Arrange
    renderizar(<Arnes cantidad={2} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Quitar variante 2' }));

    // Assert
    expect(screen.queryByLabelText('SKU de la variante 2')).not.toBeInTheDocument();
  });

  it('con 50 variantes → "Agregar variante" queda deshabilitado', () => {
    // Act
    renderizar(<Arnes cantidad={50} />);

    // Assert
    expect(screen.getByRole('button', { name: 'Agregar variante' })).toBeDisabled();
  });

  it('SKU repetido entre variantes → error en la segunda', async () => {
    // Arrange
    renderizar(<Arnes cantidad={2} />);
    for (const n of [1, 2]) {
      await userEvent.type(screen.getByLabelText(`SKU de la variante ${n}`), 'IGUAL');
      await userEvent.type(screen.getByLabelText(`Precio de la variante ${n}`), '10');
    }

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    // Assert
    expect(await screen.findByText('Este SKU está repetido en el formulario.')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU de la variante 2')).toHaveAttribute('aria-invalid', 'true');
  });

  it('misma combinación de valores en dos variantes → error de combinación', async () => {
    // Arrange
    renderizar(<Arnes cantidad={2} />);
    await screen.findAllByLabelText('Talla');
    for (const n of [1, 2]) {
      await userEvent.type(screen.getByLabelText(`SKU de la variante ${n}`), `S${n}`);
      await userEvent.type(screen.getByLabelText(`Precio de la variante ${n}`), '10');
    }
    for (const select of screen.getAllByLabelText('Talla'))
      await userEvent.selectOptions(select, 'M');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    // Assert
    expect(
      await screen.findByText('Otra variante tiene la misma combinación de valores.'),
    ).toBeInTheDocument();
  });

  it('muestra un select por atributo con sus valores', async () => {
    // Act
    renderizar(<Arnes />);

    // Assert
    expect(await screen.findByLabelText('Talla')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'L' })).toBeInTheDocument();
  });

  it('atributos que no cargan → ErrorState con Reintentar', async () => {
    // Arrange
    vi.mocked(atributosApi.listar)
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla de atributos.', [], 'req-5'))
      .mockResolvedValueOnce([]);
    renderizar(<Arnes />);
    expect(await screen.findByText('Referencia: req-5')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText(/Aún no hay atributos/)).toBeInTheDocument();
  });

  it('Gestionar atributos → muestra y oculta el panel', async () => {
    // Arrange
    renderizar(<Arnes />);
    await userEvent.click(screen.getByRole('button', { name: 'Gestionar atributos' }));
    expect(await screen.findByRole('heading', { name: 'Atributos y valores' })).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar atributos' }));

    // Assert
    expect(screen.queryByRole('heading', { name: 'Atributos y valores' })).not.toBeInTheDocument();
  });
});
