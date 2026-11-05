import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('muestra título, valor y ayuda', () => {
    // Act
    render(
      <dl>
        <StatCard titulo="Ventas netas" valor="Q 1,200.00" ayuda="Sin envío" />
      </dl>,
    );

    // Assert
    expect(screen.getByText('Ventas netas')).toBeInTheDocument();
    expect(screen.getByText('Q 1,200.00')).toBeInTheDocument();
    expect(screen.getByText('Sin envío')).toBeInTheDocument();
  });

  it('sin ayuda → no la muestra', () => {
    // Act
    render(
      <dl>
        <StatCard titulo="Pedidos" valor={12} />
      </dl>,
    );

    // Assert
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByText('Sin envío')).not.toBeInTheDocument();
  });
});
