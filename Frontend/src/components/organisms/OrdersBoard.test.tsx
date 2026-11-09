import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { crearPedidoResumen } from '../../test/fixtures/pedidos';
import { renderizar } from '../../test/renderizar';
import type { DestinoPedido, PedidoResumen } from '../../types/pedidos';
import { OrdersBoard, type ColumnaTablero } from './OrdersBoard';

const pagina = (items: PedidoResumen[], total = items.length) => ({
  items,
  page: 1,
  pageSize: 20,
  total,
});

function columna(
  estado: string,
  consulta: Partial<ColumnaTablero['consulta']> = {},
): ColumnaTablero {
  return {
    estado,
    verTodos: `/consola/pedidos?estado=${estado}`,
    consulta: {
      data: pagina([]),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      ...consulta,
    } as ColumnaTablero['consulta'],
  };
}

const pagado = crearPedidoResumen();
const preparando = crearPedidoResumen({
  idPedido: 1504,
  numeroPedido: 'SC-2026-001504',
  estado: 'EN_PREPARACION',
  cantidadUnidades: 1,
});
const entregado = crearPedidoResumen({
  idPedido: 1505,
  numeroPedido: 'SC-2026-001505',
  estado: 'ENTREGADO',
});

const DESTINOS: Record<string, DestinoPedido[]> = {
  PAGADO: [
    { estado: 'EN_PREPARACION', nombre: 'En preparación', via: 'ESTADO' },
    { estado: 'CANCELADO', nombre: 'Cancelado', via: 'CANCELAR' },
  ],
  EN_PREPARACION: [{ estado: 'DESPACHADO', nombre: 'Despachado', via: 'ESTADO' }],
};
const destinos = (origen: string) => DESTINOS[origen] ?? [];

function montar(props: Partial<Parameters<typeof OrdersBoard>[0]> = {}) {
  const onMover = vi.fn();
  renderizar(
    <OrdersBoard
      columnas={[
        columna('PAGADO', { data: pagina([pagado]) }),
        columna('EN_PREPARACION', { data: pagina([preparando]) }),
        columna('DESPACHADO'),
        columna('ENTREGADO', { data: pagina([entregado]) }),
        columna('CANCELADO'),
      ]}
      destinos={destinos}
      onMover={onMover}
      {...props}
    />,
  );
  return { onMover };
}

const seccion = (nombre: RegExp) => screen.getByRole('region', { name: nombre });

