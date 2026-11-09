import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../auth/useAuth';
import { escucharEventosPedidos } from '../services/eventosPedidos';
import type { Rol } from '../types/auth';
import type { EventoPedido } from '../types/pedidos';
import { CLAVE_INVENTARIO } from './queries/useInventario';
import { CLAVE_PEDIDOS } from './queries/usePedidos';
import { CLAVE_REPORTES } from './queries/useReportes';

/** Los eventos que llegan juntos (p. ej. varios cambios seguidos) se aplican en una sola pasada. */
export const ESPERA_AGRUPAR_MS = 300;

/**
 * Consultas que dejan de estar al día con un evento. Pedidos siempre (lista, tablero, detalle,
 * historial, devoluciones y los totales del panel de operación). Crear, cancelar y devolver mueven
 * existencia: el inventario del personal. Cualquier cambio de pedido mueve los reportes del
 * Administrador (el backend ya invalidó su caché antes de publicar).
 */
export function clavesAfectadas(rol: Rol, tipo?: EventoPedido['tipo']): readonly string[][] {
  const claves: string[][] = [[...CLAVE_PEDIDOS]];
  const mueveExistencia = tipo === undefined || tipo !== 'ESTADO';
  if (rol !== 'Cliente' && mueveExistencia) claves.push([...CLAVE_INVENTARIO]);
  if (rol === 'Administrador') claves.push([...CLAVE_REPORTES]);
  return claves;
}

/**
 * Mantiene al día las vistas de pedidos con `GET /api/pedidos/stream`: cuando alguien (otro
 * usuario u otra pestaña) cambia un pedido, se vuelven a consultar los datos afectados. El
 * Cliente solo recibe eventos de sus pedidos. Al reconectar se refresca todo, porque el stream
 * no repite lo que se perdió durante el corte.
 */
export function useTiempoRealPedidos(activo: boolean) {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const idUsuario = usuario?.idUsuario;
  const rol = usuario?.rol;

  useEffect(() => {
    if (!activo || idUsuario === undefined || rol === undefined) return;
    const control = new AbortController();
    const pendientes = new Map<string, string[]>();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let conexiones = 0;

    function programar(claves: readonly string[][]) {
      for (const clave of claves) pendientes.set(JSON.stringify(clave), clave);
      temporizador ??= setTimeout(() => {
        temporizador = undefined;
        for (const clave of pendientes.values())
          void queryClient.invalidateQueries({ queryKey: clave });
        pendientes.clear();
      }, ESPERA_AGRUPAR_MS);
    }

    void escucharEventosPedidos({
      signal: control.signal,
      onConectado: () => {
        conexiones += 1;
        if (conexiones > 1) programar(clavesAfectadas(rol));
      },
      onEvento: (evento) => programar(clavesAfectadas(rol, evento.tipo)),
    });

    return () => {
      control.abort();
      clearTimeout(temporizador);
    };
  }, [activo, idUsuario, rol, queryClient]);
}
