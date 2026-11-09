USE [$(DbName)];
GO

/*
    102_sp_imagenes_orden.sql
    Orden de las imágenes de un producto. Script incremental e idempotente (CREATE OR ALTER): se aplica sobre
    una base creada con 001-101 y no cambia el esquema. La primera imagen de la lista es la principal.
      - SP_Productos_OrdenarImagenes (nuevo).
      - SP_Productos_AgregarImagen: versión nueva, @Orden por omisión NULL = al final.
*/

-- PUT /api/productos/:id/imagenes/orden: fija el orden de todas las imágenes del producto.
-- @Imagenes: arreglo JSON de IDProductoImagen en el orden nuevo, p. ej. N'[5,3,9]'. Debe contener exactamente
-- las imágenes del producto (ni más, ni menos, sin repetir; máximo 256). Orden = posición (0..n-1) y la de la
-- posición 0 queda como EsPrincipal = 1 (la anterior pierde la marca primero: UX_ProductoImagen_Principal).
-- THROW: 50001 (JSON inválido, no es arreglo, vacío, elementos no enteros positivos, duplicados, más de 256, o
-- la lista no coincide con las imágenes del producto), 50004 (producto inexistente), más los del solicitante.
-- Bitácora: un MODIFICAR de ProductoImagen por cada imagen cuyo Orden o EsPrincipal cambió. Si nada cambia, no
-- escribe bitácora ni FechaModificacion.
-- Resultado (tras el commit): los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_OrdenarImagenes
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @Imagenes             NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Lista TABLE (Posicion INT NOT NULL PRIMARY KEY, IDProductoImagen INT NOT NULL);
    DECLARE @Cambios TABLE (
        IDProductoImagen INT NOT NULL PRIMARY KEY,
        Anterior         NVARCHAR(MAX) NOT NULL,
        Nuevo            NVARCHAR(MAX) NULL
    );
    DECLARE @MsgLista NVARCHAR(200) = N'La lista debe incluir exactamente todas las imágenes del producto.';
    DECLARE @Total INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 1. Validar el arreglo JSON.
        IF @Imagenes IS NULL OR ISJSON(@Imagenes) <> 1 OR LEFT(LTRIM(@Imagenes), 1) <> N'['
            THROW 50001, N'Las imágenes deben enviarse como un arreglo JSON de identificadores.', 1;

        IF EXISTS (SELECT 1 FROM OPENJSON(@Imagenes)
                   WHERE [type] <> 2 OR TRY_CONVERT(INT, [value]) IS NULL OR TRY_CONVERT(INT, [value]) <= 0
                         OR [value] LIKE N'%[^0-9]%')
            THROW 50001, N'Cada elemento de la lista debe ser un identificador de imagen entero positivo.', 1;

        INSERT INTO @Lista (Posicion, IDProductoImagen)
        SELECT CONVERT(INT, [key]), CONVERT(INT, [value]) FROM OPENJSON(@Imagenes);

        SELECT @Total = COUNT(*) FROM @Lista;

        IF @Total = 0
            THROW 50001, N'La lista de imágenes no puede estar vacía.', 1;
        IF @Total > 256
            THROW 50001, N'La lista admite como máximo 256 imágenes.', 1;
        IF (SELECT COUNT(DISTINCT IDProductoImagen) FROM @Lista) <> @Total
            THROW 50001, N'La lista contiene imágenes repetidas.', 1;

        -- 2. Bloquear el producto (mismo orden que Agregar/Eliminar) y luego sus imágenes.
        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

        DECLARE @Bloqueadas TABLE (IDProductoImagen INT NOT NULL PRIMARY KEY);
        INSERT INTO @Bloqueadas (IDProductoImagen)
        SELECT IDProductoImagen FROM dbo.ProductoImagen WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto;

        -- 3. El conjunto debe ser exactamente el del producto.
        IF (SELECT COUNT(*) FROM @Bloqueadas) <> @Total
           OR EXISTS (SELECT 1 FROM @Lista AS l WHERE NOT EXISTS
                      (SELECT 1 FROM @Bloqueadas AS b WHERE b.IDProductoImagen = l.IDProductoImagen))
            THROW 50001, @MsgLista, 1;

        -- 4. Imágenes que cambian y su valor anterior.
        INSERT INTO @Cambios (IDProductoImagen, Anterior)
        SELECT i.IDProductoImagen,
               (SELECT i.IDProductoImagen, i.IDProducto, i.Url, i.Orden, i.EsPrincipal
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
        FROM dbo.ProductoImagen AS i
        INNER JOIN @Lista AS l ON l.IDProductoImagen = i.IDProductoImagen
        WHERE i.Orden <> l.Posicion
           OR i.EsPrincipal <> CASE WHEN l.Posicion = 0 THEN 1 ELSE 0 END;

        IF EXISTS (SELECT 1 FROM @Cambios)
        BEGIN
            -- 5. Escribir: Orden, luego quitar la marca a la principal actual y ponerla a la primera.
            UPDATE i SET Orden = CONVERT(TINYINT, l.Posicion)
            FROM dbo.ProductoImagen AS i
            INNER JOIN @Lista AS l ON l.IDProductoImagen = i.IDProductoImagen
            WHERE i.Orden <> l.Posicion;

            UPDATE i SET EsPrincipal = 0
            FROM dbo.ProductoImagen AS i
            INNER JOIN @Lista AS l ON l.IDProductoImagen = i.IDProductoImagen
            WHERE i.EsPrincipal = 1 AND l.Posicion <> 0;

            UPDATE i SET EsPrincipal = 1
            FROM dbo.ProductoImagen AS i
            INNER JOIN @Lista AS l ON l.IDProductoImagen = i.IDProductoImagen
            WHERE i.EsPrincipal = 0 AND l.Posicion = 0;

            UPDATE c
            SET Nuevo = (SELECT i.IDProductoImagen, i.IDProducto, i.Url, i.Orden, i.EsPrincipal
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
            FROM @Cambios AS c
            INNER JOIN dbo.ProductoImagen AS i ON i.IDProductoImagen = c.IDProductoImagen;

            UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            SELECT @IDUsuarioSolicitante, N'Catalogo', N'ProductoImagen', IDProductoImagen, N'MODIFICAR', Anterior, Nuevo
            FROM @Cambios
            ORDER BY IDProductoImagen;
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Productos_ObtenerPorId @IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/productos/:id/imagenes: agrega una imagen por URL (http:// o https://) o por la URL relativa
-- que genera el backend: /api/imagenes/productos/<uuid>.(jpg|png|webp), uuid en hex con guiones (8-4-4-4-12).
-- @EsPrincipal = 1 quita la marca a la principal anterior (UX_ProductoImagen_Principal permite una).
-- Si el producto no tenía imagen principal, la nueva lo es aunque @EsPrincipal = 0.
-- @Orden NULL (por omisión): la imagen va al final (MAX(Orden) + 1 de las del producto, tope 255). Un @Orden
-- explícito se valida (0-255) y se respeta. Para reordenar usa SP_Productos_OrdenarImagenes.
-- Bitácora: CREAR de ProductoImagen. Resultado: los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_AgregarImagen
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @Url                  NVARCHAR(500),
    @Orden                INT = NULL,
    @EsPrincipal          BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProductoImagen INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Url = TRIM(@Url);
    SET @EsPrincipal = ISNULL(@EsPrincipal, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Url IS NULL OR NOT (
               @Url LIKE N'http://_%' OR @Url LIKE N'https://_%'
               OR @Url COLLATE Latin1_General_100_CI_AI LIKE
                  N'/api/imagenes/productos/[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].jpg'
               OR @Url COLLATE Latin1_General_100_CI_AI LIKE
                  N'/api/imagenes/productos/[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].png'
               OR @Url COLLATE Latin1_General_100_CI_AI LIKE
                  N'/api/imagenes/productos/[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].webp'
           )
            THROW 50001, N'La URL de la imagen debe empezar con http:// o https://, o ser una imagen subida (/api/imagenes/productos/<uuid>.jpg|png|webp).', 1;

        IF @Orden IS NOT NULL AND @Orden NOT BETWEEN 0 AND 255
            THROW 50001, N'El orden de la imagen debe estar entre 0 y 255.', 1;

        -- El bloqueo del producto serializa los cambios de imagen principal.
        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

        IF @Orden IS NULL
            SELECT @Orden = CASE WHEN MAX(CONVERT(INT, Orden)) >= 255 THEN 255
                                 ELSE ISNULL(MAX(CONVERT(INT, Orden)) + 1, 0) END
            FROM dbo.ProductoImagen WHERE IDProducto = @IDProducto;

        IF NOT EXISTS (SELECT 1 FROM dbo.ProductoImagen WHERE IDProducto = @IDProducto AND EsPrincipal = 1)
            SET @EsPrincipal = 1;
        ELSE IF @EsPrincipal = 1
            UPDATE dbo.ProductoImagen
            SET EsPrincipal = 0
            WHERE IDProducto = @IDProducto AND EsPrincipal = 1;

        INSERT INTO dbo.ProductoImagen (IDProducto, Url, Orden, EsPrincipal)
        VALUES (@IDProducto, @Url, CONVERT(TINYINT, @Orden), @EsPrincipal);

        SET @IDProductoImagen = SCOPE_IDENTITY();

        UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

        SET @Nuevo = (SELECT IDProductoImagen, IDProducto, Url, Orden, EsPrincipal
                      FROM dbo.ProductoImagen WHERE IDProductoImagen = @IDProductoImagen
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'ProductoImagen', @IDProductoImagen, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Productos_ObtenerPorId @IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
