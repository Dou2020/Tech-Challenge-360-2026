import { describe, expect, it } from 'vitest';
import { ApiError } from '../services/http';
import { avisoErrorTransicion, avisoExito, avisoInfo, errorNotice } from './notice';

describe('notice', () => {
  it('avisoExito → tipo exito con el mensaje', () => {
    // Act
    const aviso = avisoExito('Guardado.');

    // Assert
    expect(aviso).toEqual({ tipo: 'exito', mensaje: 'Guardado.' });
  });

  it('avisoInfo → tipo info con el mensaje', () => {
    // Act
    const aviso = avisoInfo('Sesión expirada.');

    // Assert
    expect(aviso).toEqual({ tipo: 'info', mensaje: 'Sesión expirada.' });
  });

  it('errorNotice con ApiError → conserva el mensaje y el requestId', () => {
    // Arrange
    const error = new ApiError(409, 'RESERVA_VENCIDA', 'La reserva venció.', [], 'req-7');

    // Act
    const aviso = errorNotice(error);

    // Assert
    expect(aviso).toEqual({ tipo: 'error', mensaje: 'La reserva venció.', referencia: 'req-7' });
  });

  it('errorNotice con otro error → usa el mensaje por defecto indicado', () => {
    // Act
    const aviso = errorNotice(new Error('red'), 'No se pudo eliminar.');

    // Assert
    expect(aviso).toEqual({ tipo: 'error', mensaje: 'No se pudo eliminar.' });
  });

  it('errorNotice sin mensaje por defecto → usa el genérico', () => {
    // Act
    const aviso = errorNotice('algo');

    // Assert
    expect(aviso.mensaje).toBe('Ocurrió un error inesperado.');
  });

  it('avisoErrorTransicion con 409 TRANSICION_NO_PERMITIDA → mensaje claro con la referencia', () => {
    // Arrange
    const error = new ApiError(409, 'TRANSICION_NO_PERMITIDA', 'Técnico.', [], 'req-9');

    // Act
    const aviso = avisoErrorTransicion(error);

    // Assert
    expect(aviso.tipo).toBe('error');
    expect(aviso.mensaje).toMatch(/ya no admite ese cambio/);
    expect(aviso.referencia).toBe('req-9');
  });

  it('avisoErrorTransicion con otro error → se comporta como errorNotice', () => {
    // Act
    const aviso = avisoErrorTransicion(new Error('x'));

    // Assert
    expect(aviso).toEqual({ tipo: 'error', mensaje: 'No se pudo completar la acción.' });
  });
});
