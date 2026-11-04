import { describe, expect, it } from 'vitest';
import { municipiosDe, nombresDepartamentos } from './ubicaciones';

describe('ubicaciones', () => {
  it('incluye los 22 departamentos y los 340 municipios de Guatemala', () => {
    // Arrange / Act
    const total = nombresDepartamentos.reduce((suma, d) => suma + municipiosDe(d).length, 0);

    // Assert
    expect(nombresDepartamentos).toHaveLength(22);
    expect(total).toBe(340);
  });

  it('Escuintla tiene 14 municipios, con Sipacate', () => {
    // Arrange / Act
    const municipios = municipiosDe('Escuintla');

    // Assert
    expect(municipios).toHaveLength(14);
    expect(municipios).toContain('Sipacate');
  });

  it('un departamento desconocido no tiene municipios', () => {
    // Arrange / Act / Assert
    expect(municipiosDe('Atlantis')).toEqual([]);
  });
});
