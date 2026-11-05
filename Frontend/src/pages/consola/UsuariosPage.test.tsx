import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usuariosApi } from '../../services/api/administracion';
import { ApiError } from '../../services/http';
import { crearAuth, renderizar } from '../../test/renderizar';
import type { UsuarioAdmin } from '../../types/administracion';
import UsuariosPage from './UsuariosPage';

vi.mock('../../services/api/administracion', () => ({
  usuariosApi: {
    listar: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    reenviarInvitacion: vi.fn(),
  },
}));
const api = vi.mocked(usuariosApi);

const admin: UsuarioAdmin = {
  idUsuario: 1,
  correo: 'admin@shopcart.gt',
  nombre: 'Ada',
  apellido: 'Admin',
  telefono: null,
  rol: 'Administrador',
  activo: true,
  fechaCreacion: '2026-10-01T10:00:00.000Z',
  contrasenaPendiente: false,
};
const operador: UsuarioAdmin = {
  ...admin,
  idUsuario: 2,
  correo: 'op@shopcart.gt',
  nombre: 'Óscar',
  apellido: 'Operador',
  rol: 'Operador',
};

function abrir(ruta = '/consola/usuarios') {
  return renderizar(<UsuariosPage />, {
    ruta,
    auth: crearAuth({
      estado: 'autenticado',
      usuario: { idUsuario: 1, nombre: 'Ada', correo: admin.correo, rol: 'Administrador' },
    }),
  });
}

