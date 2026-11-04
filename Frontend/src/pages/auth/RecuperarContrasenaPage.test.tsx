import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../../services/api/auth';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import RecuperarContrasenaPage from './RecuperarContrasenaPage';

vi.mock('../../services/api/auth', () => ({ authApi: { olvido: vi.fn() } }));
const olvido = vi.mocked(authApi.olvido);

const enviar = () => userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

describe('RecuperarContrasenaPage', () => {
  beforeEach(() => {
    olvido.mockReset();
  });

  it('envía el correo y muestra siempre el mismo mensaje', async () => {
    // Arrange
    olvido.mockResolvedValue({ mensaje: 'x' });
    renderizar(<RecuperarContrasenaPage />, { ruta: '/recuperar-contrasena' });
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.gt');

    // Act
    await enviar();

    // Assert
    expect(await screen.findByText(/Si el correo está registrado/)).toBeInTheDocument();
    expect(olvido).toHaveBeenCalledWith('ana@correo.gt');
  });

  it('correo inválido → error en el campo y sin llamar a la API', async () => {
    // Arrange
    renderizar(<RecuperarContrasenaPage />, { ruta: '/recuperar-contrasena' });
    await userEvent.type(screen.getByLabelText('Correo'), 'no-es-correo');

    // Act
    await enviar();

    // Assert
    expect(await screen.findByText('Ingresa un correo válido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
    expect(olvido).not.toHaveBeenCalled();
  });

  it('429 → alerta de demasiadas solicitudes', async () => {
    // Arrange
    olvido.mockRejectedValue(new ApiError(429, 'DEMASIADAS_SOLICITUDES', 'Muchas.'));
    renderizar(<RecuperarContrasenaPage />, { ruta: '/recuperar-contrasena' });
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.gt');

    // Act
    await enviar();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiadas solicitudes');
  });

  it('503 → alerta de servicio no disponible', async () => {
    // Arrange
    olvido.mockRejectedValue(new ApiError(503, 'SERVICIO_NO_DISPONIBLE', 'Sin Redis.'));
    renderizar(<RecuperarContrasenaPage />, { ruta: '/recuperar-contrasena' });
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.gt');

    // Act
    await enviar();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible');
  });
});
