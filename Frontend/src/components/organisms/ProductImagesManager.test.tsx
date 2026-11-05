import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { ImagenProducto } from '../../types/catalogo';
import { ProductImagesManager } from './ProductImagesManager';

const imagenes: ImagenProducto[] = [
  { idProductoImagen: 4, url: 'https://img.test/a.jpg', orden: 0, esPrincipal: true },
  { idProductoImagen: 5, url: 'https://img.test/b.jpg', orden: 1, esPrincipal: false },
];

function montar(props: Partial<Parameters<typeof ProductImagesManager>[0]> = {}) {
  const acciones = {
    onAgregar: vi.fn().mockResolvedValue(undefined),
    onQuitar: vi.fn().mockResolvedValue(undefined),
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

  it('orden fuera de rango → error', async () => {
    // Arrange
    const { onAgregar } = montar();
    await userEvent.type(screen.getByLabelText('URL de la imagen'), 'https://img.test/c.jpg');
    await userEvent.type(screen.getByLabelText('Orden'), '300');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

    // Assert
    expect(await screen.findByText('Debe ser un entero entre 0 y 255.')).toBeInTheDocument();
    expect(onAgregar).not.toHaveBeenCalled();
  });

  it('agregar sin orden → orden 0, no principal', async () => {
    // Arrange
    const { onAgregar } = montar();
    await userEvent.type(screen.getByLabelText('URL de la imagen'), 'https://img.test/c.jpg');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar imagen' }));

    // Assert
    await waitFor(() =>
      expect(onAgregar).toHaveBeenCalledWith({
        url: 'https://img.test/c.jpg',
        orden: 0,
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
    await userEvent.click(screen.getByRole('button', { name: /Quitar imagen 1/ }));

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
    await userEvent.click(screen.getByRole('button', { name: /Quitar imagen 0/ }));

    // Assert
    expect(screen.getByText(/la siguiente por orden pasará a serlo/)).toBeInTheDocument();
  });

  it('cancelar la confirmación → no llama a onQuitar', async () => {
    // Arrange
    const { onQuitar } = montar();
    await userEvent.click(screen.getByRole('button', { name: /Quitar imagen 1/ }));

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
    await userEvent.click(screen.getByRole('button', { name: /Quitar imagen 1/ }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar imagen' }),
    );

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('La imagen no existe.');
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
          orden: 0,
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
          orden: 0,
          esPrincipal: false,
        }),
      );
      expect(onSubirArchivo).not.toHaveBeenCalled();
    });
  });
});
