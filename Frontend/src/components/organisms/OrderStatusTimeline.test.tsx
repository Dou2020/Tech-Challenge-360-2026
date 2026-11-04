import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CambioEstadoPedido } from '../../types/pedidos';
import { OrderStatusTimeline } from './OrderStatusTimeline';

const creado: CambioEstadoPedido = {
  idHistorialEstadoPedido: 1,
  idPedido: 1503,
  estadoAnterior: null,
  estadoNuevo: { codigo: 'PAGADO', nombre: 'Pagado' },
  idUsuario: 6,
  usuario: 'Ana López',
  comentario: null,
  fecha: '2026-11-03T15:31:00.000Z',
};

describe('OrderStatusTimeline', () => {
  it('primer cambio → "Pedido creado", estado y fecha de Guatemala', () => {
    // Act
    render(<OrderStatusTimeline historial={[creado]} />);

    // Assert
    expect(screen.getByRole('list', { name: 'Historial de estados' })).toBeInTheDocument();
    expect(screen.getByText('Pagado')).toBeInTheDocument();
    expect(screen.getByText('Pedido creado · Ana López')).toBeInTheDocument();
    expect(screen.getByText('3/11/2026, 9:31 a. m.')).toHaveAttribute(
      'datetime',
      '2026-11-03T15:31:00.000Z',
    );
  });

  it('cambio posterior → indica el estado anterior y el comentario', () => {
    // Arrange
    const despachado: CambioEstadoPedido = {
      ...creado,
      idHistorialEstadoPedido: 2,
      estadoAnterior: { codigo: 'EN_PREPARACION', nombre: 'En preparación' },
      estadoNuevo: { codigo: 'DESPACHADO', nombre: 'Despachado' },
      usuario: 'Omar Pérez',
      comentario: 'Entregado a la paquetería',
    };

    // Act
    render(<OrderStatusTimeline historial={[creado, despachado]} />);

    // Assert
    expect(screen.getByText('Antes: En preparación · Omar Pérez')).toBeInTheDocument();
    expect(screen.getByText('“Entregado a la paquetería”')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
