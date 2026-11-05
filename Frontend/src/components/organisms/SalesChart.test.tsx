import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SalesChart } from './SalesChart';

describe('SalesChart', () => {
  it('con datos → gráfica accesible con los periodos en el eje', () => {
    // Act
    render(
      <SalesChart
        datos={[
          { periodoInicio: '2026-11-01', ventas: '1200.00', pedidos: 3, unidadesNetas: 6 },
          { periodoInicio: '2026-11-02', ventas: '800.50', pedidos: 2, unidadesNetas: 4 },
        ]}
      />,
    );

    // Assert
    expect(
      screen.getByRole('img', { name: 'Gráfica de ventas netas por periodo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('01/11/2026')).toBeInTheDocument();
    expect(screen.getByText('02/11/2026')).toBeInTheDocument();
  });

  // jsdom no calcula el layout, pero recharts dibuja con la dimensión inicial: se verifica el DOM SVG que genera
  // (no hay roles accesibles dentro de la gráfica, por eso se consulta por las clases de la librería).
  describe('línea de pedidos y eje derecho', () => {
    const datos = [
      { periodoInicio: '2026-11-01', ventas: '1200.00', pedidos: 3, unidadesNetas: 6 },
      { periodoInicio: '2026-11-02', ventas: '800.50', pedidos: 2, unidadesNetas: 4 },
    ];

    it('dibuja la línea de pedidos con un punto por periodo y las barras de ventas', () => {
      // Act
      const { container } = render(<SalesChart datos={datos} />);

      // Assert
      expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(2);
      expect(container.querySelector('.recharts-line-curve')).toBeInTheDocument();
      expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2);
    });

    it('tiene dos ejes verticales: ventas en quetzales a la izquierda y pedidos enteros a la derecha', async () => {
      // Act
      const { container } = render(<SalesChart datos={datos} />);

      // Assert
      const etiquetas = () =>
        [...container.querySelectorAll('.recharts-yAxis-tick-labels')].map((eje) =>
          [...eje.querySelectorAll('.recharts-cartesian-axis-tick-value')].map(
            (t) => t.textContent,
          ),
        );
      expect(container.querySelectorAll('.recharts-yAxis')).toHaveLength(2);
      await waitFor(() => expect(etiquetas()).toHaveLength(2));
      const [izquierdo, derecho] = etiquetas();
      expect(izquierdo!.length).toBeGreaterThan(0);
      expect(izquierdo!.every((t) => /^Q \d+$/.test(t ?? ''))).toBe(true);
      expect(derecho!.length).toBeGreaterThan(0);
      expect(derecho!.every((t) => /^\d+$/.test(t ?? ''))).toBe(true);
    });

    it('sin datos → no dibuja puntos de la línea', () => {
      // Act
      const { container } = render(<SalesChart datos={[]} />);

      // Assert
      expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(0);
    });
  });
});
