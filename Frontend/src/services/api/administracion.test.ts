import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../http';
import { bitacoraApi, configuracionApi, cuponesApi, usuariosApi } from './administracion';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

describe('administracion (cupones, usuarios, bitácora, configuración)', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it.each([
    [
      'cupones.listar',
      () => cuponesApi.listar({ q: 'v', page: 2, activo: '' }),
      '/cupones?q=v&page=2',
      undefined,
    ],
    ['cupones.obtener', () => cuponesApi.obtener(3), '/cupones/3', undefined],
    [
      'cupones.crear',
      () => cuponesApi.crear({ codigo: 'X' } as never),
      '/cupones',
      { method: 'POST', body: { codigo: 'X' } },
    ],
    [
      'cupones.actualizar',
      () => cuponesApi.actualizar(3, { codigo: 'Y' } as never),
      '/cupones/3',
      { method: 'PUT', body: { codigo: 'Y' } },
    ],
    [
      'cupones.cambiarEstado',
      () => cuponesApi.cambiarEstado(3, false),
      '/cupones/3/estado',
      { method: 'PATCH', body: { activo: false } },
    ],
    ['cupones.eliminar', () => cuponesApi.eliminar(3), '/cupones/3', { method: 'DELETE' }],
    [
      'cupones.usos',
      () => cuponesApi.usos(3, { page: 2, sort: 'fecha:desc' }),
      '/cupones/3/usos?page=2&sort=fecha%3Adesc',
      undefined,
    ],
    [
      'usuarios.listar',
      () => usuariosApi.listar({ rol: 'Operador' }),
      '/usuarios?rol=Operador',
      undefined,
    ],
    [
      'usuarios.crear',
      () => usuariosApi.crear({ correo: 'a@b.gt' } as never),
      '/usuarios',
      { method: 'POST', body: { correo: 'a@b.gt' } },
    ],
    [
      'usuarios.actualizar',
      () => usuariosApi.actualizar(2, { nombre: 'N' } as never),
      '/usuarios/2',
      { method: 'PUT', body: { nombre: 'N' } },
    ],
    [
      'usuarios.reenviarInvitacion',
      () => usuariosApi.reenviarInvitacion(2),
      '/usuarios/2/invitacion',
      { method: 'POST' },
    ],
    [
      'usuarios.cambiarEstado',
      () => usuariosApi.cambiarEstado(2, true),
      '/usuarios/2/estado',
      { method: 'PATCH', body: { activo: true } },
    ],
    [
      'bitacora.listar',
      () => bitacoraApi.listar({ modulo: 'Inventario', idRegistro: 41 }),
      '/bitacora?modulo=Inventario&idRegistro=41',
      undefined,
    ],
    ['bitacora.modulos', () => bitacoraApi.modulos(), '/bitacora/modulos', undefined],
    ['configuracion.listar', () => configuracionApi.listar(), '/configuracion', undefined],
    [
      'configuracion.actualizar',
      () => configuracionApi.actualizar('MinutosReserva', '20'),
      '/configuracion/MinutosReserva',
      { method: 'PUT', body: { valor: '20' } },
    ],
  ] as const)('%s → llama al endpoint correcto', async (_n, llamar, ruta, opciones) => {
    // Act
    await llamar();

    // Assert
    if (opciones) expect(pedir).toHaveBeenCalledWith(ruta, opciones);
    else expect(pedir).toHaveBeenCalledWith(ruta);
  });
});
