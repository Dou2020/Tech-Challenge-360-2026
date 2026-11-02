import { describe, expect, it } from 'vitest';
import {
  aSegundos,
  extraerBearer,
  familiaDeRefreshToken,
  firmarAccessToken,
  generarRefreshToken,
  hashToken,
  leerAccessTokenParaRevocar,
} from '../../../../src/modules/auth/tokens.js';

const SID = '7b0c1f7e-2a54-4f11-9a0b-3a1c5d7e9f20';

describe('tokens', () => {
  it('convierte la duración del access token a segundos', () => {
    expect(aSegundos('15m')).toBe(900);
    expect(aSegundos('900')).toBe(900);
    expect(aSegundos('30s')).toBe(30);
    expect(aSegundos('1h')).toBe(3_600);
    expect(aSegundos('7d')).toBe(604_800);
  });

  it('el refresh token lleva su familia y en Redis solo se guarda su SHA-256', () => {
    const token = generarRefreshToken(SID);

    expect(familiaDeRefreshToken(token)).toBe(SID);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(generarRefreshToken(SID)).not.toBe(token);
    expect(familiaDeRefreshToken('cualquier-cosa')).toBeUndefined();
  });

  it('extrae el token del header Bearer', () => {
    expect(extraerBearer('Bearer abc.def')).toBe('abc.def');
    expect(extraerBearer('bearer abc')).toBe('abc');
    expect(extraerBearer('Basic abc')).toBeUndefined();
    expect(extraerBearer(undefined)).toBeUndefined();
  });

  it('para revocar acepta solo tokens con firma propia', () => {
    const { accessToken } = firmarAccessToken({ idUsuario: 3, rol: 'Cliente', sid: SID });

    expect(leerAccessTokenParaRevocar(accessToken)).toMatchObject({ idUsuario: 3, sid: SID });
    expect(leerAccessTokenParaRevocar(`${accessToken}x`)).toBeUndefined();
  });
});
