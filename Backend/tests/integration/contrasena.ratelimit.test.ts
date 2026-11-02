import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Debe correr antes de los imports: src/middlewares/rateLimit.ts lee el límite al cargarse.
const LIMITE = vi.hoisted(() => {
  process.env.RATE_LIMIT_CONTRASENA_MAX = '2';
  return 2;
});

import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis, redis } from '../../src/config/redis.js';
import { claves } from '../../src/shared/cache/claves.js';
import { correoUnico } from '../helpers/auth.js';

/*
 * Límite por IP de las 3 rutas de contraseña con RATE_LIMIT_CONTRASENA_MAX = 2.
 * Cada ruta tiene su propio contador en Redis (ventana de 15 min): se borran antes y después
 * para que otras corridas y otros archivos (que usan límite 10000) no los encuentren gastados.
 */

const app = createApp();

async function borrarContadores(): Promise<void> {
  for (const ruta of ['olvido', 'verificar', 'establecer']) {
    const encontradas = await redis.keys(`${claves.prefijoRateLimit(`contrasena-${ruta}`)}*`);
    if (encontradas.length > 0) await redis.del(encontradas);
  }
}

beforeAll(async () => {
  await connectRedis();
  await borrarContadores();
});

afterAll(async () => {
  await borrarContadores();
  await Promise.all([closePool(), closeRedis()]);
});

const RUTAS = [
  ['olvido', () => ({ correo: correoUnico('nadie') }), 202],
  ['verificar', () => ({ token: 'token-que-no-existe' }), 400],
  ['establecer', () => ({ token: 'token-que-no-existe', contrasena: 'Nueva#2030' }), 400],
] as const;

describe('límite por IP en las rutas de contraseña', () => {
  it.each(RUTAS)(
    'POST /contrasena/%s: pasado el límite responde 429 DEMASIADAS_SOLICITUDES con Retry-After',
    async (ruta, cuerpo, estadoNormal) => {
      // Arrange
      const enviar = () => request(app).post(`/api/auth/contrasena/${ruta}`).send(cuerpo());
      const permitidas = [];
      for (let i = 0; i < LIMITE; i++) permitidas.push(await enviar());

      // Act
      const excedida = await enviar();

      // Assert
      for (const respuesta of permitidas) expect(respuesta.status).toBe(estadoNormal);
      expect(excedida.status).toBe(429);
      expect(excedida.body.error.code).toBe('DEMASIADAS_SOLICITUDES');
      expect(Number(excedida.headers['retry-after'])).toBeGreaterThan(0);
    },
  );

  it('agotar el límite de olvido no afecta a las otras dos rutas (contadores independientes)', async () => {
    // Arrange
    await borrarContadores();
    for (let i = 0; i <= LIMITE; i++) {
      await request(app)
        .post('/api/auth/contrasena/olvido')
        .send({ correo: correoUnico('nadie') });
    }

    // Act
    const respuesta = await request(app)
      .post('/api/auth/contrasena/verificar')
      .send({ token: 'token-que-no-existe' });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('TOKEN_CONTRASENA_INVALIDO');
  });
});
