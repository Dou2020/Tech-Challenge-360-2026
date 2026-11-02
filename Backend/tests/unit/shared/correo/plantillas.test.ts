import { describe, expect, it } from 'vitest';
import {
  bienvenida,
  cuentaExistente,
  describirVigencia,
  escaparHtml,
  invitacion,
  restablecer,
} from '../../../../src/shared/correo/plantillas.js';

const base = {
  para: 'ana@shopcart.gt',
  nombre: 'Ana',
  enlace: 'https://tienda.gt/crear-contrasena#token=abc_DEF-123',
  vigenciaMin: 4320,
};

describe('escaparHtml', () => {
  it('escapa los cinco caracteres que permiten inyectar HTML', () => {
    // Act
    const resultado = escaparHtml(`<script>alert("x" & 'y')</script>`);

    // Assert
    expect(resultado).toBe('&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;');
  });
});

describe('describirVigencia', () => {
  it.each([
    [4320, '3 días'],
    [1440, '1 día'],
    [120, '2 horas'],
    [60, '1 hora'],
    [45, '45 minutos'],
    [1, '1 minuto'],
  ])('%i minutos se describe como "%s"', (minutos, esperado) => {
    // Act & Assert
    expect(describirVigencia(minutos)).toBe(esperado);
  });
});

describe('plantillas de correo', () => {
  it('bienvenida lleva el enlace en HTML y en texto, y la vigencia', () => {
    // Act
    const mensaje = bienvenida(base);

    // Assert
    expect(mensaje.para).toBe('ana@shopcart.gt');
    expect(mensaje.asunto).toMatch(/Bienvenido/);
    expect(mensaje.html).toContain(`href="${base.enlace}"`);
    expect(mensaje.texto).toContain(base.enlace);
    expect(mensaje.texto).toContain('3 días');
  });

  it('escapa el nombre en el HTML pero lo deja tal cual en el texto', () => {
    // Act
    const mensaje = restablecer({ ...base, nombre: '<img src=x onerror=alert(1)>' });

    // Assert
    expect(mensaje.html).not.toContain('<img');
    expect(mensaje.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(mensaje.texto).toContain('<img src=x onerror=alert(1)>');
  });

  it('escapa un enlace que intente cerrar el atributo href', () => {
    // Act
    const mensaje = invitacion({ ...base, rol: 'Operador', enlace: 'https://x.gt/"><b>' });

    // Assert
    expect(mensaje.html).not.toContain('"><b>');
    expect(mensaje.html).toContain('&quot;&gt;&lt;b&gt;');
  });

  it('invitacion indica el rol; restablecer avisa que cierra las sesiones', () => {
    // Act
    const inv = invitacion({ ...base, rol: 'Administrador' });
    const res = restablecer({ ...base, vigenciaMin: 60 });

    // Assert
    expect(inv.texto).toContain('Administrador');
    expect(res.texto).toContain('1 hora');
    expect(res.texto).toMatch(/sesiones/);
  });

  it('cuentaExistente enlaza a recuperar y no lleva token', () => {
    // Act
    const mensaje = cuentaExistente({
      para: base.para,
      nombre: base.nombre,
      enlace: 'https://tienda.gt/recuperar-contrasena',
    });

    // Assert
    expect(mensaje.texto).toContain('https://tienda.gt/recuperar-contrasena');
    expect(mensaje.texto).not.toContain('#token=');
  });
});
