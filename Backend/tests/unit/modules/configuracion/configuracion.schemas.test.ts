import { describe, expect, it } from 'vitest';
import { valorBody } from '../../../../src/modules/configuracion/configuracion.schemas.js';

describe('valorBody', () => {
  it('acepta número o texto y lo normaliza a texto sin espacios', () => {
    // Act
    const numero = valorBody.safeParse({ valor: 20 });
    const texto = valorBody.safeParse({ valor: ' 12.50 ' });
    const vacio = valorBody.safeParse({ valor: '  ' });

    // Assert
    expect(numero.data).toEqual({ valor: '20' });
    expect(texto.data).toEqual({ valor: '12.50' });
    expect(vacio.success).toBe(false);
  });
});
