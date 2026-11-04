import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useServerTable } from '../../hooks/useServerTable';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { Page } from '../../types/api';
import { DataTable, type Columna } from './DataTable';

interface Fila {
  id: number;
  nombre: string;
}

const columnas: Columna<Fila>[] = [
  { clave: 'nombre', titulo: 'Nombre', orden: 'nombre', celda: (f) => f.nombre },
  { clave: 'id', titulo: 'Código', celda: (f) => f.id },
];

function Tabla({ pagina, error }: { pagina?: Page<Fila>; error?: unknown }) {
  const tabla = useServerTable({ filtros: [] as const, sortPorDefecto: 'nombre:asc' });
  return (
    <DataTable
      titulo="Lista de prueba"
      columnas={columnas}
      consulta={{
        data: pagina,
        isPending: pagina === undefined && error === undefined,
        isError: error !== undefined,
        error,
        isPlaceholderData: false,
        refetch: vi.fn(),
      }}
      tabla={tabla}
      idFila={(f) => f.id}
      vacio={{ titulo: 'Sin filas' }}
    />
  );
}

describe('DataTable', () => {
  it('al pulsar un encabezado ordenable escribe sort en la URL y alterna la dirección', async () => {
    // Arrange
    const { router } = renderizar(
      <Tabla pagina={{ items: [{ id: 1, nombre: 'Ana' }], page: 1, pageSize: 20, total: 1 }} />,
      { ruta: '/consola/x?page=3' },
    );
    const encabezado = screen.getByRole('columnheader', { name: /Nombre/ });
    expect(encabezado).toHaveAttribute('aria-sort', 'ascending');

    // Act
    await userEvent.click(within(encabezado).getByRole('button'));

    // Assert
    expect(router.state.location.search).toBe('?sort=nombre%3Adesc');
    expect(screen.getByRole('row', { name: /Ana/ })).toBeInTheDocument();
  });

  it('muestra carga, vacío y error con referencia', () => {
    // Arrange / Act
    const { unmount } = renderizar(<Tabla />);
    // Assert
    expect(screen.getByRole('status', { name: 'Cargando lista de prueba' })).toBeInTheDocument();
    unmount();

    // Arrange / Act
    const vacio = renderizar(<Tabla pagina={{ items: [], page: 1, pageSize: 20, total: 0 }} />);
    // Assert
    expect(screen.getByText('Sin filas')).toBeInTheDocument();
    vacio.unmount();

    // Arrange / Act
    renderizar(<Tabla error={new ApiError(500, 'ERROR_INTERNO', 'Falló.', [], 'req-9')} />);
    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Referencia: req-9');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('muestra el total, la página y "siguiente" escribe page en la URL', async () => {
    // Arrange
    const { router } = renderizar(
      <Tabla pagina={{ items: [{ id: 1, nombre: 'Ana' }], page: 1, pageSize: 10, total: 25 }} />,
      { ruta: '/t' },
    );
    expect(screen.getByText('Mostrando 1–10 de 25')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    // Assert
    expect(router.state.location.search).toBe('?page=2');
  });

  it('cambiar el tamaño → size en la URL y vuelve a la página 1', async () => {
    // Arrange
    const { router } = renderizar(
      <Tabla pagina={{ items: [{ id: 1, nombre: 'Ana' }], page: 3, pageSize: 10, total: 80 }} />,
      { ruta: '/t?page=3' },
    );

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Por página'), '20');

    // Assert
    expect(router.state.location.search).toBe('?size=20');
  });

  it('columna con tituloOculto → el título solo lo leen los lectores de pantalla', () => {
    // Arrange
    const cols: Columna<Fila>[] = [
      {
        clave: 'acc',
        titulo: 'Acciones',
        tituloOculto: true,
        celda: () => <button>Editar</button>,
      },
    ];
    function Con() {
      const tabla = useServerTable({ filtros: [] as const });
      return (
        <DataTable
          titulo="Lista"
          columnas={cols}
          consulta={{
            data: { items: [{ id: 1, nombre: 'Ana' }], page: 1, pageSize: 10, total: 1 },
            isPending: false,
            isError: false,
            error: undefined,
            isPlaceholderData: false,
            refetch: vi.fn(),
          }}
          tabla={tabla}
          idFila={(f) => f.id}
          vacio={{ titulo: 'Sin filas' }}
        />
      );
    }

    // Act
    renderizar(<Con />, { ruta: '/t' });

    // Assert
    expect(screen.getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument();
    expect(screen.getByText('Acciones')).toHaveClass('sr-only');
  });

  it('datos de la página anterior mientras carga la nueva → aria-busy', () => {
    // Arrange
    function Con() {
      const tabla = useServerTable({ filtros: [] as const });
      return (
        <DataTable
          titulo="Lista"
          columnas={columnas}
          consulta={{
            data: { items: [{ id: 1, nombre: 'Ana' }], page: 1, pageSize: 10, total: 1 },
            isPending: false,
            isError: false,
            error: undefined,
            isPlaceholderData: true,
            refetch: vi.fn(),
          }}
          tabla={tabla}
          idFila={(f) => f.id}
          vacio={{ titulo: 'Sin filas' }}
        />
      );
    }

    // Act
    const { container } = renderizar(<Con />, { ruta: '/t' });

    // Assert
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('error → "Reintentar" llama a refetch', async () => {
    // Arrange
    const refetch = vi.fn();
    function Con() {
      const tabla = useServerTable({ filtros: [] as const });
      return (
        <DataTable
          titulo="Lista"
          columnas={columnas}
          consulta={{
            data: undefined,
            isPending: false,
            isError: true,
            error: new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-1'),
            isPlaceholderData: false,
            refetch,
          }}
          tabla={tabla}
          idFila={(f) => f.id}
          vacio={{ titulo: 'Sin filas' }}
        />
      );
    }
    renderizar(<Con />, { ruta: '/t' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('etiquetaCarga propia → es el nombre accesible del estado de carga', () => {
    // Arrange
    function Con() {
      const tabla = useServerTable({ filtros: [] as const });
      return (
        <DataTable
          titulo="Lista"
          etiquetaCarga="Cargando usos del cupón"
          columnas={columnas}
          consulta={{
            data: undefined,
            isPending: true,
            isError: false,
            error: undefined,
            isPlaceholderData: false,
            refetch: vi.fn(),
          }}
          tabla={tabla}
          idFila={(f) => f.id}
          vacio={{ titulo: 'Sin filas' }}
        />
      );
    }

    // Act
    renderizar(<Con />, { ruta: '/t' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando usos del cupón' })).toBeInTheDocument();
  });
});
