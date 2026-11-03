import { useSyncExternalStore } from 'react';
import {
  CLAVE_TEMA,
  aplicarTema,
  consultaSistema,
  guardarPreferencia,
  leerPreferencia,
  temaEfectivo,
  type PreferenciaTema,
} from '../utils/tema';

/** Evento de esta pestaña; `storage` solo llega a las demás. */
const EVENTO_TEMA = 'shopcart:tema-cambiado';

function suscribir(avisar: () => void): () => void {
  const actualizar = () => {
    aplicarTema(temaEfectivo(leerPreferencia()));
    avisar();
  };
  const desdeOtraPestana = (e: StorageEvent) => {
    if (e.key === CLAVE_TEMA || e.key === null) actualizar();
  };
  const sistema = consultaSistema();

  sistema?.addEventListener('change', actualizar);
  window.addEventListener('storage', desdeOtraPestana);
  window.addEventListener(EVENTO_TEMA, avisar);
  return () => {
    sistema?.removeEventListener('change', actualizar);
    window.removeEventListener('storage', desdeOtraPestana);
    window.removeEventListener(EVENTO_TEMA, avisar);
  };
}

function cambiarPreferencia(preferencia: PreferenciaTema): void {
  guardarPreferencia(preferencia);
  aplicarTema(temaEfectivo(preferencia));
  window.dispatchEvent(new Event(EVENTO_TEMA));
}

/**
 * Tema claro / oscuro / sistema. La preferencia vive en localStorage; el tema efectivo cambia
 * solo si el sistema operativo cambia mientras la preferencia es "sistema".
 */
export function useTema() {
  const preferencia = useSyncExternalStore(suscribir, leerPreferencia);
  const tema = useSyncExternalStore(suscribir, () => temaEfectivo(leerPreferencia()));
  return { preferencia, tema, cambiarPreferencia };
}
