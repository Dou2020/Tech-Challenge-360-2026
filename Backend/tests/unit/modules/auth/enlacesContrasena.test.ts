import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../../src/config/env.js';
import {
  enlaceConToken,
  enlaceRecuperar,
  enviarEnlaceContrasena,
} from '../../../../src/modules/auth/enlacesContrasena.js';
import { tokensContrasenaStore } from '../../../../src/modules/auth/tokensContrasena.store.js';
import { correo } from '../../../../src/shared/correo/correo.js';

vi.mock('../../../../src/modules/auth/tokensContrasena.store.js', () => ({
  tokensContrasenaStore: { emitir: vi.fn() },
  VIGENCIA_TOKEN_MIN: { CREAR: 4320, RESTABLECER: 60 },
}));
vi.mock('../../../../src/shared/correo/correo.js', () => ({
  correo: { enviarEnSegundoPlano: vi.fn() },
}));

const destinatario = { idUsuario: 7, correo: 'ana@shopcart.gt', nombre: 'Ana', rol: 'Operador' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tokensContrasenaStore.emitir).mockResolvedValue('TOKEN');
});

describe('enlaces de contraseña', () => {
  it('arma el enlace con el token en el fragmento, no en la query', () => {
    // Act & Assert
    expect(enlaceConToken('/crear-contrasena', 'abc')).toBe(
      `${env.APP_URL_PUBLICA}/crear-contrasena#token=abc`,
    );
    expect(enlaceRecuperar()).toBe(`${env.APP_URL_PUBLICA}/recuperar-contrasena`);
  });

  it.each([
    ['bienvenida', 'CREAR', '/crear-contrasena#token=TOKEN'],
    ['invitacion', 'CREAR', '/crear-contrasena#token=TOKEN'],
    ['restablecer', 'RESTABLECER', '/restablecer-contrasena#token=TOKEN'],
  ] as const)(
    '%s emite un token %s y manda el correo con su enlace',
    async (tipo, proposito, ruta) => {
      // Act
      await enviarEnlaceContrasena(tipo, destinatario);

      // Assert
      expect(tokensContrasenaStore.emitir).toHaveBeenCalledWith(7, proposito);
      const mensaje = vi.mocked(correo.enviarEnSegundoPlano).mock.calls[0]![0];
      expect(mensaje.para).toBe('ana@shopcart.gt');
      expect(mensaje.texto).toContain(`${env.APP_URL_PUBLICA}${ruta}`);
    },
  );

  it('si Redis falla no manda correo', async () => {
    // Arrange
    vi.mocked(tokensContrasenaStore.emitir).mockRejectedValue(new Error('503'));

    // Act
    const resultado = enviarEnlaceContrasena('bienvenida', destinatario);

    // Assert
    await expect(resultado).rejects.toThrow('503');
    expect(correo.enviarEnSegundoPlano).not.toHaveBeenCalled();
  });
});
