import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../../services/api/auth';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import RegistroPage from './RegistroPage';

vi.mock('../../services/api/auth', () => ({ authApi: { registro: vi.fn() } }));
const registro = vi.mocked(authApi.registro);

async function llenar(correo = 'ana@correo.gt') {
  await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
  await userEvent.type(screen.getByLabelText('Apellido'), 'López');
  await userEvent.type(screen.getByLabelText('Correo'), correo);
}

const enviar = () => userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

describe('RegistroPage', () => {
  beforeEach(() => {
    registro.mockReset();
  });

  it('no pide contraseña', () => {
    // Act
    renderizar(<RegistroPage />, { ruta: '/registro' });

    // Assert
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
  });

  it('registra sin teléfono, no abre sesión y muestra el mensaje de revisar el correo', async () => {
    // Arrange
    registro.mockResolvedValue({ mensaje: 'Te enviamos un correo para crear tu contraseña.' });
    renderizar(<RegistroPage />, { ruta: '/registro' });
    await llenar();

    // Act
    await enviar();

    // Assert
    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument();
    expect(screen.getByText('Te enviamos un correo para crear tu contraseña.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(registro).toHaveBeenCalledWith({
      nombre: 'Ana',
      apellido: 'López',
      correo: 'ana@correo.gt',
    });
  });

  it('con teléfono lo incluye en el body', async () => {
    // Arrange
    registro.mockResolvedValue({ mensaje: 'ok' });
    renderizar(<RegistroPage />, { ruta: '/registro' });
    await llenar();
    await userEvent.type(screen.getByLabelText(/Teléfono/), '5555 1234');

    // Act
    await enviar();

    // Assert
    await screen.findByText('Revisa tu correo');
    expect(registro).toHaveBeenCalledWith(expect.objectContaining({ telefono: '5555 1234' }));
  });

  it('formulario vacío → errores por campo con aria-invalid y sin llamar a la API', async () => {
    // Arrange
    renderizar(<RegistroPage />, { ruta: '/registro' });

    // Act
    await enviar();

    // Assert
    expect(await screen.findByText('Ingresa tu nombre.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu apellido.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa un correo válido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect(registro).not.toHaveBeenCalled();
  });

  it('teléfono inválido → muestra su error y no registra', async () => {
    // Arrange
    renderizar(<RegistroPage />, { ruta: '/registro' });
    await llenar();
    await userEvent.type(screen.getByLabelText(/Teléfono/), '123');

    // Act
    await enviar();

    // Assert
    expect(await screen.findByText('Teléfono inválido (8 a 20 dígitos).')).toBeInTheDocument();
    expect(registro).not.toHaveBeenCalled();
  });

  it('el backend rechaza campos (details) → cada mensaje queda en su campo', async () => {
    // Arrange
    registro.mockRejectedValue(
      new ApiError(400, 'VALIDACION', 'Datos inválidos', [
        { field: 'correo', message: 'Correo no permitido.' },
      ]),
    );
    renderizar(<RegistroPage />, { ruta: '/registro' });
    await llenar();

    // Act
    await enviar();

    // Assert
    const campo = await screen.findByLabelText('Correo');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('Correo no permitido.');
  });

  it('429 → alerta de demasiadas solicitudes', async () => {
    // Arrange
    registro.mockRejectedValue(
      new ApiError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiadas solicitudes.'),
    );
    renderizar(<RegistroPage />, { ruta: '/registro' });
    await llenar();

    // Act
    await enviar();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.',
    );
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Arrange
    registro.mockRejectedValue(new Error('red'));
    renderizar(<RegistroPage />, { ruta: '/registro' });
    await llenar();

    // Act
    await enviar();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo crear la cuenta.');
  });

  it('503 → alerta de servicio no disponible', async () => {
    // Arrange
    registro.mockRejectedValue(
      new ApiError(503, 'SERVICIO_NO_DISPONIBLE', 'Servicio no disponible.'),
    );
    renderizar(<RegistroPage />, { ruta: '/registro' });
    await llenar();

    // Act
    await enviar();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible por ahora. Inténtalo de nuevo más tarde.',
    );
  });

  it('el enlace a iniciar sesión conserva el redirect', () => {
    // Act
    renderizar(<RegistroPage />, { ruta: '/registro?redirect=%2Fcheckout' });

    // Assert
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fcheckout',
    );
  });

  it('registro correcto con redirect → el enlace posterior a login también lo conserva', async () => {
    // Arrange
    registro.mockResolvedValue({ mensaje: 'Revisa tu correo.' });
    renderizar(<RegistroPage />, { ruta: '/registro?redirect=%2Fcheckout' });
    await llenar();

    // Act
    await enviar();

    // Assert
    expect(await screen.findByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fcheckout',
    );
  });
});
