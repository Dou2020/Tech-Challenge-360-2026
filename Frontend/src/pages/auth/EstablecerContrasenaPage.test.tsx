import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../../services/api/auth';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import EstablecerContrasenaPage from './EstablecerContrasenaPage';

vi.mock('../../services/api/auth', () => ({
  authApi: { verificarToken: vi.fn(), establecerContrasena: vi.fn() },
}));
const verificar = vi.mocked(authApi.verificarToken);
const establecer = vi.mocked(authApi.establecerContrasena);

function montar(ruta = '/crear-contrasena#token=abc123') {
  return renderizar(<EstablecerContrasenaPage />, {
    ruta: ruta.split('#')[0]!,
    rutas: [{ path: '/login', element: <p>Pantalla de login</p> }],
    ...(ruta.includes('#') ? { hash: `#${ruta.split('#')[1]}` } : {}),
  });
}

async function llenar(contrasena: string, confirmacion = contrasena) {
  await userEvent.type(screen.getByLabelText('Contraseña'), contrasena);
  await userEvent.type(screen.getByLabelText('Confirmar contraseña'), confirmacion);
  await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
}

describe('EstablecerContrasenaPage', () => {
  beforeEach(() => {
    verificar.mockReset();
    establecer.mockReset();
  });

  it('mientras verifica el token muestra la carga', () => {
    // Arrange
    verificar.mockReturnValue(new Promise(() => undefined));

    // Act
    montar();

    // Assert
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(verificar).toHaveBeenCalledWith('abc123');
  });

  it('token CREAR válido → título de crear y correo de la cuenta', async () => {
    // Arrange
    verificar.mockResolvedValue({ proposito: 'CREAR', correo: 'ana@correo.gt' });

    // Act
    montar();

    // Assert
    expect(await screen.findByRole('heading', { name: 'Crea tu contraseña' })).toBeInTheDocument();
    expect(screen.getByText('ana@correo.gt')).toBeInTheDocument();
  });

  it('token RESTABLECER válido → título de restablecer', async () => {
    // Arrange
    verificar.mockResolvedValue({ proposito: 'RESTABLECER', correo: 'ana@correo.gt' });

    // Act
    montar('/restablecer-contrasena#token=abc123');

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Restablece tu contraseña' }),
    ).toBeInTheDocument();
  });

  it('token inválido → error con enlace para pedir uno nuevo', async () => {
    // Arrange
    verificar.mockRejectedValue(new ApiError(400, 'TOKEN_CONTRASENA_INVALIDO', 'Enlace inválido.'));

    // Act
    montar();

    // Assert
    expect(await screen.findByText(/no es válido, ya se usó o venció/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Solicitar un enlace nuevo' })).toHaveAttribute(
      'href',
      '/recuperar-contrasena',
    );
  });

  it('sin token en la URL → error sin llamar a la API', () => {
    // Act
    montar('/crear-contrasena');

    // Assert
    expect(screen.getByText(/no es válido, ya se usó o venció/)).toBeInTheDocument();
    expect(verificar).not.toHaveBeenCalled();
  });

  it('otro error al verificar → error con reintentar', async () => {
    // Arrange
    verificar.mockRejectedValue(new ApiError(503, 'SERVICIO_NO_DISPONIBLE', 'Sin servicio.'));

    // Act
    montar();

    // Assert
    expect(await screen.findByText('Sin servicio.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('contraseñas que no coinciden → error en la confirmación y no llama a la API', async () => {
    // Arrange
    verificar.mockResolvedValue({ proposito: 'CREAR', correo: 'ana@correo.gt' });
    montar();
    await screen.findByLabelText('Contraseña');

    // Act
    await llenar('Clave1234', 'Otra12345');

    // Assert
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(establecer).not.toHaveBeenCalled();
  });

  it('contraseña sin número → error de política y no llama a la API', async () => {
    // Arrange
    verificar.mockResolvedValue({ proposito: 'CREAR', correo: 'ana@correo.gt' });
    montar();
    await screen.findByLabelText('Contraseña');

    // Act
    await llenar('sololetras');

    // Assert
    expect(await screen.findByText('Debe incluir al menos un número.')).toBeInTheDocument();
    expect(establecer).not.toHaveBeenCalled();
  });

  it('VALIDACION del backend → el detalle queda en el campo contraseña', async () => {
    // Arrange
    verificar.mockResolvedValue({ proposito: 'CREAR', correo: 'ana@correo.gt' });
    establecer.mockRejectedValue(
      new ApiError(400, 'VALIDACION', 'Datos inválidos', [
        { field: 'contrasena', message: 'La contraseña es demasiado común.' },
      ]),
    );
    montar();
    await screen.findByLabelText('Contraseña');

    // Act
    await llenar('Clave1234');

    // Assert
    const campo = await screen.findByLabelText('Contraseña');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('La contraseña es demasiado común.');
  });

  it('éxito (204) → lleva a /login', async () => {
    // Arrange
    verificar.mockResolvedValue({ proposito: 'CREAR', correo: 'ana@correo.gt' });
    establecer.mockResolvedValue(undefined);
    montar();
    await screen.findByLabelText('Contraseña');

    // Act
    await llenar('Clave1234');

    // Assert
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(establecer).toHaveBeenCalledWith('abc123', 'Clave1234');
  });

  it('establecer devuelve TOKEN_CONTRASENA_INVALIDO → avisa que el enlace ya no es válido', async () => {
    // Arrange
    verificar.mockResolvedValue({ proposito: 'CREAR', correo: 'ana@correo.gt' });
    establecer.mockRejectedValue(
      new ApiError(400, 'TOKEN_CONTRASENA_INVALIDO', 'Enlace inválido o vencido.'),
    );
    montar();
    await screen.findByLabelText('Contraseña');

    // Act
    await llenar('Clave1234');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El enlace ya no es válido. Solicita uno nuevo.',
    );
  });

  it('establecer devuelve 429 DEMASIADAS_SOLICITUDES → muestra el mensaje del backend', async () => {
    // Arrange
    verificar.mockResolvedValue({ proposito: 'CREAR', correo: 'ana@correo.gt' });
    establecer.mockRejectedValue(
      new ApiError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiadas solicitudes. Espera un momento.'),
    );
    montar();
    await screen.findByLabelText('Contraseña');

    // Act
    await llenar('Clave1234');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiadas solicitudes. Espera un momento.',
    );
  });

  it('éxito → /login recibe el aviso de contraseña guardada', async () => {
    // Arrange
    verificar.mockResolvedValue({ proposito: 'CREAR', correo: 'ana@correo.gt' });
    establecer.mockResolvedValue(undefined);
    const { router } = montar();
    await screen.findByLabelText('Contraseña');

    // Act
    await llenar('Clave1234');

    // Assert
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(router.state.location.state).toEqual({
      aviso: expect.objectContaining({ mensaje: 'Contraseña guardada. Ya puedes iniciar sesión.' }),
    });
  });
});