describe('OrdersBoard', () => {
  it('una columna por estado con su total y las tarjetas con enlace al detalle', () => {
    // Act
    montar();

    // Assert
    expect(screen.getAllByRole('region')).toHaveLength(5);
    const pagados = seccion(/^Pagado/);
    expect(pagados).toHaveAccessibleName('Pagado, 1 pedido');
    expect(within(pagados).getByRole('link', { name: 'SC-2026-001503' })).toHaveAttribute(
      'href',
      '/consola/pedidos/1503',
    );
    expect(within(pagados).getByText('Ana López')).toBeInTheDocument();
    expect(within(pagados).getByText('2 unidades')).toBeInTheDocument();
    expect(within(pagados).getByText('Q 323.00')).toBeInTheDocument();
    expect(within(seccion(/^En preparación/)).getByText('1 unidad')).toBeInTheDocument();
    expect(within(seccion(/^Despachado/)).getByText('Sin pedidos')).toBeInTheDocument();
  });

  it('más pedidos que tarjetas → "Mostrando N de M" y enlace a la lista filtrada', () => {
    // Act
    montar({ columnas: [columna('PAGADO', { data: pagina([pagado], 45) })] });

    // Assert
    expect(screen.getByText(/Mostrando 1 de 45/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todos los pedidos en Pagado' })).toHaveAttribute(
      'href',
      '/consola/pedidos?estado=PAGADO',
    );
  });

  it('columna cargando → skeleton con su nombre y total pendiente', () => {
    // Act
    montar({ columnas: [columna('PAGADO', { data: undefined, isPending: true })] });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando Pagado' })).toBeInTheDocument();
    expect(seccion(/^Pagado/)).toHaveAccessibleName('Pagado, cargando');
  });

  it('columna con error → ErrorState y Reintentar vuelve a consultar esa columna', async () => {
    // Arrange
    const refetch = vi.fn();
    montar({
      columnas: [
        columna('PAGADO', {
          data: undefined,
          isError: true,
          error: new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-7'),
          refetch,
        }),
      ],
    });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(screen.getByText('Referencia: req-7')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('pedido sin destinos permitidos → sin asa ni selector', () => {
    // Act
    montar();

    // Assert
    const entregados = seccion(/^Entregado/);
    expect(within(entregados).queryByRole('button', { name: /Mover pedido/ })).toBeNull();
    expect(within(entregados).queryByRole('combobox')).toBeNull();
  });

  it('selector "Mover a" → onMover con el pedido y el destino elegido', async () => {
    // Arrange
    const { onMover } = montar();

    // Act
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Mover SC-2026-001503 a' }),
      'CANCELADO',
    );

    // Assert
    expect(onMover).toHaveBeenCalledWith(pagado, DESTINOS.PAGADO![1]);
  });

  it('bloqueado (guardando) → asa y selector deshabilitados', () => {
    // Act
    montar({ bloqueado: true });

    // Assert
    expect(screen.getByRole('button', { name: 'Mover pedido SC-2026-001503' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Mover SC-2026-001503 a' })).toBeDisabled();
  });

  describe('arrastre con teclado', () => {
    // jsdom no calcula layout: cada columna ocupa 300 px en una fila y sus tarjetas van dentro de
    // ella, para que el sensor de teclado y la detección de colisiones encuentren las columnas.
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const col = this.closest<HTMLElement>('[data-columna]');
        const indice = Number(col?.dataset.columna ?? 0);
        const esColumna = col === this;
        const left = indice * 300 + (esColumna ? 0 : 12);
        const top = esColumna ? 0 : 60;
        const width = esColumna ? 280 : 256;
        const height = esColumna ? 1000 : 100;
        return {
          x: left,
          y: top,
          left,
          top,
          right: left + width,
          bottom: top + height,
          width,
          height,
          toJSON: () => ({}),
        };
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function arrastrar(nombreAsa: string, teclas: string[]) {
      screen.getByRole('button', { name: nombreAsa }).focus();
      await userEvent.keyboard(' ');
      for (const t of teclas) await userEvent.keyboard(t);
      await userEvent.keyboard(' ');
    }
    const anuncio = () => document.querySelector('[id^="DndLiveRegion"]')?.textContent ?? '';

    it('espacio, flecha derecha, espacio → onMover hacia la columna vecina permitida', async () => {
      // Arrange
      const { onMover } = montar();

      // Act
      await arrastrar('Mover pedido SC-2026-001503', ['{ArrowRight}']);

      // Assert
      await waitFor(() => expect(onMover).toHaveBeenCalledTimes(1));
      expect(onMover).toHaveBeenCalledWith(pagado, DESTINOS.PAGADO![0]);
      expect(anuncio()).toMatch(/soltado en En preparación/);
    });

    it('soltar en una columna no permitida → no llama a onMover y lo anuncia', async () => {
      // Arrange
      const { onMover } = montar();

      // Act
      await arrastrar('Mover pedido SC-2026-001503', ['{ArrowRight}', '{ArrowRight}']);

      // Assert
      await waitFor(() => expect(anuncio()).toMatch(/soltado sin cambios/));
      expect(onMover).not.toHaveBeenCalled();
    });

    it('volver a su columna → no llama a onMover', async () => {
      // Arrange
      const { onMover } = montar();

      // Act
      await arrastrar('Mover pedido SC-2026-001503', ['{ArrowRight}', '{ArrowLeft}']);

      // Assert
      await waitFor(() => expect(anuncio()).toMatch(/soltado sin cambios/));
      expect(onMover).not.toHaveBeenCalled();
    });

    it('mientras se arrastra → resalta los destinos permitidos y atenúa los demás', async () => {
      // Arrange
      montar();
      screen.getByRole('button', { name: 'Mover pedido SC-2026-001503' }).focus();

      // Act
      await userEvent.keyboard(' ');

      // Assert
      await waitFor(() => expect(anuncio()).toMatch(/Puede pasar a: En preparación, Cancelado/));
      expect(seccion(/^En preparación/).className).toMatch(/border-primario/);
      expect(seccion(/^Despachado/).className).toMatch(/opacity-50/);
      expect(seccion(/^Pagado/).className).not.toMatch(/opacity-50|border-primario/);
    });

    it('sobre una columna no permitida → lo anuncia', async () => {
      // Arrange
      montar();
      screen.getByRole('button', { name: 'Mover pedido SC-2026-001504' }).focus();
      await userEvent.keyboard(' ');

      // Act
      await userEvent.keyboard('{ArrowLeft}');

      // Assert
      await waitFor(() => expect(anuncio()).toMatch(/sobre Pagado: no puede pasar a ese estado/));
    });

    it('Escape → cancela sin llamar a onMover', async () => {
      // Arrange
      const { onMover } = montar();
      screen.getByRole('button', { name: 'Mover pedido SC-2026-001503' }).focus();
      await userEvent.keyboard(' ');
      await userEvent.keyboard('{ArrowRight}');

      // Act
      await userEvent.keyboard('{Escape}');

      // Assert
      await waitFor(() => expect(anuncio()).toMatch(/Movimiento cancelado/));
      expect(onMover).not.toHaveBeenCalled();
    });
  });
});
