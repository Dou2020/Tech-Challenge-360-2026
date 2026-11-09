import { act, screen, waitFor, within } from '@testing-library/react';
import type * as DndCore from '@dnd-kit/core';
import type { DndContextProps } from '@dnd-kit/core';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { ImagenProducto } from '../../types/catalogo';
import { ProductImagesManager } from './ProductImagesManager';

// DndContext real, pero se captura su `onDragEnd` para ejercitar los casos que el teclado no puede
// producir en jsdom (`over` nulo, id desconocido).
const capturado = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const real = await importOriginal<typeof DndCore>();
  return {
    ...real,
    DndContext: (props: DndContextProps) => {
      capturado.props = props;
      return <real.DndContext {...props} />;
    },
  };
});
const soltar = (active: number, over: number | null) =>
  act(() => {
    (capturado.props as DndContextProps).onDragEnd?.({
      active: { id: active },
      over: over === null ? null : { id: over },
    } as Parameters<NonNullable<DndContextProps['onDragEnd']>>[0]);
  });

const imagenes: ImagenProducto[] = [
  { idProductoImagen: 4, url: 'https://img.test/a.jpg', orden: 0, esPrincipal: true },
  { idProductoImagen: 5, url: 'https://img.test/b.jpg', orden: 1, esPrincipal: false },
];

function montar(props: Partial<Parameters<typeof ProductImagesManager>[0]> = {}) {
  const acciones = {
    onAgregar: vi.fn().mockResolvedValue(undefined),
    onQuitar: vi.fn().mockResolvedValue(undefined),
    onReordenar: vi.fn().mockResolvedValue(undefined),
  };
  renderizar(<ProductImagesManager imagenes={imagenes} {...acciones} {...props} />);
  return acciones;
}

