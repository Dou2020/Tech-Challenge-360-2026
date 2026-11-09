import { env } from '../../config/env.js';
import { cache, type ResultadoCache } from '../../shared/cache/cache.js';
import { aIso } from '../../shared/utils/fechas.js';
import {
  respuestaPaginada,
  type Paginacion,
  type RespuestaPaginada,
} from '../../shared/utils/paginacion.js';
import { sucursalesRepository } from './sucursales.repository.js';
import type {
  DatosSucursal,
  FilaSucursal,
  FilaSucursalPublica,
  FiltrosSucursales,
  Sucursal,
  SucursalPublica,
} from './sucursales.types.js';

/*
 * Caché (namespace `catalogo`, versionado): solo la lista pública de sucursales activas.
 * Toda escritura invalida el namespace completo (también las categorías públicas y los métodos
 * de envío): son escrituras raras de un administrador. Se invalida después de que el SP confirmó.
 */
export const CLAVE_CACHE_SUCURSALES = 'sucursales';

const invalidarCatalogo = () => cache.invalidar('catalogo');

function aSucursalPublica(fila: FilaSucursalPublica): SucursalPublica {
  return {
    idSucursal: fila.IDSucursal,
    nombre: fila.Nombre,
    telefono: fila.Telefono,
    linea1: fila.Linea1,
    linea2: fila.Linea2,
    municipio: fila.Municipio,
    departamento: fila.Departamento,
    codigoPostal: fila.CodigoPostal,
    horario: fila.Horario,
  };
}

function aSucursal(fila: FilaSucursal): Sucursal {
  return {
    ...aSucursalPublica(fila),
    activo: Boolean(fila.Activo),
    cantidadPedidos: fila.CantidadPedidos,
    fechaCreacion: aIso(fila.FechaCreacion),
    fechaModificacion: aIso(fila.FechaModificacion),
  };
}

export const sucursalesService = {
  async listarPublicas(): Promise<ResultadoCache<SucursalPublica[]>> {
    const clave = await cache.claveVersionada('catalogo', CLAVE_CACHE_SUCURSALES);
    return cache.getOrSet(clave, env.CACHE_TTL_CATALOGO_SEG, async () =>
      (await sucursalesRepository.listarPublicas()).map(aSucursalPublica),
    );
  },

  async listar(
    idUsuario: number,
    filtros: FiltrosSucursales,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<Sucursal>> {
    const resultado = await sucursalesRepository.listar(idUsuario, filtros, paginacion);
    return respuestaPaginada(resultado, paginacion, aSucursal);
  },

  async obtener(id: number): Promise<Sucursal> {
    return aSucursal(await sucursalesRepository.obtener(id));
  },

  async crear(idUsuario: number, datos: DatosSucursal): Promise<Sucursal> {
    const sucursal = aSucursal(await sucursalesRepository.crear(idUsuario, datos));
    await invalidarCatalogo();
    return sucursal;
  },

  async actualizar(idUsuario: number, id: number, datos: DatosSucursal): Promise<Sucursal> {
    const sucursal = aSucursal(await sucursalesRepository.actualizar(idUsuario, id, datos));
    await invalidarCatalogo();
    return sucursal;
  },

  async cambiarEstado(idUsuario: number, id: number, activo: boolean): Promise<Sucursal> {
    const sucursal = aSucursal(await sucursalesRepository.cambiarEstado(idUsuario, id, activo));
    await invalidarCatalogo();
    return sucursal;
  },

  async eliminar(idUsuario: number, id: number): Promise<void> {
    await sucursalesRepository.eliminar(idUsuario, id);
    await invalidarCatalogo();
  },
};
