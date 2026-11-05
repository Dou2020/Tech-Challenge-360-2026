import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportTable } from './ReportTable';

describe('ReportTable', () => {
  it('muestra caption, encabezados, filas y alinea a la derecha', () => {
    // Act
    render(
      <ReportTable
        titulo="Top"
        columnas={[
          { clave: 'n', titulo: 'Producto', celda: (f: { n: string; v: number }) => f.n },
          { clave: 'v', titulo: 'Unidades', alinear: 'derecha', celda: (f) => f.v },
        ]}
        filas={[
          { n: 'Tenis', v: 4 },
          { n: 'Gorra', v: 2 },
        ]}
        idFila={(f) => f.n}
      />,
    );

    // Assert
    expect(screen.getByRole('table', { name: 'Top' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Unidades' })).toHaveClass('text-right');
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Tenis')).toBeInTheDocument();
  });
});
