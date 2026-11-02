import { rangoFechas, aIso } from '../../shared/utils/fechas.js';
import {
  respuestaPaginada,
  type Paginacion,
  type RespuestaPaginada,
} from '../../shared/utils/paginacion.js';
import { bitacoraRepository } from './bitacora.repository.js';
import type {
  EntradaBitacora,
  FilaBitacora,
  FiltrosBitacora,
  FiltrosBitacoraSp,
} from './bitacora.types.js';

/** La bitácora no se cachea: es una consulta de auditoría que debe reflejar lo último. */

/** IDBitacora es BIGINT (string en el driver); en JSON va como number si es seguro. */
export function aIdBitacora(valor: string | number): number {
  const id = Number(valor);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`IDBitacora fuera del rango seguro de JavaScript: ${valor}`);
  }
  return id;
}

/** Los valores se guardan como texto JSON; la API los devuelve como objetos. */
export function aObjetoJson(texto: string | null): unknown {
  if (texto === null) return null;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto;
  }
}

export function aFiltrosSp(filtros: FiltrosBitacora): FiltrosBitacoraSp {
  return {
    modulo: filtros.modulo ?? null,
    entidad: filtros.entidad ?? null,
    idRegistro: filtros.idRegistro ?? null,
    idUsuario: filtros.idUsuario ?? null,
    accion: filtros.accion ?? null,
    ...rangoFechas(filtros.desde, filtros.hasta),
  };
}

function aEntrada(fila: FilaBitacora): EntradaBitacora {
  return {
    idBitacora: aIdBitacora(fila.IDBitacora),
    idUsuario: fila.IDUsuario,
    usuario: fila.Usuario,
    correoUsuario: fila.CorreoUsuario,
    modulo: fila.Modulo,
    entidad: fila.Entidad,
    idRegistro: fila.IDRegistro,
    accion: fila.Accion,
    valorAnterior: aObjetoJson(fila.ValorAnterior),
    valorNuevo: aObjetoJson(fila.ValorNuevo),
    fecha: aIso(fila.Fecha),
  };
}

export const bitacoraService = {
  async listar(
    filtros: FiltrosBitacora,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<EntradaBitacora>> {
    const resultado = await bitacoraRepository.listar(aFiltrosSp(filtros), paginacion);
    const pagina = respuestaPaginada(resultado, paginacion, aEntrada);
    // Total es BIGINT: el driver lo entrega como string.
    return { ...pagina, total: Number(pagina.total) };
  },

  async listarModulos(): Promise<string[]> {
    return (await bitacoraRepository.listarModulos()).map((fila) => fila.Modulo);
  },
};
