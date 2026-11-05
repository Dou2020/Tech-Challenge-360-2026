import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { UsuarioAdmin } from '../../types/administracion';
import { UserForm } from './UserForm';

const usuario: UsuarioAdmin = {
  idUsuario: 6,
  correo: 'cliente@shopcart.gt',
  nombre: 'Ana',
  apellido: 'López',
  telefono: '5555-1234',
  rol: 'Cliente',
  activo: true,
  fechaCreacion: '2026-10-01T10:00:00.000Z',
  contrasenaPendiente: false,
};

async function llenarNuevo() {
  await userEvent.type(screen.getByLabelText('Nombre'), 'Óscar');
  await userEvent.type(screen.getByLabelText('Apellido'), 'Pérez');
  await userEvent.type(screen.getByLabelText('Correo'), 'op@shopcart.gt');
}

describe('UserForm', () => {
  it('crear → solo ofrece Operador y Administrador y envía los datos', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    renderizar(<UserForm onGuardar={onGuardar} onCancelar={vi.fn()} />);
    const opciones = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['Operador', 'Administrador']);
    await llenarNuevo();
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'Administrador');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        correo: 'op@shopcart.gt',
        nombre: 'Óscar',
        apellido: 'Pérez',
        rol: 'Administrador',
      }),
    );
  });

  it('crear con teléfono → lo incluye', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    renderizar(<UserForm onGuardar={onGuardar} onCancelar={vi.fn()} />);
    await llenarNuevo();
    await userEvent.type(screen.getByLabelText('Teléfono (opcional)'), '5555-9999');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith(
        expect.objectContaining({ telefono: '5555-9999', rol: 'Operador' }),
      ),
    );
  });

  it('crear vacío → errores por campo con aria-invalid y sin guardar', async () => {
    // Arrange
    const onGuardar = vi.fn();
    renderizar(<UserForm onGuardar={onGuardar} onCancelar={vi.fn()} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    // Assert
    expect(await screen.findByText('Ingresa el nombre.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa un correo válido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('crear → no pide contraseña y explica que llegará un correo', () => {
    // Act
    renderizar(<UserForm onGuardar={vi.fn()} onCancelar={vi.fn()} />);

    // Assert
    expect(screen.queryByLabelText(/Contraseña/)).not.toBeInTheDocument();
    expect(screen.getByText(/recibirá un correo con un enlace para crearla/)).toBeInTheDocument();
  });

  it('teléfono inválido → error', async () => {
    // Arrange
    renderizar(<UserForm onGuardar={vi.fn()} onCancelar={vi.fn()} />);
    await llenarNuevo();
    await userEvent.type(screen.getByLabelText('Teléfono (opcional)'), '12');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    // Assert
    expect(await screen.findByText(/Teléfono inválido/)).toBeInTheDocument();
  });

  it('editar → correo deshabilitado, sin contraseña, con rol Cliente disponible y datos precargados', () => {
    // Act
    renderizar(<UserForm usuario={usuario} onGuardar={vi.fn()} onCancelar={vi.fn()} />);

    // Assert
    expect(screen.getByLabelText('Correo')).toBeDisabled();
    expect(screen.getByLabelText('Correo')).toHaveValue('cliente@shopcart.gt');
    expect(screen.queryByLabelText(/Contraseña/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Rol')).toHaveValue('Cliente');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Cliente',
      'Operador',
      'Administrador',
    ]);
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
  });

  it('editar y guardar → envía nombre, apellido, teléfono y rol (sin correo)', async () => {
    // Arrange
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    renderizar(<UserForm usuario={usuario} onGuardar={onGuardar} onCancelar={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'Operador');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        nombre: 'Ana',
        apellido: 'López',
        telefono: '5555-1234',
        rol: 'Operador',
      }),
    );
  });

  it('409 DUPLICADO → mensaje en el correo', async () => {
    // Arrange
    renderizar(
      <UserForm
        onGuardar={vi.fn().mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Dup.'))}
        onCancelar={vi.fn()}
      />,
    );
    await llenarNuevo();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    // Assert
    expect(await screen.findByText('Ya existe un usuario con ese correo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
  });

  it('409 EN_USO al editar el rol → mensaje en el rol', async () => {
    // Arrange
    renderizar(
      <UserForm
        usuario={{ ...usuario, rol: 'Administrador' }}
        onGuardar={vi.fn().mockRejectedValue(new ApiError(409, 'EN_USO', 'En uso.'))}
        onCancelar={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'Operador');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText(/último Administrador activo/)).toBeInTheDocument();
    expect(screen.getByLabelText('Rol')).toHaveAttribute('aria-invalid', 'true');
  });

  it('details del backend → cada mensaje queda en su campo', async () => {
    // Arrange
    renderizar(
      <UserForm
        usuario={usuario}
        onGuardar={vi
          .fn()
          .mockRejectedValue(
            new ApiError(400, 'VALIDACION', 'Inválido', [
              { field: 'nombre', message: 'Nombre no permitido.' },
            ]),
          )}
        onCancelar={vi.fn()}
      />,
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Nombre no permitido.')).toBeInTheDocument();
  });

  it.each([
    [new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'), 'Falla del servidor.'],
    [new Error('red'), 'No se pudo guardar el usuario.'],
  ])('otro error (%#) → alerta', async (error, mensaje) => {
    // Arrange
    renderizar(
      <UserForm
        usuario={usuario}
        onGuardar={vi.fn().mockRejectedValue(error)}
        onCancelar={vi.fn()}
      />,
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje);
  });

  it('Cancelar → llama a onCancelar', async () => {
    // Arrange
    const onCancelar = vi.fn();
    renderizar(<UserForm onGuardar={vi.fn()} onCancelar={onCancelar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
