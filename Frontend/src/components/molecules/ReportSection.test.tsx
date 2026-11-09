import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { ReportSection } from './ReportSection';

const base = {
  data: undefined,
  isPending: false,
  isError: false,
  error: undefined,
  refetch: vi.fn(),
};

describe('ReportSection', () => {
  it('cargando → indicador de carga con el título', () => {
    // Act
    render(
      <ReportSection titulo="Ventas" consulta={{ ...base, isPending: true }}>
        {() => <p>datos</p>}
      </ReportSection>,
    );

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando ventas' })).toBeInTheDocument();
  });

  it('consulta deshabilitada (rango inválido) → pide corregir el rango', () => {
    // Act
    render(
      <ReportSection titulo="Ventas" consulta={{ ...base, isPending: true, fetchStatus: 'idle' }}>
        {() => <p>datos</p>}
      </ReportSection>,
    );

    // Assert
    expect(
      screen.getByText('Corrige el rango de fechas para ver este reporte.'),
    ).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar llama a refetch', async () => {
    // Arrange
    const refetch = vi.fn();
    render(
      <ReportSection
        titulo="Ventas"
        consulta={{
          ...base,
          isError: true,
          error: new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-7'),
          refetch,
        }}
      >
        {() => <p>datos</p>}
      </ReportSection>,
    );
    expect(screen.getByText('Referencia: req-7')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('arreglo vacío → EmptyState con el texto por defecto', () => {
    // Act
    render(
      <ReportSection titulo="Ventas" consulta={{ ...base, data: [] }}>
        {() => <p>datos</p>}
      </ReportSection>,
    );

    // Assert
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.getByText('No hay datos en el periodo elegido.')).toBeInTheDocument();
  });

  it('estaVacio y textoVacio propios → se usan', () => {
    // Act
    render(
      <ReportSection
        titulo="Carritos"
        consulta={{ ...base, data: { total: 0 } }}
        estaVacio={(d) => d.total === 0}
        textoVacio="Ningún carrito abandonado."
      >
        {() => <p>datos</p>}
      </ReportSection>,
    );

    // Assert
    expect(screen.getByText('Ningún carrito abandonado.')).toBeInTheDocument();
  });

  it('con datos → muestra lo que pinta el hijo', () => {
    // Act
    render(
      <ReportSection titulo="Ventas" consulta={{ ...base, data: [1, 2] }}>
        {(d) => <p>{d.length} filas</p>}
      </ReportSection>,
    );

    // Assert
    expect(screen.getByText('2 filas')).toBeInTheDocument();
  });

  it('acciones con datos → se muestran junto al título y reciben los datos', () => {
    // Act
    render(
      <ReportSection
        titulo="Ventas"
        consulta={{ ...base, data: [1, 2, 3] }}
        acciones={(d) => <button type="button">Exportar {d.length}</button>}
      >
        {() => <p>datos</p>}
      </ReportSection>,
    );

    // Assert
    expect(screen.getByRole('button', { name: 'Exportar 3' })).toBeInTheDocument();
  });

  it.each([
    ['cargando', { ...base, isPending: true }],
    ['con error', { ...base, isError: true, error: new Error('x') }],
    ['vacío', { ...base, data: [] }],
    ['rango inválido', { ...base, isPending: true, fetchStatus: 'idle' }],
  ])('acciones %s → no se muestran', (_estado, consulta) => {
    // Act
    render(
      <ReportSection
        titulo="Ventas"
        consulta={consulta}
        acciones={() => <button type="button">Exportar</button>}
      >
        {() => <p>datos</p>}
      </ReportSection>,
    );

    // Assert
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
  });
});
