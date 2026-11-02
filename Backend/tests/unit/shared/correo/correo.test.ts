import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../../../src/config/logger.js';
import {
  bandejaEnMemoria,
  correo,
  crearCorreoEnMemoria,
  crearCorreoSmtp,
} from '../../../../src/shared/correo/correo.js';

const sendMail = vi.fn();
const createTransport = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({ createTransport }));

const mensaje = { para: 'ana@shopcart.gt', asunto: 'Hola', texto: 'texto', html: '<p>html</p>' };

beforeEach(() => {
  vi.clearAllMocks();
  createTransport.mockReturnValue({ sendMail });
});

describe('correo en memoria', () => {
  it('guarda los mensajes en la bandeja y se puede vaciar', async () => {
    // Arrange
    const memoria = crearCorreoEnMemoria();

    // Act
    await memoria.enviar(mensaje);
    memoria.enviarEnSegundoPlano({ ...mensaje, asunto: 'Otro' });

    // Assert
    expect(memoria.bandeja.map((m) => m.asunto)).toEqual(['Hola', 'Otro']);
    expect(memoria.bandeja[0]?.enviadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    memoria.vaciarBandeja();
    expect(memoria.bandeja).toHaveLength(0);
  });

  it('con CORREO_TRANSPORTE=memoria el correo de la aplicación expone la bandeja', () => {
    // Act & Assert
    expect(bandejaEnMemoria()).toBe(correo);
  });
});

describe('correo SMTP', () => {
  const opciones = { host: 'mailpit', port: 1025, secure: false, remitente: 'ShopCart <a@b.gt>' };

  it('crea el transporte con el servidor y envía con el remitente configurado', async () => {
    // Arrange
    sendMail.mockResolvedValue({});
    const smtp = crearCorreoSmtp(opciones);

    // Act
    await smtp.enviar(mensaje);

    // Assert
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'mailpit', port: 1025, secure: false }),
    );
    expect(createTransport.mock.calls[0]![0]).not.toHaveProperty('auth');
    expect(sendMail).toHaveBeenCalledWith({
      from: 'ShopCart <a@b.gt>',
      to: 'ana@shopcart.gt',
      subject: 'Hola',
      text: 'texto',
      html: '<p>html</p>',
    });
  });

  it('con usuario configura la autenticación', () => {
    // Act
    crearCorreoSmtp({ ...opciones, user: 'u', password: 'p' });

    // Assert
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: 'u', pass: 'p' } }),
    );
  });

  it('enviarEnSegundoPlano no espera ni lanza: un fallo solo se registra', async () => {
    // Arrange
    sendMail.mockRejectedValue(new Error('SMTP caído'));
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const smtp = crearCorreoSmtp(opciones);

    // Act
    const resultado = smtp.enviarEnSegundoPlano(mensaje);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    // Assert
    expect(resultado).toBeUndefined();
    expect(JSON.stringify(error.mock.calls[0]![0])).not.toContain('ana@shopcart.gt');
  });
});
