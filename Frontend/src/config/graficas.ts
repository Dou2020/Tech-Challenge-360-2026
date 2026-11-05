/**
 * Estilos de recharts que siguen el tema. Usan las variables de :root y .dark de styles.css
 * (--primario, --borde…), que siempre existen; no importan recharts, así que este archivo no
 * arrastra la librería al bundle inicial.
 */
export const COLOR_SERIE = 'var(--primario)';
export const COLOR_SERIE_SECUNDARIA = 'var(--aviso)';

export const ejeGrafica = {
  tick: { fontSize: 12, fill: 'var(--texto-tenue)' },
  axisLine: { stroke: 'var(--borde)' },
  tickLine: { stroke: 'var(--borde)' },
};

export const cuadriculaGrafica = { stroke: 'var(--borde)', strokeDasharray: '3 3' };

export const tooltipGrafica = {
  contentStyle: {
    backgroundColor: 'var(--superficie)',
    border: '1px solid var(--borde)',
    borderRadius: '0.75rem',
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--texto)', fontWeight: 600 },
  itemStyle: { color: 'var(--texto-suave)' },
  cursor: { fill: 'var(--superficie-suave)' },
};
