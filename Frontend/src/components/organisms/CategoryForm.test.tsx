import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { CategoriaGestion } from '../../types/gestion';
import { CategoryForm } from './CategoryForm';

const existente: CategoriaGestion = {
  idCategoria: 1,
  nombre: 'Camisetas',
  descripcion: 'Ropa superior',
  activo: true,
  cantidadProductos: 3,
  cantidadCupones: 0,
};

describe('CategoryForm', () => {
  it('crear sin nombre → error por campo con aria-invalid y sin llamar a onGuardar', async () => {
    // Arrange
    const onGuardar = vi.fn();
    renderizar(<CategoryForm onGuardar={onGuardar} onCancelar={vi.fn()} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    // Assert
    expect(await screen.findByText('Ingresa el nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('crear con nombre → envía solo el nombre si no hay descripción', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    renderizar(<CategoryForm onGuardar={onGuardar} onCancelar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Calzado');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    // Assert
    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith({ nombre: 'Calzado' }));
  });

  it('editar → precarga los datos y envía nombre y descripción', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    renderizar(<CategoryForm categoria={existente} onGuardar={onGuardar} onCancelar={vi.fn()} />);
    expect(screen.getByLabelText('Nombre')).toHaveValue('Camisetas');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({ nombre: 'Camisetas', descripcion: 'Ropa superior' }),
    );
  });

  it('409 DUPLICADO → mensaje en el campo nombre', async () => {
    // Arrange
    const onGuardar = vi.fn().mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.'));
    renderizar(<CategoryForm onGuardar={onGuardar} onCancelar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Calzado');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    // Assert
    expect(await screen.findByText('Ya existe una categoría con ese nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
  });

  it('details del backend → cada mensaje queda en su campo', async () => {
    // Arrange
    const onGuardar = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, 'VALIDACION', 'Inválido', [
          { field: 'descripcion', message: 'Texto no permitido.' },
        ]),
      );
    renderizar(<CategoryForm onGuardar={onGuardar} onCancelar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Calzado');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    // Assert
    expect(await screen.findByText('Texto no permitido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción (opcional)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('otro error de la API → alerta con su mensaje', async () => {
    // Arrange
    const onGuardar = vi
      .fn()
      .mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'));
    renderizar(<CategoryForm onGuardar={onGuardar} onCancelar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Calzado');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Falla del servidor.');
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Arrange
    const onGuardar = vi.fn().mockRejectedValue(new Error('red'));
    renderizar(<CategoryForm onGuardar={onGuardar} onCancelar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Calzado');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la categoría.');
  });

  it('Cancelar → llama a onCancelar', async () => {
    // Arrange
    const onCancelar = vi.fn();
    renderizar(<CategoryForm onGuardar={vi.fn()} onCancelar={onCancelar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
