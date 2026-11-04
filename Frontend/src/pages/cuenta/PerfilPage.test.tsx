import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { perfilApi } from '../../services/api/perfil';
import { ApiError } from '../../services/http';
import { crearCliente } from '../../test/fixtures/usuarios';
import { crearAuth, renderizar } from '../../test/renderizar';
import PerfilPage from './PerfilPage';

vi.mock('../../services/api/perfil', () => ({
  perfilApi: { obtener: vi.fn(), actualizar: vi.fn(), cambiarContrasena: vi.fn() },
}));

const api = vi.mocked(perfilApi);

const perfil = {
  idUsuario: 7,
  correo: 'cliente@shopcart.gt',
  nombre: 'Ana',
  apellido: 'López',
  telefono: null,
  rol: 'Cliente' as const,
  activo: true,
  fechaCreacion: '2026-11-01T15:30:00.000Z',
  contrasenaPendiente: false,
};

async function llenarContrasenas(actual: string, nueva: string) {
  await userEvent.type(screen.getByLabelText('Contraseña actual'), actual);
  await userEvent.type(screen.getByLabelText('Contraseña nueva'), nueva);
  await userEvent.type(screen.getByLabelText('Confirmar contraseña nueva'), nueva);
}

describe('PerfilPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.obtener.mockResolvedValue(perfil);
  });

  it('una contraseña actual incorrecta (400 VALIDACION) se muestra en su campo', async () => {
    // Arrange
    api.cambiarContrasena.mockRejectedValue(
      new ApiError(400, 'VALIDACION', 'La solicitud tiene datos inválidos.', [
        { field: 'contrasenaActual', message: 'La contraseña actual es incorrecta.' },
      ]),
    );
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await screen.findByLabelText('Contraseña actual');
    await llenarContrasenas('equivocada1', 'Nueva1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // Assert
    const campo = await screen.findByLabelText('Contraseña actual');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('La contraseña actual es incorrecta.');
  });

  it('valida que la confirmación coincida y no llama a la API', async () => {
    // Arrange
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await screen.findByLabelText('Contraseña actual');
    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'Actual123');
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'Nueva1234');
    await userEvent.type(screen.getByLabelText('Confirmar contraseña nueva'), 'Otra1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // Assert
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(api.cambiarContrasena).not.toHaveBeenCalled();
  });

  it('cambia la contraseña y avisa', async () => {
    // Arrange
    api.cambiarContrasena.mockResolvedValue(undefined);
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await screen.findByLabelText('Contraseña actual');
    await llenarContrasenas('Actual123', 'Nueva1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // Assert
    expect(await screen.findByText(/Contraseña actualizada/)).toBeInTheDocument();
    expect(api.cambiarContrasena).toHaveBeenCalledWith({
      contrasenaActual: 'Actual123',
      contrasenaNueva: 'Nueva1234',
    });
  });

  it('guarda los datos personales', async () => {
    // Arrange
    api.actualizar.mockResolvedValue({ ...perfil, nombre: 'Anita' });
    const auth = crearAuth();
    renderizar(<PerfilPage />, { auth, ruta: '/cuenta/perfil' });
    const nombre = await screen.findByLabelText('Nombre');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Anita');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Datos actualizados.')).toBeInTheDocument();
    expect(api.actualizar).toHaveBeenCalledWith({ nombre: 'Anita', apellido: 'López' });
    expect(auth.actualizarUsuario).toHaveBeenCalledWith({ nombre: 'Anita', apellido: 'López' });
  });

  it('si el perfil no carga muestra el error con reintentar', async () => {
    // Arrange
    api.obtener.mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Fallo.', [], 'req-1'));

    // Act
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Referencia: req-1');
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.obtener.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando perfil' })).toBeInTheDocument();
  });

  it('el perfil carga → muestra el correo (solo lectura) y los datos', async () => {
    // Act
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });

    // Assert
    expect(await screen.findByLabelText('Correo')).toBeDisabled();
    expect(screen.getByLabelText('Correo')).toHaveValue('cliente@shopcart.gt');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
    expect(screen.getByLabelText('Apellido')).toHaveValue('López');
  });

  it('nombre vacío y teléfono inválido → errores por campo con aria-invalid y sin llamar a la API', async () => {
    // Arrange
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await userEvent.clear(await screen.findByLabelText('Nombre'));
    await userEvent.type(screen.getByLabelText('Teléfono (opcional)'), '123');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Ingresa tu nombre.')).toBeInTheDocument();
    expect(screen.getByText('Teléfono inválido (8 a 20 dígitos).')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Teléfono (opcional)')).toHaveAttribute('aria-invalid', 'true');
    expect(api.actualizar).not.toHaveBeenCalled();
  });

  it('guardar con un teléfono → lo envía y actualiza el nombre de la sesión', async () => {
    // Arrange
    api.actualizar.mockResolvedValue({ ...perfil, nombre: 'Ana María', telefono: '5555-1234' });
    const actualizarUsuario = vi.fn();
    renderizar(<PerfilPage />, {
      ruta: '/cuenta/perfil',
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado', actualizarUsuario }),
    });
    const nombre = await screen.findByLabelText('Nombre');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Ana María');
    await userEvent.type(screen.getByLabelText('Teléfono (opcional)'), '5555-1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Datos actualizados.')).toBeInTheDocument();
    expect(api.actualizar).toHaveBeenCalledWith({
      nombre: 'Ana María',
      apellido: 'López',
      telefono: '5555-1234',
    });
    expect(actualizarUsuario).toHaveBeenCalledWith({ nombre: 'Ana María', apellido: 'López' });
  });

  it('el backend rechaza el teléfono (details) → el mensaje queda en su campo', async () => {
    // Arrange
    api.actualizar.mockRejectedValue(
      new ApiError(400, 'VALIDACION', 'Datos inválidos', [
        { field: 'telefono', message: 'El teléfono ya está registrado.' },
      ]),
    );
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await userEvent.type(await screen.findByLabelText('Teléfono (opcional)'), '5555-1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    const campo = await screen.findByLabelText('Teléfono (opcional)');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('El teléfono ya está registrado.');
  });

  it('error genérico al guardar → aviso con el mensaje y el requestId', async () => {
    // Arrange
    api.actualizar.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-12'),
    );
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await screen.findByLabelText('Nombre');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-12')).toBeInTheDocument();
  });

  it('mientras guarda → el botón queda deshabilitado', async () => {
    // Arrange
    let terminar: (valor: typeof perfil) => void = () => undefined;
    api.actualizar.mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await screen.findByLabelText('Nombre');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByRole('button', { name: /Guardar cambios/ })).toBeDisabled();
    terminar(perfil);
    await screen.findByText('Datos actualizados.');
  });

  it.each([
    ['muy corta', 'Ab1', 'Debe tener al menos 8 caracteres.'],
    ['sin número', 'Contrasena', 'Debe incluir al menos un número.'],
    ['sin letra', '12345678', 'Debe incluir al menos una letra.'],
  ])(
    'contraseña nueva %s → muestra su error y no llama a la API',
    async (_caso, nueva, mensaje) => {
      // Arrange
      renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
      await screen.findByLabelText('Contraseña actual');
      await llenarContrasenas('Actual1234', nueva);

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

      // Assert
      expect(await screen.findByText(mensaje)).toBeInTheDocument();
      expect(api.cambiarContrasena).not.toHaveBeenCalled();
    },
  );

  it('contraseña nueva igual a la actual → error y sin llamar a la API', async () => {
    // Arrange
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await screen.findByLabelText('Contraseña actual');
    await llenarContrasenas('Misma1234', 'Misma1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // Assert
    expect(await screen.findByText('Debe ser distinta de la actual.')).toBeInTheDocument();
    expect(api.cambiarContrasena).not.toHaveBeenCalled();
  });

  it('error genérico al cambiar la contraseña → aviso con el mensaje', async () => {
    // Arrange
    api.cambiarContrasena.mockRejectedValue(
      new ApiError(503, 'SERVICIO_NO_DISPONIBLE', 'Servicio no disponible.', [], 'req-13'),
    );
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await screen.findByLabelText('Contraseña actual');
    await llenarContrasenas('Actual1234', 'Nueva1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // Assert
    expect(await screen.findByText('Servicio no disponible.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-13')).toBeInTheDocument();
  });

  it('un 400 VALIDACION sin details → el mensaje queda en la contraseña actual', async () => {
    // Arrange
    api.cambiarContrasena.mockRejectedValue(
      new ApiError(400, 'VALIDACION', 'La contraseña actual es incorrecta.'),
    );
    renderizar(<PerfilPage />, { ruta: '/cuenta/perfil' });
    await screen.findByLabelText('Contraseña actual');
    await llenarContrasenas('equivocada1', 'Nueva1234');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // Assert
    expect(await screen.findByLabelText('Contraseña actual')).toHaveAccessibleDescription(
      'La contraseña actual es incorrecta.',
    );
  });
});
