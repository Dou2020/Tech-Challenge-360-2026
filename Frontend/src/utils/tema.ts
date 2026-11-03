/** Lo que eligió el usuario; "sistema" sigue a prefers-color-scheme. */
export type PreferenciaTema = 'claro' | 'oscuro' | 'sistema';
export type Tema = 'claro' | 'oscuro';

/** Clave en localStorage. El script de index.html la lee antes de pintar: deben coincidir. */
export const CLAVE_TEMA = 'shopcart:tema';

/** Color de la barra del navegador (meta theme-color): el `fondo` de cada tema. */
const COLOR_BARRA: Record<Tema, string> = { claro: '#fafafa', oscuro: '#09090b' };

// Si el almacenamiento está bloqueado, la preferencia vale solo mientras la página está abierta.
let respaldo: PreferenciaTema = 'sistema';

export function leerPreferencia(): PreferenciaTema {
  try {
    const valor = localStorage.getItem(CLAVE_TEMA);
    return valor === 'claro' || valor === 'oscuro' ? valor : 'sistema';
  } catch {
    return respaldo;
  }
}

/** "sistema" no se guarda: sin clave, index.html sigue al sistema operativo. */
export function guardarPreferencia(preferencia: PreferenciaTema): void {
  respaldo = preferencia;
  try {
    if (preferencia === 'sistema') localStorage.removeItem(CLAVE_TEMA);
    else localStorage.setItem(CLAVE_TEMA, preferencia);
  } catch {
    // Almacenamiento bloqueado: queda el respaldo en memoria.
  }
}

/** Consulta del tema del sistema; null donde no existe matchMedia (jsdom). */
export function consultaSistema(): MediaQueryList | null {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
}

export function temaEfectivo(preferencia: PreferenciaTema): Tema {
  if (preferencia !== 'sistema') return preferencia;
  return consultaSistema()?.matches ? 'oscuro' : 'claro';
}

/** Pone o quita la clase `dark` de <html> (la variante `dark:` de styles.css) y el color de la barra. */
export function aplicarTema(tema: Tema): void {
  document.documentElement.classList.toggle('dark', tema === 'oscuro');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[tema]);
}