describe('UsuariosPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listar.mockResolvedValue({ items: [admin, operador], page: 1, pageSize: 20, total: 2 });
  });

  it('envía filtros y orden de la URL, y no ofrece desactivarse a uno mismo', async () => {
    // Arrange / Act
    abrir('/consola/usuarios?q=o&rol=Operador&activo=true&sort=correo:desc');

    // Assert
    await screen.findByText('Óscar Operador');
    expect(api.listar).toHaveBeenCalledWith({
      q: 'o',
      rol: 'Operador',
      activo: 'true',
      sort: 'correo:desc',
      page: 1,
      pageSize: 20,
    });
    expect(
      screen.queryByRole('button', { name: 'Desactivar a Ada Admin' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar a Óscar Operador' })).toBeInTheDocument();
  });

  it('desactivar avisa que se cierran sus sesiones y envía el estado', async () => {
    // Arrange
    api.cambiarEstado.mockResolvedValue({ ...operador, activo: false });
    abrir();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Desactivar a Óscar Operador' }),
    );
    const dialogo = screen.getByRole('dialog');

    // Act
    expect(dialogo).toHaveTextContent('Se cerrarán todas sus sesiones');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

    // Assert
    await waitFor(() => expect(api.cambiarEstado).toHaveBeenCalledWith(2, false));
  });

  it('un 409 EN_USO al desactivar explica el motivo', async () => {
    // Arrange
    api.cambiarEstado.mockRejectedValue(new ApiError(409, 'EN_USO', 'En uso.'));
    abrir();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Desactivar a Óscar Operador' }),
    );

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Desactivar' }),
    );

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('último Administrador activo');
  });

  it('crea un Operador sin contraseña y marca el correo repetido', async () => {
    // Arrange
    api.crear.mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.'));
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nora');
    await userEvent.type(screen.getByLabelText('Apellido'), 'Nuevo');
    await userEvent.type(screen.getByLabelText('Correo'), 'nora@shopcart.gt');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    // Assert
    await waitFor(() =>
      expect(api.crear).toHaveBeenCalledWith({
        correo: 'nora@shopcart.gt',
        nombre: 'Nora',
        apellido: 'Nuevo',
        rol: 'Operador',
      }),
    );
    expect(await screen.findByText('Ya existe un usuario con ese correo.')).toBeInTheDocument();
  });

  it('si el Administrador se cambia su propio rol, se le avisa de la sesión revocada', async () => {
    // Arrange
    api.actualizar.mockResolvedValue({ ...admin, rol: 'Operador' });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar a Ada Admin' }));
    await userEvent.selectOptions(
      within(screen.getByRole('region', { name: 'Editar a Ada Admin' })).getByLabelText('Rol'),
      'Operador',
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent('tu sesión actual se revocó');
    expect(api.actualizar).toHaveBeenCalledWith(1, {
      nombre: 'Ada',
      apellido: 'Admin',
      rol: 'Operador',
    });
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    abrir();

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando lista de usuarios' })).toBeInTheDocument();
  });

  it('error de listado → ErrorState con requestId y Reintentar', async () => {
    // Arrange
    api.listar
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-31'))
      .mockResolvedValueOnce({ items: [admin, operador], page: 1, pageSize: 20, total: 2 });
    abrir();
    expect(await screen.findByText('Referencia: req-31')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('Óscar Operador')).toBeInTheDocument();
  });

  it('sin usuarios ni filtros → vacío simple; con filtros → ofrece limpiar', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    // Act
    abrir('/consola/usuarios?rol=Cliente');

    // Assert
    expect(await screen.findByText('No hay usuarios con esos filtros')).toBeInTheDocument();
  });

  it('sin usuarios y sin filtros → "Aún no hay usuarios"', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    // Act
    abrir();

    // Assert
    expect(await screen.findByText('Aún no hay usuarios')).toBeInTheDocument();
  });

  it('cambiar el rol → rol en la URL y vuelve a la página 1', async () => {
    // Arrange
    const { router } = abrir('/consola/usuarios?page=2');
    await screen.findByText('Óscar Operador');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'Cliente');

    // Assert
    expect(router.state.location.search).toBe('?rol=Cliente');
    expect(api.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ rol: 'Cliente', page: 1 }),
    );
  });

  it('cambiar el estado → activo en la URL', async () => {
    // Arrange
    const { router } = abrir();
    await screen.findByText('Óscar Operador');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Inactivos');

    // Assert
    expect(router.state.location.search).toBe('?activo=false');
  });

  it('buscar por nombre o correo → q en la URL', async () => {
    // Arrange
    const { router } = abrir();
    await screen.findByText('Óscar Operador');

    // Act
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar usuario por nombre o correo' }),
      'osc{Enter}',
    );

    // Assert
    expect(router.state.location.search).toBe('?q=osc');
  });

  it('Limpiar filtros → quita los filtros de la URL', async () => {
    // Arrange
    const { router } = abrir('/consola/usuarios?rol=Operador');
    await screen.findByText('Óscar Operador');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    // Assert
    expect(router.state.location.search).toBe('');
  });

  it('marca "(tú)" en la fila del usuario de la sesión', async () => {
    // Act
    abrir();

    // Assert
    expect(await screen.findByText('(tú)')).toBeInTheDocument();
  });

  it('usuario inactivo → ofrece activar, confirma y envía activo true', async () => {
    // Arrange
    api.listar.mockResolvedValue({
      items: [admin, { ...operador, activo: false }],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    api.cambiarEstado.mockResolvedValue(operador);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Activar a Óscar Operador' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Activar' }),
    );

    // Assert
    expect(await screen.findByText('Óscar fue activado.')).toBeInTheDocument();
    expect(api.cambiarEstado).toHaveBeenCalledWith(2, true);
  });

  it('desactivar con éxito → avisa que sus sesiones se cerraron', async () => {
    // Arrange
    api.cambiarEstado.mockResolvedValue({ ...operador, activo: false });
    abrir();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Desactivar a Óscar Operador' }),
    );

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Desactivar' }),
    );

    // Assert
    expect(
      await screen.findByText('Óscar fue desactivado y sus sesiones se cerraron.'),
    ).toBeInTheDocument();
  });

  it('error genérico al cambiar el estado → aviso con requestId', async () => {
    // Arrange
    api.cambiarEstado.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-32'),
    );
    abrir();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Desactivar a Óscar Operador' }),
    );

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Desactivar' }),
    );

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-32')).toBeInTheDocument();
  });

  it('cancelar el diálogo → no llama a la API', async () => {
    // Arrange
    abrir();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Desactivar a Óscar Operador' }),
    );

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.cambiarEstado).not.toHaveBeenCalled();
  });

  it('crear con éxito → avisa con el nombre y cierra el panel', async () => {
    // Arrange
    api.crear.mockResolvedValue(operador);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nora');
    await userEvent.type(screen.getByLabelText('Apellido'), 'Nuevo');
    await userEvent.type(screen.getByLabelText('Correo'), 'nora@shopcart.gt');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    // Assert
    expect(
      await screen.findByText(/Usuario Nora Nuevo creado: se le envió una invitación/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Nuevo usuario' })).not.toBeInTheDocument();
  });

  it('editar a otro usuario → aviso normal de actualización (sin revocar sesión)', async () => {
    // Arrange
    api.actualizar.mockResolvedValue({ ...operador, nombre: 'Óscar2' });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar a Óscar Operador' }));
    const nombre = screen.getByLabelText('Nombre');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Óscar2');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Usuario actualizado.')).toBeInTheDocument();
    expect(api.actualizar).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ nombre: 'Óscar2', rol: 'Operador' }),
    );
  });

  it('editar sin cambiar el rol propio → aviso normal', async () => {
    // Arrange
    api.actualizar.mockResolvedValue(admin);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar a Ada Admin' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Usuario actualizado.')).toBeInTheDocument();
  });

  it('Cancelar el panel → lo cierra sin llamar a la API', async () => {
    // Arrange
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    const panel = screen.getByRole('region', { name: 'Nuevo usuario' });

    // Act
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('region', { name: 'Nuevo usuario' })).not.toBeInTheDocument();
    expect(api.crear).not.toHaveBeenCalled();
  });

  describe('invitación pendiente', () => {
    const pendiente: UsuarioAdmin = { ...operador, contrasenaPendiente: true };

    it('cuenta pendiente y activa → insignia "Pendiente" y botón de reenviar; los demás no', async () => {
      // Arrange
      api.listar.mockResolvedValue({
        items: [admin, pendiente],
        page: 1,
        pageSize: 20,
        total: 2,
      });

      // Act
      abrir();

      // Assert
      await screen.findByText('Óscar Operador');
      expect(screen.getAllByText('Pendiente')).toHaveLength(1);
      expect(
        screen.getByRole('button', { name: 'Reenviar invitación a Óscar Operador' }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Reenviar invitación/ })).toHaveLength(1);
    });

    it('cuenta pendiente pero inactiva → no ofrece reenviar', async () => {
      // Arrange
      api.listar.mockResolvedValue({
        items: [{ ...pendiente, activo: false }],
        page: 1,
        pageSize: 20,
        total: 1,
      });

      // Act
      abrir();

      // Assert
      await screen.findByText('Óscar Operador');
      expect(screen.queryByRole('button', { name: /Reenviar invitación/ })).not.toBeInTheDocument();
    });

    it('reenviar con éxito → muestra el mensaje de la API', async () => {
      // Arrange
      api.listar.mockResolvedValue({ items: [pendiente], page: 1, pageSize: 20, total: 1 });
      api.reenviarInvitacion.mockResolvedValue({ mensaje: 'Invitación reenviada.' });
      abrir();

      // Act
      await userEvent.click(
        await screen.findByRole('button', { name: 'Reenviar invitación a Óscar Operador' }),
      );

      // Assert
      expect(await screen.findByText('Invitación reenviada.')).toBeInTheDocument();
      expect(api.reenviarInvitacion).toHaveBeenCalledWith(2);
    });

    it.each([
      ['CONTRASENA_YA_CREADA', 409, 'ya creó su contraseña'],
      ['USUARIO_INACTIVO', 403, 'El usuario está inactivo'],
      ['SERVICIO_NO_DISPONIBLE', 503, 'El servicio no está disponible'],
    ])('reenviar falla con %s → mensaje específico', async (code, status, texto) => {
      // Arrange
      api.listar.mockResolvedValue({ items: [pendiente], page: 1, pageSize: 20, total: 1 });
      api.reenviarInvitacion.mockRejectedValue(new ApiError(status, code, 'x'));
      abrir();

      // Act
      await userEvent.click(
        await screen.findByRole('button', { name: 'Reenviar invitación a Óscar Operador' }),
      );

      // Assert
      expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    });
  });
});
