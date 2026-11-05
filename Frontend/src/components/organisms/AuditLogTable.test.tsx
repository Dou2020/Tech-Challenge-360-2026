import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useServerTable } from '../../hooks/useServerTable';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { EntradaBitacora } from '../../types/administracion';
import { AuditLogTable } from './AuditLogTable';

const entrada: EntradaBitacora = {
  idBitacora: 90,
  idUsuario: 1,
  usuario: 'Ada Admin',
  correoUsuario: 'admin@shopcart.gt',
  modulo: 'Inventario',
  entidad: 'Variante',
  idRegistro: 41,
  accion: 'MODIFICAR',
  valorAnterior: { Precio: 149.5, Nota: 'vieja' },
  valorNuevo: { Precio: 159.5, Extra: { a: 1 } },
  fecha: '2026-11-03T15:30:00.000Z',
};

function Tabla({ items, error }: { items?: EntradaBitacora[]; error?: unknown }) {
  const tabla = useServerTable({ filtros: [] as const, sortPorDefecto: 'fecha:desc' });
  return (
    <AuditLogTable
      consulta={{
        data: items ? { items, page: 1, pageSize: 20, total: items.length } : undefined,
        isPending: !items && error === undefined,
        isError: error !== undefined,
        error,
        isPlaceholderData: false,
        refetch: vi.fn(),
      }}
      tabla={tabla}
      vacio={{ titulo: 'La bitácora está vacía' }}
    />
  );
}

describe('AuditLogTable', () => {
  it('muestra fecha de Guatemala, usuario, módulo, entidad con id y acción', () => {
    // Act
    renderizar(<Tabla items={[entrada]} />);

    // Assert
    expect(screen.getByText('3/11/2026, 9:30 a. m.')).toBeInTheDocument();
    expect(screen.getByText('Ada Admin')).toBeInTheDocument();
    expect(screen.getByText('admin@shopcart.gt')).toBeInTheDocument();
    expect(screen.getByText('Inventario')).toBeInTheDocument();
    expect(screen.getByText('Variante #41')).toBeInTheDocument();
    expect(screen.getByText('MODIFICAR')).toBeInTheDocument();
  });

  it('desplegar los cambios → campo por campo con "—" cuando falta el valor de un lado', async () => {
    // Arrange
    renderizar(<Tabla items={[entrada]} />);

    // Act
    await userEvent.click(screen.getByText('Ver cambios'));

    // Assert
    expect(screen.getByText('149.5')).toBeInTheDocument();
    expect(screen.getByText('159.5')).toBeInTheDocument();
    expect(screen.getByText('vieja')).toBeInTheDocument();
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('ambos valores nulos → "Sin detalle" y sin desplegable', () => {
    // Act
    renderizar(<Tabla items={[{ ...entrada, valorAnterior: null, valorNuevo: null }]} />);

    // Assert
    expect(screen.getByText('Sin detalle')).toBeInTheDocument();
    expect(screen.queryByText('Ver cambios')).not.toBeInTheDocument();
  });

  it('solo valor nuevo (alta) → el anterior queda en "—"', async () => {
    // Arrange
    renderizar(
      <Tabla
        items={[{ ...entrada, accion: 'CREAR', valorAnterior: null, valorNuevo: { Nombre: 'X' } }]}
      />,
    );

    // Act
    await userEvent.click(screen.getByText('Ver cambios'));

    // Assert
    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('el encabezado de fecha ordena con sort en la URL', async () => {
    // Arrange
    const { router } = renderizar(<Tabla items={[entrada]} />, { ruta: '/b' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Fecha/ }));

    // Assert
    expect(router.state.location.search).toBe('?sort=fecha%3Aasc');
  });

  it('sin registros → muestra el vacío', () => {
    // Act
    renderizar(<Tabla items={[]} />);

    // Assert
    expect(screen.getByText('La bitácora está vacía')).toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Act
    renderizar(<Tabla />);

    // Assert
    expect(
      screen.getByRole('status', { name: 'Cargando registros de la bitácora' }),
    ).toBeInTheDocument();
  });

  it('error → muestra el requestId', () => {
    // Act
    renderizar(<Tabla error={new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-9')} />);

    // Assert
    expect(screen.getByText('Referencia: req-9')).toBeInTheDocument();
  });
});