describe('ProductImagesManager', () => {
  it('sin imágenes → lo indica', () => {
    // Act
    montar({ imagenes: [] });

    // Assert
    expect(screen.getByText('Este producto aún no tiene imágenes.')).toBeInTheDocument();
  });

  it('con imágenes → las lista y marca la principal', () => {
    // Act
    montar();

    // Assert
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByText('Principal')).toBeInTheDocument();
  });

  it.each(['no es url', 'ftp://x.com/a.jpg', ''])(
    'URL inválida (%s) → error y sin llamar a onAgregar',
    async (url) => {
      // Arrange
      const { onAgregar } = montar();
      if (url) await userEvent.type(screen.getByLabelText('URL de la imagen'), url);

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

      // Assert
      expect(await screen.findByText('Debe ser una URL http:// o https://.')).toBeInTheDocument();
      expect(screen.getByLabelText('URL de la imagen')).toHaveAttribute('aria-invalid', 'true');
      expect(onAgregar).not.toHaveBeenCalled();
    },
  );

  it('agregar → no envía orden (queda al final) y no es principal', async () => {
    // Arrange
    const { onAgregar } = montar();
    await userEvent.type(screen.getByLabelText('URL de la imagen'), 'https://img.test/c.jpg');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

    // Assert
    await waitFor(() =>
      expect(onAgregar).toHaveBeenCalledWith({
        url: 'https://img.test/c.jpg',
        esPrincipal: false,
      }),
    );
  });

  it('details del backend → el mensaje queda en el campo url', async () => {
    // Arrange
    montar({
      onAgregar: vi
        .fn()
        .mockRejectedValue(
          new ApiError(400, 'VALIDACION', 'Inválido', [
            { field: 'url', message: 'La URL no responde.' },
          ]),
        ),
    });
    await userEvent.type(screen.getByLabelText('URL de la imagen'), 'https://img.test/c.jpg');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

    // Assert
    expect(await screen.findByText('La URL no responde.')).toBeInTheDocument();
  });

  it.each([
    [new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'), 'Falla del servidor.'],
    [new Error('red'), 'No se pudo agregar la imagen.'],
  ])('error al agregar (%#) → alerta', async (error, mensaje) => {
    // Arrange
    montar({ onAgregar: vi.fn().mockRejectedValue(error) });
    await userEvent.type(screen.getByLabelText('URL de la imagen'), 'https://img.test/c.jpg');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje);
  });

  it('quitar → pide confirmación y llama a onQuitar con el id de la imagen', async () => {
    // Arrange
    const { onQuitar } = montar();
    await userEvent.click(screen.getByRole('button', { name: /Quitar imagen 2/ }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar imagen' }),
    );

    // Assert
    await waitFor(() => expect(onQuitar).toHaveBeenCalledWith(5));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('quitar la principal → la confirmación avisa que otra pasará a serlo', async () => {
    // Arrange
    montar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Quitar imagen 1/ }));

    // Assert
    expect(screen.getByText(/la siguiente pasará a ser la principal/)).toBeInTheDocument();
  });

  it('cancelar la confirmación → no llama a onQuitar', async () => {
    // Arrange
    const { onQuitar } = montar();
    await userEvent.click(screen.getByRole('button', { name: /Quitar imagen 2/ }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onQuitar).not.toHaveBeenCalled();
  });

  it('onQuitar falla → alerta con el mensaje', async () => {
    // Arrange
    montar({
      onQuitar: vi
        .fn()
        .mockRejectedValue(new ApiError(404, 'NO_ENCONTRADO', 'La imagen no existe.')),
    });
    await userEvent.click(screen.getByRole('button', { name: /Quitar imagen 2/ }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar imagen' }),
    );

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('La imagen no existe.');
  });

  it('"Hacer principal" → llama a onReordenar con la imagen al inicio', async () => {
    // Arrange
    const { onReordenar } = montar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 2' }));

    // Assert
    await waitFor(() => expect(onReordenar).toHaveBeenCalledWith([5, 4]));
    expect(screen.queryByRole('button', { name: 'Hacer principal la imagen 1' })).toBeNull();
  });

  it('onReordenar falla → vuelve al orden anterior y muestra la alerta', async () => {
    // Arrange
    montar({
      onReordenar: vi
        .fn()
        .mockRejectedValue(new ApiError(400, 'VALIDACION', 'El conjunto de imágenes cambió.')),
    });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 2' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('El conjunto de imágenes cambió.');
    expect(screen.getByRole('button', { name: 'Hacer principal la imagen 2' })).toBeEnabled();
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'https://img.test/a.jpg');
  });

  it('error sin mensaje de API al reordenar → texto por defecto', async () => {
    // Arrange
    montar({ onReordenar: vi.fn().mockRejectedValue(new Error('red')) });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 2' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el orden.');
  });

  describe('reordenar por arrastre', () => {
    const tres: ImagenProducto[] = [
      { idProductoImagen: 4, url: 'https://img.test/a.jpg', orden: 0, esPrincipal: true },
      { idProductoImagen: 5, url: 'https://img.test/b.jpg', orden: 1, esPrincipal: false },
      { idProductoImagen: 6, url: 'https://img.test/c.jpg', orden: 2, esPrincipal: false },
    ];
    const urls = () => screen.getAllByRole('img').map((i) => i.getAttribute('src'));

    // jsdom no calcula layout: cada <li> ocupa una celda de 100 px en una fila horizontal,
    // según su posición real en la lista, para que el sensor de teclado de dnd-kit encuentre destinos.
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const li = this.tagName === 'LI' ? this : null;
        const indice = li ? Array.from(li.parentElement?.children ?? []).indexOf(li) : 0;
        const left = indice * 100;
        return {
          x: left,
          y: 0,
          left,
          top: 0,
          right: left + 100,
          bottom: 100,
          width: 100,
          height: 100,
          toJSON: () => ({}),
        };
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function arrastrar(asa: HTMLElement, teclas: string[]) {
      asa.focus();
      await userEvent.keyboard(' ');
      for (const t of teclas) await userEvent.keyboard(t);
      await userEvent.keyboard(' ');
    }

    it('teclado: espacio, flecha derecha, espacio → onReordenar con la imagen movida una posición', async () => {
      // Arrange
      const { onReordenar } = montar({ imagenes: tres });
      const asa = screen.getByRole('button', { name: 'Mover imagen 1' });

      // Act
      await arrastrar(asa, ['{ArrowRight}']);

      // Assert
      await waitFor(() => expect(onReordenar).toHaveBeenCalledTimes(1));
      expect(onReordenar).toHaveBeenCalledWith([5, 4, 6]);
      expect(urls()[1]).toBe('https://img.test/a.jpg');
    });

    it('teclado: soltar en la última posición → la imagen pasa al final', async () => {
      // Arrange
      const { onReordenar } = montar({ imagenes: tres });
      const asa = screen.getByRole('button', { name: 'Mover imagen 1' });

      // Act
      await arrastrar(asa, ['{ArrowRight}', '{ArrowRight}']);

      // Assert
      await waitFor(() => expect(onReordenar).toHaveBeenCalledWith([5, 6, 4]));
    });

    it('teclado: soltar sin mover (misma posición) → no llama a onReordenar', async () => {
      // Arrange
      const { onReordenar } = montar({ imagenes: tres });
      const asa = screen.getByRole('button', { name: 'Mover imagen 2' });

      // Act
      await arrastrar(asa, []);

      // Assert
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/soltada/));
      expect(onReordenar).not.toHaveBeenCalled();
      expect(urls()[1]).toBe('https://img.test/b.jpg');
    });

    it('teclado: Escape cancela → no llama a onReordenar y anuncia la cancelación', async () => {
      // Arrange
      const { onReordenar } = montar({ imagenes: tres });
      screen.getByRole('button', { name: 'Mover imagen 1' }).focus();
      await userEvent.keyboard(' ');
      await userEvent.keyboard('{ArrowRight}');

      // Act
      await userEvent.keyboard('{Escape}');

      // Assert
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          'Movimiento cancelado. La imagen 1 no cambió.',
        ),
      );
      expect(onReordenar).not.toHaveBeenCalled();
    });

    it('anuncios en español: levantar y soltar describen las posiciones', async () => {
      // Arrange
      montar({ imagenes: tres });
      const asa = screen.getByRole('button', { name: 'Mover imagen 1' });

      // Act
      asa.focus();
      await userEvent.keyboard(' ');
      await userEvent.keyboard('{ArrowRight}');

      // Assert
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Imagen 1 sobre la posición 2.'),
      );
    });

    it('anuncio al soltar → indica la posición de destino', async () => {
      // Arrange
      montar({ imagenes: tres });
      const asa = screen.getByRole('button', { name: 'Mover imagen 1' });

      // Act
      await arrastrar(asa, ['{ArrowRight}']);

      // Assert
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          /Imagen \d soltada en la posición \d\./,
        ),
      );
    });

    it('instrucciones de arrastre en español para lectores de pantalla', () => {
      // Act
      montar({ imagenes: tres });

      // Assert
      expect(
        screen.getByText(/Para mover la imagen, presiona espacio o Enter/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Escape cancela\./)).toBeInTheDocument();
    });

    it.each([
      ['over nulo (se suelta fuera de la grilla)', 4, null],
      ['active igual a over', 5, 5],
      ['id desconocido', 99, 4],
    ])('onDragEnd con %s → no llama a onReordenar', async (_n, active, over) => {
      // Arrange
      const { onReordenar } = montar({ imagenes: tres });

      // Act
      await soltar(active, over);

      // Assert
      expect(onReordenar).not.toHaveBeenCalled();
      expect(urls()[0]).toBe('https://img.test/a.jpg');
    });

    it('onDragEnd de la imagen 6 sobre la 4 → onReordenar con [6, 4, 5]', async () => {
      // Arrange
      const { onReordenar } = montar({ imagenes: tres });

      // Act
      await soltar(6, 4);

      // Assert
      expect(onReordenar).toHaveBeenCalledTimes(1);
      expect(onReordenar).toHaveBeenCalledWith([6, 4, 5]);
    });

    it('con 3 imágenes, "Hacer principal" en la del medio → [5, 4, 6]', async () => {
      // Arrange
      const { onReordenar } = montar({ imagenes: tres });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 2' }));

      // Assert
      await waitFor(() => expect(onReordenar).toHaveBeenCalledTimes(1));
      expect(onReordenar).toHaveBeenCalledWith([5, 4, 6]);
      expect(urls()).toEqual([
        'https://img.test/b.jpg',
        'https://img.test/a.jpg',
        'https://img.test/c.jpg',
      ]);
    });

    it('con 3 imágenes, "Hacer principal" en la última → [6, 4, 5]', async () => {
      // Arrange
      const { onReordenar } = montar({ imagenes: tres });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 3' }));

      // Assert
      await waitFor(() => expect(onReordenar).toHaveBeenCalledWith([6, 4, 5]));
    });

    it('la primera imagen no tiene "Hacer principal" y es la única con el badge "Principal"', () => {
      // Act
      montar({ imagenes: tres });

      // Assert
      expect(screen.queryByRole('button', { name: 'Hacer principal la imagen 1' })).toBeNull();
      expect(screen.getAllByRole('button', { name: /Hacer principal/ })).toHaveLength(2);
      expect(screen.getAllByText('Principal')).toHaveLength(1);
    });

    it('una sola imagen → sin "Hacer principal", asa deshabilitada y sin texto de ayuda de arrastre', () => {
      // Act
      montar({ imagenes: [tres[0]!] });

      // Assert
      expect(screen.queryByRole('button', { name: /Hacer principal/ })).toBeNull();
      expect(screen.getByRole('button', { name: 'Mover imagen 1' })).toBeDisabled();
      expect(screen.queryByText(/Arrastra las imágenes para ordenarlas/)).toBeNull();
    });

    it('con 2+ imágenes → muestra la ayuda de arrastre y las asas están habilitadas', () => {
      // Act
      montar({ imagenes: tres });

      // Assert
      expect(screen.getByText(/Arrastra las imágenes para ordenarlas/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mover imagen 2' })).toBeEnabled();
    });

    it('mientras onReordenar está pendiente → asas y "Hacer principal" deshabilitados, "Quitar" sigue activo', async () => {
      // Arrange
      let resolver: () => void = () => {};
      const pendiente = new Promise<void>((r) => {
        resolver = r;
      });
      montar({ imagenes: tres, onReordenar: vi.fn().mockReturnValue(pendiente) });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 3' }));

      // Assert
      for (const n of [1, 2, 3]) {
        expect(screen.getByRole('button', { name: `Mover imagen ${n}` })).toBeDisabled();
      }
      expect(screen.getByRole('button', { name: 'Hacer principal la imagen 2' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Quitar imagen 1/ })).toBeEnabled();
      resolver();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Mover imagen 1' })).toBeEnabled(),
      );
    });

    it('un segundo clic mientras guarda no genera otra llamada a onReordenar', async () => {
      // Arrange
      const onReordenar = vi.fn().mockReturnValue(new Promise<void>(() => {}));
      montar({ imagenes: tres, onReordenar });
      await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 3' }));

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 2' }));

      // Assert
      expect(onReordenar).toHaveBeenCalledTimes(1);
    });

    it('falla al reordenar → revierte el orden y las asas vuelven a habilitarse', async () => {
      // Arrange
      montar({
        imagenes: tres,
        onReordenar: vi.fn().mockRejectedValue(new Error('red')),
      });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 3' }));

      // Assert
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el orden.');
      expect(urls()).toEqual([
        'https://img.test/a.jpg',
        'https://img.test/b.jpg',
        'https://img.test/c.jpg',
      ]);
      expect(screen.getByRole('button', { name: 'Mover imagen 1' })).toBeEnabled();
    });

    it('el error se limpia al reintentar con éxito', async () => {
      // Arrange
      const onReordenar = vi
        .fn()
        .mockRejectedValueOnce(new ApiError(400, 'VALIDACION', 'El conjunto de imágenes cambió.'))
        .mockResolvedValueOnce(undefined);
      montar({ imagenes: tres, onReordenar });
      await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 2' }));
      await screen.findByRole('alert');

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 2' }));

      // Assert
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      expect(onReordenar).toHaveBeenCalledTimes(2);
      expect(urls()[0]).toBe('https://img.test/b.jpg');
    });

    it('cambia la prop imagenes → la lista se resincroniza con el nuevo orden', () => {
      // Arrange
      const acciones = {
        onAgregar: vi.fn(),
        onQuitar: vi.fn(),
        onReordenar: vi.fn(),
      };
      const { rerender } = renderizar(<ProductImagesManager imagenes={tres} {...acciones} />);
      const nueva = [tres[2]!, tres[0]!];

      // Act
      rerender(<ProductImagesManager imagenes={nueva} {...acciones} />);

      // Assert
      expect(urls()).toEqual(['https://img.test/c.jpg', 'https://img.test/a.jpg']);
      expect(screen.getAllByText('Principal')).toHaveLength(1);
    });

    it('tras una reversión, una nueva prop imagenes vuelve a mandar', async () => {
      // Arrange
      const acciones = {
        onAgregar: vi.fn(),
        onQuitar: vi.fn(),
        onReordenar: vi.fn().mockRejectedValue(new Error('red')),
      };
      const { rerender } = renderizar(<ProductImagesManager imagenes={tres} {...acciones} />);
      await userEvent.click(screen.getByRole('button', { name: 'Hacer principal la imagen 3' }));
      await screen.findByRole('alert');

      // Act
      rerender(<ProductImagesManager imagenes={[tres[1]!, tres[0]!, tres[2]!]} {...acciones} />);

      // Assert
      expect(urls()[0]).toBe('https://img.test/b.jpg');
    });

    it('el texto de ayuda de "Imagen principal" está vinculado por aria-describedby', () => {
      // Act
      montar({ imagenes: tres });

      // Assert
      expect(screen.getByLabelText('Imagen principal')).toHaveAccessibleDescription(
        'Si la marcas, la imagen nueva queda en primer lugar.',
      );
    });

    it('el formulario de agregar no tiene campo Orden', () => {
      // Act
      montar({ imagenes: tres });

      // Assert
      expect(screen.queryByLabelText(/Orden/)).toBeNull();
    });
  });

  describe('subida de archivo', () => {
    const png = () => new File(['x'], 'foto.png', { type: 'image/png' });

    function montarConArchivo(onSubirArchivo = vi.fn().mockResolvedValue(undefined)) {
      const { onAgregar } = montar({ onSubirArchivo });
      return Object.assign(onSubirArchivo, { onAgregar });
    }

    it('por defecto ofrece el campo de archivo (JPEG, PNG, WebP) y llama a onSubirArchivo', async () => {
      // Arrange
      const onSubirArchivo = montarConArchivo();
      const campo = screen.getByLabelText('Archivo de imagen');
      await userEvent.upload(campo, png());

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

      // Assert
      expect(campo).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
      await waitFor(() =>
        expect(onSubirArchivo).toHaveBeenCalledWith({
          archivo: expect.any(File),
          esPrincipal: false,
        }),
      );
    });

    it('sin archivo → error en el campo y no sube', async () => {
      // Arrange
      const onSubirArchivo = montarConArchivo();

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

      // Assert
      expect(await screen.findByText('Selecciona una imagen.')).toBeInTheDocument();
      expect(onSubirArchivo).not.toHaveBeenCalled();
    });

    it.each([
      ['TIPO_ARCHIVO_NO_PERMITIDO', 415, 'El archivo no es una imagen JPEG, PNG o WebP.'],
      ['ARCHIVO_DEMASIADO_GRANDE', 413, 'La imagen supera el tamaño máximo permitido (5 MB).'],
    ])('%s → mensaje en el campo de archivo', async (code, status, mensaje) => {
      // Arrange
      montarConArchivo(vi.fn().mockRejectedValue(new ApiError(status, code, 'x')));
      await userEvent.upload(screen.getByLabelText('Archivo de imagen'), png());

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

      // Assert
      const campo = await screen.findByLabelText('Archivo de imagen');
      expect(campo).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText(mensaje)).toBeInTheDocument();
    });

    it('archivo con tipo no permitido (GIF) → error en el campo y no sube', async () => {
      // Arrange
      const onSubirArchivo = montarConArchivo();
      const gif = new File(['x'], 'animacion.gif', { type: 'image/gif' });
      await userEvent.upload(screen.getByLabelText('Archivo de imagen'), gif, {
        applyAccept: false,
      });

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

      // Assert
      expect(await screen.findByText('Solo se admiten JPEG, PNG o WebP.')).toBeInTheDocument();
      expect(screen.getByLabelText('Archivo de imagen')).toHaveAttribute('aria-invalid', 'true');
      expect(onSubirArchivo).not.toHaveBeenCalled();
    });

    it('cambiar a "Usar una URL" → agrega por URL con onAgregar', async () => {
      // Arrange
      const onSubirArchivo = montarConArchivo();
      await userEvent.click(screen.getByRole('radio', { name: 'Usar una URL' }));
      await userEvent.type(screen.getByLabelText('URL de la imagen'), 'https://img.test/c.jpg');

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

      // Assert
      await waitFor(() =>
        expect(onSubirArchivo.onAgregar).toHaveBeenCalledWith({
          url: 'https://img.test/c.jpg',
          esPrincipal: false,
        }),
      );
      expect(onSubirArchivo).not.toHaveBeenCalled();
    });
  });
});
