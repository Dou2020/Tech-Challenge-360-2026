import { vi } from 'vitest';

/**
 * Simula `window.matchMedia('(prefers-color-scheme: dark)')`, que jsdom no trae.
 * `cambiar(oscuro)` emula que el usuario cambia el tema del sistema operativo.
 * Se deshace con `vi.unstubAllGlobals()`.
 */
export function simularTemaSistema(oscuro: boolean) {
  const oyentes = new Set<() => void>();
  const consulta = {
    matches: oscuro,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_evento: string, oyente: () => void) => oyentes.add(oyente),
    removeEventListener: (_evento: string, oyente: () => void) => oyentes.delete(oyente),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => consulta),
  );
  return {
    cambiar(nuevo: boolean) {
      consulta.matches = nuevo;
      oyentes.forEach((oyente) => oyente());
    },
  };
}
