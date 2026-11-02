/*
    008_sp_catalogo.sql
    Stored procedures del catálogo público y de la gestión de categorías, productos,
    variantes y atributos.

    Catálogo público (SP_Catalogo_*): solo categorías, productos y variantes activos. Un producto
    es visible si está activo, su categoría está activa y tiene al menos una variante activa.
    La existencia disponible (física menos reservas vigentes, FU_Inventario_ExistenciaDisponible)
    nunca se expone para variantes inactivas.

    Gestión (SP_Categorias_*, SP_Productos_*, SP_Variantes_*, SP_Atributos_*): incluye lo inactivo.
    Los SPs que escriben reciben @IDUsuarioSolicitante (sale del JWT), validan antes de escribir,
    bloquean con UPDLOCK, ROWLOCK y registran la Bitacora (Modulo 'Catalogo') en la misma
    transacción. La existencia no se edita aquí: la inicial entra al kardex como
    INVENTARIO_INICIAL; después solo la mueven los SPs de inventario y pedidos.

    Orden de bloqueo: Categoria → Producto → Variante. La categoría se bloquea con UPDLOCK
    al crear o mover un producto y al eliminarla, así un producto no puede quedar en una
    categoría que se está eliminando.

    Listados: @Pagina (desde 1), @TamanoPagina (1 a 100) y @Orden 'campo:asc|desc', elegido con
    CASE sobre una lista blanca (nunca concatenado). Devuelven las filas y luego un result set
    con Total.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (solicitante desactivado, SP_Usuarios_ValidarSolicitante)
      50050  PRODUCTO_CON_VENTAS
      50051  EN_USO
      2627   DUPLICADO (UQ_Categoria_Nombre, UQ_Variante_SKU, UQ_Atributo_Nombre,
                        UQ_ValorAtributo_IDAtributo_Valor; sin número de THROW propio)
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Catálogo público
   ========================================================= */

-- GET /api/catalogo/categorias: categorías activas con cuántos productos visibles tienen.
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarCategorias
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        c.IDCategoria,
        c.Nombre,
        c.Descripcion,
        (
            SELECT COUNT(*)
            FROM dbo.Producto AS p
            WHERE p.IDCategoria = c.IDCategoria
              AND p.Activo = 1
              AND EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDProducto = p.IDProducto AND v.Activo = 1)
        ) AS CantidadProductos
    FROM dbo.Categoria AS c
    WHERE c.Activo = 1
    ORDER BY c.Nombre, c.IDCategoria;
END;
GO

-- GET /api/catalogo/productos: búsqueda paginada de productos visibles.
--   @Texto        busca en nombre y descripción del producto, nombre de la categoría y SKU
--                 de sus variantes activas (CI_AI: sin distinguir mayúsculas ni tildes)
--   @PrecioMin/Max  sobre PrecioMinimo, el menor precio de sus variantes activas
--   @Disponible   1: con existencia disponible en alguna variante activa; 0: agotados; NULL: todos
--   @Orden        precio | nombre | fechaCreacion, con :asc o :desc. Default fechaCreacion:desc.
--                 "precio" ordena por PrecioMinimo.
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_BuscarProductos
    @Texto        NVARCHAR(150) = NULL,
    @IDCategoria  INT           = NULL,
    @PrecioMin    DECIMAL(12,2) = NULL,
    @PrecioMax    DECIMAL(12,2) = NULL,
    @Disponible   BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'fechaCreacion:desc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'precio:asc', N'precio:desc', N'nombre:asc', N'nombre:desc',
                      N'fechaCreacion:asc', N'fechaCreacion:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden, N'. Usa precio, nombre o fechaCreacion con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    IF @PrecioMin < 0 OR @PrecioMax < 0
        THROW 50001, N'El rango de precio no puede ser negativo.', 1;

    IF @PrecioMin > @PrecioMax
        THROW 50001, N'El precio mínimo no puede ser mayor que el precio máximo.', 1;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    -- Una variable de tabla toma la collation de la base (una #temporal tomaría la de tempdb).
    DECLARE @Fila TABLE (
        IDProducto      INT            NOT NULL PRIMARY KEY,
        Nombre          NVARCHAR(150)  NOT NULL,
        Descripcion     NVARCHAR(MAX)  NULL,
        IDCategoria     INT            NOT NULL,
        Categoria       NVARCHAR(100)  NOT NULL,
        PrecioMinimo    DECIMAL(12,2)  NOT NULL,
        PrecioMaximo    DECIMAL(12,2)  NOT NULL,
        Disponible      BIT            NOT NULL,
        ImagenPrincipal NVARCHAR(500)  NULL,
        FechaCreacion   DATETIME2(3)   NOT NULL
    );

    INSERT INTO @Fila (IDProducto, Nombre, Descripcion, IDCategoria, Categoria, PrecioMinimo,
                       PrecioMaximo, Disponible, ImagenPrincipal, FechaCreacion)
    SELECT
        p.IDProducto,
        p.Nombre,
        p.Descripcion,
        c.IDCategoria,
        c.Nombre,
        v.PrecioMinimo,
        v.PrecioMaximo,
        CASE WHEN v.Disponible > 0 THEN 1 ELSE 0 END,
        img.Url,
        p.FechaCreacion
    FROM dbo.Producto AS p
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT
            COUNT(*)                          AS Variantes,
            MIN(va.Precio)                    AS PrecioMinimo,
            MAX(va.Precio)                    AS PrecioMaximo,
            ISNULL(SUM(d.ExistenciaDisponible), 0) AS Disponible
        FROM dbo.Variante AS va
        CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(va.IDVariante, NULL) AS d
        WHERE va.IDProducto = p.IDProducto
          AND va.Activo = 1
    ) AS v
    OUTER APPLY (
        SELECT TOP (1) pi.Url
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProducto = p.IDProducto
        ORDER BY pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen
    ) AS img
    WHERE p.Activo = 1
      AND c.Activo = 1
      AND v.Variantes > 0
      AND (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@PrecioMin IS NULL OR v.PrecioMinimo >= @PrecioMin)
      AND (@PrecioMax IS NULL OR v.PrecioMinimo <= @PrecioMax)
      AND (@Disponible IS NULL
           OR (@Disponible = 1 AND v.Disponible > 0)
           OR (@Disponible = 0 AND v.Disponible = 0))
      AND (@Patron IS NULL
           OR p.Nombre LIKE @Patron
           OR p.Descripcion LIKE @Patron
           OR c.Nombre LIKE @Patron
           OR EXISTS (SELECT 1 FROM dbo.Variante AS vs
                      WHERE vs.IDProducto = p.IDProducto AND vs.Activo = 1 AND vs.SKU LIKE @Patron))
    OPTION (RECOMPILE);

    SELECT
        IDProducto, Nombre, Descripcion, IDCategoria, Categoria,
        PrecioMinimo, PrecioMaximo, Disponible, ImagenPrincipal, FechaCreacion
    FROM @Fila
    ORDER BY
        CASE WHEN @Orden = N'precio:asc'         THEN PrecioMinimo  END ASC,
        CASE WHEN @Orden = N'precio:desc'        THEN PrecioMinimo  END DESC,
        CASE WHEN @Orden = N'nombre:asc'         THEN Nombre        END ASC,
        CASE WHEN @Orden = N'nombre:desc'        THEN Nombre        END DESC,
        CASE WHEN @Orden = N'fechaCreacion:asc'  THEN FechaCreacion END ASC,
        CASE WHEN @Orden = N'fechaCreacion:desc' THEN FechaCreacion END DESC,
        IDProducto ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/catalogo/productos/:id: detalle de un producto visible.
-- Producto inexistente, inactivo, de una categoría inactiva o sin variantes activas → 50004.
-- Result sets, en orden:
--   1. Producto (una fila)
--   2. Variantes activas, con su existencia disponible
--   3. Valores de atributo de cada variante activa
--   4. Imágenes (la principal primero)
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ObtenerProducto
    @IDProducto INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Producto AS p
        INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
        WHERE p.IDProducto = @IDProducto
          AND p.Activo = 1
          AND c.Activo = 1
          AND EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDProducto = p.IDProducto AND v.Activo = 1)
    )
        THROW 50004, N'El producto no existe o no está disponible.', 1;

    -- 1. Producto
    SELECT
        p.IDProducto,
        p.Nombre,
        p.Descripcion,
        c.IDCategoria,
        c.Nombre AS Categoria,
        v.PrecioMinimo,
        v.PrecioMaximo,
        CONVERT(BIT, CASE WHEN v.Disponible > 0 THEN 1 ELSE 0 END) AS Disponible,
        p.FechaCreacion
    FROM dbo.Producto AS p
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT
            MIN(va.Precio) AS PrecioMinimo,
            MAX(va.Precio) AS PrecioMaximo,
            ISNULL(SUM(d.ExistenciaDisponible), 0) AS Disponible
        FROM dbo.Variante AS va
        CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(va.IDVariante, NULL) AS d
        WHERE va.IDProducto = p.IDProducto
          AND va.Activo = 1
    ) AS v
    WHERE p.IDProducto = @IDProducto;

    -- 2. Variantes activas
    SELECT
        v.IDVariante,
        v.SKU,
        v.Precio,
        d.ExistenciaDisponible,
        dv.Descripcion
    FROM dbo.Variante AS v
    CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(v.IDVariante, NULL) AS d
    OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(v.IDVariante) AS dv
    WHERE v.IDProducto = @IDProducto
      AND v.Activo = 1
    ORDER BY v.IDVariante;

    -- 3. Valores de atributo de las variantes activas
    SELECT
        vva.IDVariante,
        vva.IDAtributo,
        a.Nombre AS Atributo,
        vva.IDValorAtributo,
        va.Valor
    FROM dbo.VarianteValorAtributo AS vva
    INNER JOIN dbo.Variante AS v ON v.IDVariante = vva.IDVariante
    INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vva.IDAtributo
    INNER JOIN dbo.ValorAtributo AS va ON va.IDValorAtributo = vva.IDValorAtributo
    WHERE v.IDProducto = @IDProducto
      AND v.Activo = 1
    ORDER BY vva.IDVariante, vva.IDAtributo;

    -- 4. Imágenes
    SELECT
        pi.IDProductoImagen,
        pi.Url,
        pi.Orden,
        pi.EsPrincipal
    FROM dbo.ProductoImagen AS pi
    WHERE pi.IDProducto = @IDProducto
    ORDER BY pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen;
END;
GO

/* =========================================================
   Categorías
   ========================================================= */

-- GET /api/categorias: lista paginada, incluye inactivas.
--   @Texto   busca en nombre y descripción
--   @Orden   nombre | activo | cantidadProductos, con :asc o :desc. Default nombre:asc.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_Listar
    @Texto        NVARCHAR(100) = NULL,
    @Activo       BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'nombre:asc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'nombre:asc', N'nombre:desc', N'activo:asc', N'activo:desc',
                      N'cantidadProductos:asc', N'cantidadProductos:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden, N'. Usa nombre, activo o cantidadProductos con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDCategoria       INT           NOT NULL PRIMARY KEY,
        Nombre            NVARCHAR(100) NOT NULL,
        Descripcion       NVARCHAR(500) NULL,
        Activo            BIT           NOT NULL,
        CantidadProductos INT           NOT NULL,
        CantidadCupones   INT           NOT NULL
    );

    INSERT INTO @Fila (IDCategoria, Nombre, Descripcion, Activo, CantidadProductos, CantidadCupones)
    SELECT
        c.IDCategoria,
        c.Nombre,
        c.Descripcion,
        c.Activo,
        (SELECT COUNT(*) FROM dbo.Producto AS p WHERE p.IDCategoria = c.IDCategoria),
        (SELECT COUNT(*) FROM dbo.Cupon AS cu WHERE cu.IDCategoria = c.IDCategoria)
    FROM dbo.Categoria AS c
    WHERE (@Activo IS NULL OR c.Activo = @Activo)
      AND (@Patron IS NULL OR c.Nombre LIKE @Patron OR c.Descripcion LIKE @Patron)
    OPTION (RECOMPILE);

    SELECT IDCategoria, Nombre, Descripcion, Activo, CantidadProductos, CantidadCupones
    FROM @Fila
    ORDER BY
        CASE WHEN @Orden = N'nombre:asc'             THEN Nombre            END ASC,
        CASE WHEN @Orden = N'nombre:desc'            THEN Nombre            END DESC,
        CASE WHEN @Orden = N'activo:asc'             THEN Activo            END ASC,
        CASE WHEN @Orden = N'activo:desc'            THEN Activo            END DESC,
        CASE WHEN @Orden = N'cantidadProductos:asc'  THEN CantidadProductos END ASC,
        CASE WHEN @Orden = N'cantidadProductos:desc' THEN CantidadProductos END DESC,
        Nombre ASC,
        IDCategoria ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/categorias/:id. También es el resultado de los SPs que crean o modifican categorías.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_ObtenerPorId
    @IDCategoria INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Categoria WHERE IDCategoria = @IDCategoria)
        THROW 50004, N'La categoría no existe.', 1;

    SELECT
        c.IDCategoria,
        c.Nombre,
        c.Descripcion,
        c.Activo,
        (SELECT COUNT(*) FROM dbo.Producto AS p WHERE p.IDCategoria = c.IDCategoria) AS CantidadProductos,
        (SELECT COUNT(*) FROM dbo.Cupon AS cu WHERE cu.IDCategoria = c.IDCategoria) AS CantidadCupones
    FROM dbo.Categoria AS c
    WHERE c.IDCategoria = @IDCategoria;
END;
GO

-- POST /api/categorias. Nombre repetido → 2627 (UQ_Categoria_Nombre) → DUPLICADO.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_Crear
    @IDUsuarioSolicitante INT,
    @Nombre               NVARCHAR(100),
    @Descripcion          NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCategoria INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Nombre = TRIM(@Nombre);
    SET @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre de la categoría es obligatorio.', 1;

        -- 3. Escribir
        INSERT INTO dbo.Categoria (Nombre, Descripcion, Activo)
        VALUES (@Nombre, @Descripcion, 1);

        SET @IDCategoria = SCOPE_IDENTITY();

        -- 4. Bitácora
        SET @Nuevo = (SELECT IDCategoria, Nombre, Descripcion, Activo
                      FROM dbo.Categoria WHERE IDCategoria = @IDCategoria
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Categoria', @IDCategoria, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Categorias_ObtenerPorId @IDCategoria = @IDCategoria;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/categorias/:id: reemplaza nombre y descripción (NULL la borra).
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_Actualizar
    @IDUsuarioSolicitante INT,
    @IDCategoria          INT,
    @Nombre               NVARCHAR(100),
    @Descripcion          NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    SET @Nombre = TRIM(@Nombre);
    SET @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre de la categoría es obligatorio.', 1;

        -- 2. Bloquear y leer el valor anterior
        SET @Anterior = (SELECT IDCategoria, Nombre, Descripcion, Activo
                         FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK)
                         WHERE IDCategoria = @IDCategoria
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior IS NULL
            THROW 50004, N'La categoría no existe.', 1;

        -- 3. Escribir. Nombre repetido → 2627 → DUPLICADO.
        UPDATE dbo.Categoria
        SET Nombre = @Nombre,
            Descripcion = @Descripcion
        WHERE IDCategoria = @IDCategoria;

        -- 4. Bitácora
        SET @Nuevo = (SELECT IDCategoria, Nombre, Descripcion, Activo
                      FROM dbo.Categoria WHERE IDCategoria = @IDCategoria
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Categoria', @IDCategoria, N'MODIFICAR', @Anterior, @Nuevo);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Categorias_ObtenerPorId @IDCategoria = @IDCategoria;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/categorias/:id/estado. Desactivar oculta del catálogo público todos sus productos,
-- sin cambiar el estado de cada producto. Si ya está en ese estado no escribe ni registra nada.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDCategoria          INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        SELECT @ActivoActual = Activo
        FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK)
        WHERE IDCategoria = @IDCategoria;

        IF @ActivoActual IS NULL
            THROW 50004, N'La categoría no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SET @Anterior = (SELECT IDCategoria, Nombre, Activo FROM dbo.Categoria
                             WHERE IDCategoria = @IDCategoria
                             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            UPDATE dbo.Categoria SET Activo = @Activo WHERE IDCategoria = @IDCategoria;

            SET @Nuevo = (SELECT IDCategoria, Nombre, Activo FROM dbo.Categoria
                          WHERE IDCategoria = @IDCategoria
                          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Categoria', @IDCategoria,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Categorias_ObtenerPorId @IDCategoria = @IDCategoria;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/categorias/:id: solo si no tiene productos (aunque estén inactivos) ni cupones → 50051.
-- La categoría queda bloqueada con UPDLOCK y SP_Productos_Crear/Actualizar bloquean la suya igual,
-- así un producto no puede entrar a la categoría entre la comprobación y el DELETE.
-- La comprobación lee con READCOMMITTEDLOCK: con READ_COMMITTED_SNAPSHOT una lectura normal no
-- vería un producto insertado por otra transacción aún sin confirmar.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_Eliminar
    @IDUsuarioSolicitante INT,
    @IDCategoria          INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SET @Anterior = (SELECT IDCategoria, Nombre, Descripcion, Activo
                         FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK)
                         WHERE IDCategoria = @IDCategoria
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior IS NULL
            THROW 50004, N'La categoría no existe.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Producto WITH (READCOMMITTEDLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50051, N'La categoría tiene productos; muévelos a otra categoría o desactívala en lugar de eliminarla.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Cupon WITH (READCOMMITTEDLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50051, N'La categoría tiene cupones asociados; desactívala en lugar de eliminarla.', 1;

        DELETE FROM dbo.Categoria WHERE IDCategoria = @IDCategoria;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Categoria', @IDCategoria, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Productos
   ========================================================= */

-- GET /api/productos: lista paginada, incluye inactivos.
--   @Texto   busca en nombre del producto y SKU de cualquiera de sus variantes
--   @Orden   nombre | categoria | precio | existencia | fechaCreacion, con :asc o :desc.
--            Default fechaCreacion:desc. "precio" ordena por PrecioMinimo (de todas sus variantes)
--            y "existencia" por ExistenciaFisica (suma de sus variantes).
CREATE OR ALTER PROCEDURE dbo.SP_Productos_Listar
    @Texto        NVARCHAR(150) = NULL,
    @IDCategoria  INT           = NULL,
    @Activo       BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'fechaCreacion:desc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'nombre:asc', N'nombre:desc', N'categoria:asc', N'categoria:desc',
                      N'precio:asc', N'precio:desc', N'existencia:asc', N'existencia:desc',
                      N'fechaCreacion:asc', N'fechaCreacion:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa nombre, categoria, precio, existencia o fechaCreacion con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDProducto               INT           NOT NULL PRIMARY KEY,
        Nombre                   NVARCHAR(150) NOT NULL,
        IDCategoria              INT           NOT NULL,
        Categoria                NVARCHAR(100) NOT NULL,
        Activo                   BIT           NOT NULL,
        CantidadVariantes        INT           NOT NULL,
        CantidadVariantesActivas INT           NOT NULL,
        PrecioMinimo             DECIMAL(12,2) NULL,
        PrecioMaximo             DECIMAL(12,2) NULL,
        ExistenciaFisica         INT           NOT NULL,
        ExistenciaReservada      INT           NOT NULL,
        ExistenciaDisponible     INT           NOT NULL,
        ImagenPrincipal          NVARCHAR(500) NULL,
        FechaCreacion            DATETIME2(3)  NOT NULL,
        FechaModificacion        DATETIME2(3)  NULL
    );

    INSERT INTO @Fila (IDProducto, Nombre, IDCategoria, Categoria, Activo, CantidadVariantes,
                       CantidadVariantesActivas, PrecioMinimo, PrecioMaximo, ExistenciaFisica,
                       ExistenciaReservada, ExistenciaDisponible, ImagenPrincipal, FechaCreacion,
                       FechaModificacion)
    SELECT
        p.IDProducto,
        p.Nombre,
        c.IDCategoria,
        c.Nombre,
        p.Activo,
        v.CantidadVariantes,
        v.CantidadVariantesActivas,
        v.PrecioMinimo,
        v.PrecioMaximo,
        v.ExistenciaFisica,
        v.ExistenciaReservada,
        v.ExistenciaDisponible,
        img.Url,
        p.FechaCreacion,
        p.FechaModificacion
    FROM dbo.Producto AS p
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT
            COUNT(*)                                          AS CantidadVariantes,
            ISNULL(SUM(CASE WHEN va.Activo = 1 THEN 1 ELSE 0 END), 0) AS CantidadVariantesActivas,
            MIN(va.Precio)                                    AS PrecioMinimo,
            MAX(va.Precio)                                    AS PrecioMaximo,
            ISNULL(SUM(d.ExistenciaFisica), 0)                AS ExistenciaFisica,
            ISNULL(SUM(d.ExistenciaReservada), 0)             AS ExistenciaReservada,
            ISNULL(SUM(d.ExistenciaDisponible), 0)            AS ExistenciaDisponible
        FROM dbo.Variante AS va
        CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(va.IDVariante, NULL) AS d
        WHERE va.IDProducto = p.IDProducto
    ) AS v
    OUTER APPLY (
        SELECT TOP (1) pi.Url
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProducto = p.IDProducto
        ORDER BY pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen
    ) AS img
    WHERE (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@Activo IS NULL OR p.Activo = @Activo)
      AND (@Patron IS NULL
           OR p.Nombre LIKE @Patron
           OR EXISTS (SELECT 1 FROM dbo.Variante AS vs WHERE vs.IDProducto = p.IDProducto AND vs.SKU LIKE @Patron))
    OPTION (RECOMPILE);

    SELECT
        IDProducto, Nombre, IDCategoria, Categoria, Activo, CantidadVariantes, CantidadVariantesActivas,
        PrecioMinimo, PrecioMaximo, ExistenciaFisica, ExistenciaReservada, ExistenciaDisponible,
        ImagenPrincipal, FechaCreacion, FechaModificacion
    FROM @Fila
    ORDER BY
        CASE WHEN @Orden = N'nombre:asc'         THEN Nombre           END ASC,
        CASE WHEN @Orden = N'nombre:desc'        THEN Nombre           END DESC,
        CASE WHEN @Orden = N'categoria:asc'      THEN Categoria        END ASC,
        CASE WHEN @Orden = N'categoria:desc'     THEN Categoria        END DESC,
        CASE WHEN @Orden = N'precio:asc'         THEN PrecioMinimo     END ASC,
        CASE WHEN @Orden = N'precio:desc'        THEN PrecioMinimo     END DESC,
        CASE WHEN @Orden = N'existencia:asc'     THEN ExistenciaFisica END ASC,
        CASE WHEN @Orden = N'existencia:desc'    THEN ExistenciaFisica END DESC,
        CASE WHEN @Orden = N'fechaCreacion:asc'  THEN FechaCreacion    END ASC,
        CASE WHEN @Orden = N'fechaCreacion:desc' THEN FechaCreacion    END DESC,
        IDProducto ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/productos/:id: detalle de gestión, incluye variantes inactivas.
-- También es el resultado de los SPs que crean o modifican productos e imágenes.
-- Result sets, en orden:
--   1. Producto (una fila), con TieneVentas y PuedeEliminarse
--   2. Variantes (todas), con existencia física, reservada vigente y disponible
--   3. Valores de atributo de cada variante
--   4. Imágenes (la principal primero)
CREATE OR ALTER PROCEDURE dbo.SP_Productos_ObtenerPorId
    @IDProducto INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Producto WHERE IDProducto = @IDProducto)
        THROW 50004, N'El producto no existe.', 1;

    -- 1. Producto
    SELECT
        p.IDProducto,
        p.Nombre,
        p.Descripcion,
        c.IDCategoria,
        c.Nombre AS Categoria,
        c.Activo AS CategoriaActiva,
        p.Activo,
        p.FechaCreacion,
        p.FechaModificacion,
        CONVERT(BIT, CASE WHEN h.Ventas = 1 THEN 1 ELSE 0 END) AS TieneVentas,
        CONVERT(BIT, CASE WHEN h.Ventas = 0 AND h.Movimientos = 0 THEN 1 ELSE 0 END) AS PuedeEliminarse
    FROM dbo.Producto AS p
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT
            CASE WHEN EXISTS (SELECT 1 FROM dbo.PedidoDetalle AS pd
                              INNER JOIN dbo.Variante AS v ON v.IDVariante = pd.IDVariante
                              WHERE v.IDProducto = p.IDProducto) THEN 1 ELSE 0 END AS Ventas,
            CASE WHEN EXISTS (SELECT 1 FROM dbo.MovimientoInventario AS mi
                              INNER JOIN dbo.Variante AS v ON v.IDVariante = mi.IDVariante
                              WHERE v.IDProducto = p.IDProducto) THEN 1 ELSE 0 END AS Movimientos
    ) AS h
    WHERE p.IDProducto = @IDProducto;

    -- 2. Variantes
    SELECT
        v.IDVariante,
        v.IDProducto,
        v.SKU,
        v.Precio,
        d.ExistenciaFisica,
        d.ExistenciaReservada,
        d.ExistenciaDisponible,
        v.Activo,
        dv.Descripcion
    FROM dbo.Variante AS v
    CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(v.IDVariante, NULL) AS d
    OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(v.IDVariante) AS dv
    WHERE v.IDProducto = @IDProducto
    ORDER BY v.IDVariante;

    -- 3. Valores de atributo
    SELECT
        vva.IDVariante,
        vva.IDAtributo,
        a.Nombre AS Atributo,
        vva.IDValorAtributo,
        va.Valor
    FROM dbo.VarianteValorAtributo AS vva
    INNER JOIN dbo.Variante AS v ON v.IDVariante = vva.IDVariante
    INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vva.IDAtributo
    INNER JOIN dbo.ValorAtributo AS va ON va.IDValorAtributo = vva.IDValorAtributo
    WHERE v.IDProducto = @IDProducto
    ORDER BY vva.IDVariante, vva.IDAtributo;

    -- 4. Imágenes
    SELECT
        pi.IDProductoImagen,
        pi.Url,
        pi.Orden,
        pi.EsPrincipal
    FROM dbo.ProductoImagen AS pi
    WHERE pi.IDProducto = @IDProducto
    ORDER BY pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen;
END;
GO

-- POST /api/productos: crea el producto y sus variantes en una sola transacción.
-- @Variantes es un arreglo JSON (las claves distinguen mayúsculas):
--   [{ "sku": "CAM-001-M", "precio": 149.00, "existenciaInicial": 10, "valores": [2, 12] }, …]
--   sku                obligatorio, hasta 50 caracteres; repetido → 2627 (UQ_Variante_SKU) → DUPLICADO
--   precio             obligatorio, mayor que 0 y con 2 decimales como máximo (número o texto "149.00")
--   existenciaInicial  opcional (0 si falta), entero >= 0; entra al kardex como INVENTARIO_INICIAL
--   valores            opcional, arreglo de IDValorAtributo; como máximo uno por atributo
-- Dentro del producto cada variante debe tener una combinación de valores distinta.
-- Bitácora: CREAR del Producto (con sus variantes) y CREAR de cada Variante.
-- Resultado: los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_Crear
    @IDUsuarioSolicitante INT,
    @IDCategoria          INT,
    @Nombre               NVARCHAR(150),
    @Descripcion          NVARCHAR(MAX) = NULL,
    @Variantes            NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT;
    DECLARE @IDTipoInicial INT, @SignoInicial SMALLINT;
    DECLARE @Indice INT;
    DECLARE @Mensaje NVARCHAR(2048);

    DECLARE @Variante TABLE (
        Indice          INT           NOT NULL PRIMARY KEY,  -- posición en el arreglo, desde 0
        SKU             NVARCHAR(MAX) NULL,
        PrecioTexto     NVARCHAR(100) NULL,
        ExistenciaTexto NVARCHAR(100) NULL,
        ValoresJson     NVARCHAR(MAX) NULL,
        TipoValores     TINYINT       NULL,                  -- tipo JSON de "valores": NULL falta, 0 null, 4 arreglo
        Precio          DECIMAL(12,2) NULL,
        Existencia      INT           NULL
    );

    DECLARE @VarianteValor TABLE (
        Indice          INT NOT NULL,
        Posicion        INT NULL,
        IDValorAtributo INT NULL,
        IDAtributo      INT NULL
    );

    SET @Nombre = TRIM(@Nombre);
    SET @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre del producto es obligatorio.', 1;

        -- La categoría se bloquea: SP_Categorias_Eliminar no puede borrarla mientras tanto.
        IF NOT EXISTS (SELECT 1 FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50004, N'La categoría no existe.', 1;

        -- @Variantes debe ser un arreglo JSON de objetos. Se envuelve en [ ] para leer el tipo
        -- del valor completo: 4 = arreglo (ISJSON también acepta un objeto).
        IF @Variantes IS NULL OR ISJSON(@Variantes) = 0
           OR (SELECT [type] FROM OPENJSON(N'[' + @Variantes + N']') WHERE [key] = N'0') <> 4
            THROW 50001, N'Las variantes deben enviarse como un arreglo JSON.', 1;

        IF NOT EXISTS (SELECT 1 FROM OPENJSON(@Variantes))
            THROW 50001, N'El producto debe tener al menos una variante.', 1;

        SELECT TOP (1) @Indice = CONVERT(INT, [key])
        FROM OPENJSON(@Variantes)
        WHERE [type] <> 5
        ORDER BY CONVERT(INT, [key]);

        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'La variante ', @Indice + 1, N' no es un objeto JSON.');
            THROW 50001, @Mensaje, 1;
        END;

        INSERT INTO @Variante (Indice, SKU, PrecioTexto, ExistenciaTexto, ValoresJson, TipoValores)
        SELECT
            CONVERT(INT, e.[key]),
            NULLIF(TRIM(w.sku), N''),
            w.precio,
            w.existenciaInicial,
            w.valores,
            (SELECT x.[type] FROM OPENJSON(e.[value]) AS x WHERE x.[key] = N'valores')
        FROM OPENJSON(@Variantes) AS e
        CROSS APPLY OPENJSON(e.[value]) WITH (
            sku               NVARCHAR(MAX) N'$.sku',
            precio            NVARCHAR(100) N'$.precio',
            existenciaInicial NVARCHAR(100) N'$.existenciaInicial',
            valores           NVARCHAR(MAX) N'$.valores' AS JSON
        ) AS w;

        UPDATE @Variante
        SET Precio = CASE
                         WHEN TRY_CONVERT(DECIMAL(12,2), PrecioTexto) > 0
                          AND TRY_CONVERT(DECIMAL(38,10), PrecioTexto) = TRY_CONVERT(DECIMAL(12,2), PrecioTexto)
                         THEN TRY_CONVERT(DECIMAL(12,2), PrecioTexto)
                     END,
            Existencia = CASE
                             WHEN ExistenciaTexto IS NULL THEN 0
                             WHEN TRY_CONVERT(INT, ExistenciaTexto) >= 0 THEN TRY_CONVERT(INT, ExistenciaTexto)
                         END;

        SET @Indice = (SELECT MIN(Indice) FROM @Variante WHERE SKU IS NULL OR LEN(SKU) > 50);
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'La variante ', @Indice + 1, N' necesita un SKU de hasta 50 caracteres.');
            THROW 50001, @Mensaje, 1;
        END;

        SET @Indice = (SELECT MIN(Indice) FROM @Variante WHERE Precio IS NULL);
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'La variante ', @Indice + 1, N' necesita un precio mayor que 0 con 2 decimales como máximo.');
            THROW 50001, @Mensaje, 1;
        END;

        SET @Indice = (SELECT MIN(Indice) FROM @Variante WHERE Existencia IS NULL);
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'La existencia inicial de la variante ', @Indice + 1, N' debe ser un entero mayor o igual a 0.');
            THROW 50001, @Mensaje, 1;
        END;

        SET @Indice = (SELECT MIN(Indice) FROM @Variante WHERE TipoValores NOT IN (0, 4));
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'Los valores de la variante ', @Indice + 1, N' deben ser un arreglo de IDs de valor de atributo.');
            THROW 50001, @Mensaje, 1;
        END;

        INSERT INTO @VarianteValor (Indice, Posicion, IDValorAtributo, IDAtributo)
        SELECT v.Indice, l.Posicion, l.IDValorAtributo, l.IDAtributo
        FROM @Variante AS v
        CROSS APPLY dbo.FU_Catalogo_LeerValoresAtributo(v.ValoresJson) AS l
        WHERE v.TipoValores = 4;

        SET @Indice = (SELECT MIN(Indice) FROM @VarianteValor WHERE IDValorAtributo IS NULL);
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'Los valores de la variante ', @Indice + 1, N' deben ser IDs enteros de valor de atributo.');
            THROW 50001, @Mensaje, 1;
        END;

        SELECT TOP (1) @Mensaje = CONCAT(N'El valor de atributo ', IDValorAtributo, N' de la variante ', Indice + 1, N' no existe.')
        FROM @VarianteValor
        WHERE IDAtributo IS NULL
        ORDER BY Indice, Posicion;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        SELECT TOP (1) @Mensaje = CONCAT(N'La variante ', vv.Indice + 1, N' repite el atributo ', a.Nombre,
                                         N'; cada variante lleva como máximo un valor por atributo.')
        FROM @VarianteValor AS vv
        INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vv.IDAtributo
        GROUP BY vv.Indice, a.IDAtributo, a.Nombre
        HAVING COUNT(*) > 1
        ORDER BY vv.Indice;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        -- Dos variantes del mismo producto no pueden tener la misma combinación de valores.
        SELECT TOP (1) @Mensaje = CONCAT(N'Las variantes ', MIN(c.Indice) + 1, N' y ', MAX(c.Indice) + 1,
                                         N' tienen la misma combinación de valores de atributo.')
        FROM (
            SELECT
                v.Indice,
                ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), vv.IDValorAtributo), N',')
                                  WITHIN GROUP (ORDER BY vv.IDValorAtributo)
                        FROM @VarianteValor AS vv WHERE vv.Indice = v.Indice), N'') AS Combinacion
            FROM @Variante AS v
        ) AS c
        GROUP BY c.Combinacion
        HAVING COUNT(*) > 1
        ORDER BY MIN(c.Indice);

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        -- El tipo de movimiento se busca por código, nunca por ID fijo.
        SELECT @IDTipoInicial = IDTipoMovimientoInventario, @SignoInicial = Signo
        FROM dbo.TipoMovimientoInventario
        WHERE Codigo = N'INVENTARIO_INICIAL';

        IF @IDTipoInicial IS NULL
            THROW 50000, N'No existe el tipo de movimiento INVENTARIO_INICIAL; ejecuta 085_datos_catalogos.sql.', 1;

        -- 3. Escribir
        INSERT INTO dbo.Producto (IDCategoria, Nombre, Descripcion, Activo)
        VALUES (@IDCategoria, @Nombre, @Descripcion, 1);

        SET @IDProducto = SCOPE_IDENTITY();

        -- La existencia nace en 0 y solo la mueve el kardex. SKU repetido → 2627 → DUPLICADO.
        INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ExistenciaReservada, Activo)
        SELECT @IDProducto, CONVERT(NVARCHAR(50), SKU), Precio, 0, 0, 1
        FROM @Variante
        ORDER BY Indice;

        INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo)
        SELECT v.IDVariante, vv.IDAtributo, vv.IDValorAtributo
        FROM @VarianteValor AS vv
        INNER JOIN @Variante AS s ON s.Indice = vv.Indice
        INNER JOIN dbo.Variante AS v ON v.SKU = CONVERT(NVARCHAR(50), s.SKU);

        -- 4. Kardex: un INVENTARIO_INICIAL por variante con existencia; el Signo sale del tipo.
        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                              Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
        SELECT v.IDVariante, @IDTipoInicial, @SignoInicial, @IDUsuarioSolicitante,
               s.Existencia, v.ExistenciaFisica, v.ExistenciaFisica + @SignoInicial * s.Existencia,
               N'Inventario inicial al crear el producto'
        FROM @Variante AS s
        INNER JOIN dbo.Variante AS v ON v.SKU = CONVERT(NVARCHAR(50), s.SKU)
        WHERE s.Existencia > 0
        ORDER BY s.Indice;

        UPDATE v
        SET ExistenciaFisica = v.ExistenciaFisica + @SignoInicial * s.Existencia
        FROM dbo.Variante AS v
        INNER JOIN @Variante AS s ON CONVERT(NVARCHAR(50), s.SKU) = v.SKU
        WHERE v.IDProducto = @IDProducto
          AND s.Existencia > 0;

        -- 4. Bitácora
        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        SELECT @IDUsuarioSolicitante, N'Catalogo', N'Producto', @IDProducto, N'CREAR', NULL, pj.Json
        FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 1) AS pj;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        SELECT @IDUsuarioSolicitante, N'Catalogo', N'Variante', v.IDVariante, N'CREAR', NULL, vj.Json
        FROM dbo.Variante AS v
        CROSS APPLY dbo.FU_Catalogo_VarianteJson(v.IDVariante) AS vj
        WHERE v.IDProducto = @IDProducto
        ORDER BY v.IDVariante;

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Productos_ObtenerPorId @IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/productos/:id: reemplaza nombre, descripción (NULL la borra) y categoría.
-- Resultado: los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_Actualizar
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @IDCategoria          INT,
    @Nombre               NVARCHAR(150),
    @Descripcion          NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCategoriaActual INT;
    DECLARE @Anterior NVARCHAR(MAX);

    SET @Nombre = TRIM(@Nombre);
    SET @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre del producto es obligatorio.', 1;

        -- Orden de bloqueo: categoría y luego producto.
        IF NOT EXISTS (SELECT 1 FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50004, N'La categoría no existe.', 1;

        SELECT @IDCategoriaActual = IDCategoria
        FROM dbo.Producto WITH (UPDLOCK, ROWLOCK)
        WHERE IDProducto = @IDProducto;

        IF @IDCategoriaActual IS NULL
            THROW 50004, N'El producto no existe.', 1;

        SELECT @Anterior = Json FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 0);

        UPDATE dbo.Producto
        SET IDCategoria = @IDCategoria,
            Nombre = @Nombre,
            Descripcion = @Descripcion,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDProducto = @IDProducto;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        SELECT @IDUsuarioSolicitante, N'Catalogo', N'Producto', @IDProducto, N'MODIFICAR', @Anterior, pj.Json
        FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 0) AS pj;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Productos_ObtenerPorId @IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/productos/:id/estado. Un producto inactivo deja de verse en la tienda; sus variantes
-- conservan su propio estado. Si ya está en ese estado no escribe ni registra nada.
-- Resultado: los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT;
    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        SELECT @ActivoActual = Activo
        FROM dbo.Producto WITH (UPDLOCK, ROWLOCK)
        WHERE IDProducto = @IDProducto;

        IF @ActivoActual IS NULL
            THROW 50004, N'El producto no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 0);

            UPDATE dbo.Producto
            SET Activo = @Activo,
                FechaModificacion = SYSUTCDATETIME()
            WHERE IDProducto = @IDProducto;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            SELECT @IDUsuarioSolicitante, N'Catalogo', N'Producto', @IDProducto,
                   CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, pj.Json
            FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 0) AS pj;
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

-- DELETE /api/productos/:id: borrado físico solo si el producto nunca se vendió ni tuvo existencia.
--   Con ventas (PedidoDetalle)                        → 50050 PRODUCTO_CON_VENTAS: se desactiva
--   Sin ventas pero con movimientos de kardex o reservas → 50051 EN_USO: el kardex es inmutable
--     (TR_Inventario_ImpedirCambiosKardex) y sus movimientos no pueden quedar sin variante
-- Borra también sus imágenes, sus variantes con sus valores y las líneas de carrito que las tengan.
-- Bloquea el producto y sus variantes antes de comprobar: un pedido en curso sobre una de ellas
-- (que bloquea la variante con UPDLOCK) termina primero y entonces se ve su venta.
-- Bitácora: ELIMINAR del Producto con la foto de sus variantes en ValorAnterior. Sin result set.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_Eliminar
    @IDUsuarioSolicitante INT,
    @IDProducto           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

        -- Bloquear las variantes (sin devolver filas).
        DECLARE @Bloqueadas INT = (SELECT COUNT(*) FROM dbo.Variante WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto);

        IF EXISTS (SELECT 1
                   FROM dbo.PedidoDetalle AS pd WITH (READCOMMITTEDLOCK)
                   INNER JOIN dbo.Variante AS v ON v.IDVariante = pd.IDVariante
                   WHERE v.IDProducto = @IDProducto)
            THROW 50050, N'El producto tiene ventas y no puede eliminarse; desactívalo para que deje de mostrarse en la tienda.', 1;

        IF EXISTS (SELECT 1
                   FROM dbo.MovimientoInventario AS mi WITH (READCOMMITTEDLOCK)
                   INNER JOIN dbo.Variante AS v ON v.IDVariante = mi.IDVariante
                   WHERE v.IDProducto = @IDProducto)
           OR EXISTS (SELECT 1
                      FROM dbo.ReservaExistencia AS re WITH (READCOMMITTEDLOCK)
                      INNER JOIN dbo.Variante AS v ON v.IDVariante = re.IDVariante
                      WHERE v.IDProducto = @IDProducto)
            THROW 50051, N'El producto tiene movimientos de inventario y no puede eliminarse; desactívalo en lugar de eliminarlo.', 1;

        SELECT @Anterior = Json FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 1);

        DELETE cd
        FROM dbo.CarritoDetalle AS cd
        INNER JOIN dbo.Variante AS v ON v.IDVariante = cd.IDVariante
        WHERE v.IDProducto = @IDProducto;

        DELETE vva
        FROM dbo.VarianteValorAtributo AS vva
        INNER JOIN dbo.Variante AS v ON v.IDVariante = vva.IDVariante
        WHERE v.IDProducto = @IDProducto;

        DELETE FROM dbo.Variante WHERE IDProducto = @IDProducto;
        DELETE FROM dbo.ProductoImagen WHERE IDProducto = @IDProducto;
        DELETE FROM dbo.Producto WHERE IDProducto = @IDProducto;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Producto', @IDProducto, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/productos/:id/imagenes: agrega una imagen por URL (http:// o https://).
-- @EsPrincipal = 1 quita la marca a la principal anterior (UX_ProductoImagen_Principal permite una).
-- Si el producto no tenía imagen principal, la nueva lo es aunque @EsPrincipal = 0.
-- Bitácora: CREAR de ProductoImagen. Resultado: los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_AgregarImagen
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @Url                  NVARCHAR(500),
    @Orden                INT = 0,
    @EsPrincipal          BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProductoImagen INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Url = TRIM(@Url);
    SET @Orden = ISNULL(@Orden, 0);
    SET @EsPrincipal = ISNULL(@EsPrincipal, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Url IS NULL OR (@Url NOT LIKE N'http://_%' AND @Url NOT LIKE N'https://_%')
            THROW 50001, N'La URL de la imagen debe empezar con http:// o https://.', 1;

        IF @Orden NOT BETWEEN 0 AND 255
            THROW 50001, N'El orden de la imagen debe estar entre 0 y 255.', 1;

        -- El bloqueo del producto serializa los cambios de imagen principal.
        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

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

-- DELETE /api/productos/:id/imagenes/:idImagen. Una imagen de otro producto → 50004.
-- Si era la principal, la siguiente por Orden pasa a serlo.
-- Bitácora: ELIMINAR de ProductoImagen. Sin result set.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_EliminarImagen
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @IDProductoImagen     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @EraPrincipal BIT;
    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

        SELECT @EraPrincipal = EsPrincipal
        FROM dbo.ProductoImagen WITH (UPDLOCK, ROWLOCK)
        WHERE IDProductoImagen = @IDProductoImagen
          AND IDProducto = @IDProducto;

        IF @EraPrincipal IS NULL
            THROW 50004, N'La imagen no existe en este producto.', 1;

        SET @Anterior = (SELECT IDProductoImagen, IDProducto, Url, Orden, EsPrincipal
                         FROM dbo.ProductoImagen WHERE IDProductoImagen = @IDProductoImagen
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        DELETE FROM dbo.ProductoImagen WHERE IDProductoImagen = @IDProductoImagen;

        IF @EraPrincipal = 1
            UPDATE dbo.ProductoImagen
            SET EsPrincipal = 1
            WHERE IDProductoImagen = (SELECT TOP (1) IDProductoImagen
                                      FROM dbo.ProductoImagen
                                      WHERE IDProducto = @IDProducto
                                      ORDER BY Orden, IDProductoImagen);

        UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'ProductoImagen', @IDProductoImagen, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Variantes
   ========================================================= */

-- Variante de gestión (sin endpoint propio): es el resultado de los SPs SP_Variantes_*.
-- Result sets, en orden:
--   1. Variante (una fila), mismas columnas que el result set 2 de SP_Productos_ObtenerPorId
--   2. Sus valores de atributo
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_ObtenerPorId
    @IDVariante INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Variante WHERE IDVariante = @IDVariante)
        THROW 50004, N'La variante no existe.', 1;

    SELECT
        v.IDVariante,
        v.IDProducto,
        v.SKU,
        v.Precio,
        d.ExistenciaFisica,
        d.ExistenciaReservada,
        d.ExistenciaDisponible,
        v.Activo,
        dv.Descripcion
    FROM dbo.Variante AS v
    CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(v.IDVariante, NULL) AS d
    OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(v.IDVariante) AS dv
    WHERE v.IDVariante = @IDVariante;

    SELECT
        vva.IDVariante,
        vva.IDAtributo,
        a.Nombre AS Atributo,
        vva.IDValorAtributo,
        va.Valor
    FROM dbo.VarianteValorAtributo AS vva
    INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vva.IDAtributo
    INNER JOIN dbo.ValorAtributo AS va ON va.IDValorAtributo = vva.IDValorAtributo
    WHERE vva.IDVariante = @IDVariante
    ORDER BY vva.IDAtributo;
END;
GO

-- POST /api/productos/:id/variantes: agrega una variante activa a un producto.
--   @Valores           arreglo JSON de IDValorAtributo ("[2, 12]"); NULL o "[]" = sin valores.
--                      Como máximo uno por atributo; un valor inexistente o un atributo repetido → 50001.
--   @ExistenciaInicial entra al kardex como INVENTARIO_INICIAL si es mayor que 0.
-- La combinación de valores no puede repetir la de otra variante del producto (activa o no) → 50001.
-- Bitácora: CREAR de Variante. Resultado: los 2 result sets de SP_Variantes_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_Crear
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @SKU                  NVARCHAR(50),
    @Precio               DECIMAL(12,2),
    @ExistenciaInicial    INT           = 0,
    @Valores              NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDVariante INT;
    DECLARE @IDTipoInicial INT, @SignoInicial SMALLINT;
    DECLARE @Combinacion NVARCHAR(MAX);
    DECLARE @Mensaje NVARCHAR(2048);
    DECLARE @Valor TABLE (Posicion INT NULL, IDValorAtributo INT NULL, IDAtributo INT NULL);

    SET @SKU = NULLIF(TRIM(@SKU), N'');
    SET @ExistenciaInicial = ISNULL(@ExistenciaInicial, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @SKU IS NULL
            THROW 50001, N'El SKU es obligatorio.', 1;

        IF @Precio IS NULL OR @Precio <= 0
            THROW 50001, N'El precio debe ser mayor que 0.', 1;

        IF @ExistenciaInicial < 0
            THROW 50001, N'La existencia inicial no puede ser negativa.', 1;

        IF @Valores IS NOT NULL
           AND (ISJSON(@Valores) = 0
                OR (SELECT [type] FROM OPENJSON(N'[' + @Valores + N']') WHERE [key] = N'0') <> 4)
            THROW 50001, N'Los valores de atributo deben enviarse como un arreglo JSON de IDs.', 1;

        -- 2. Bloquear el producto: serializa las variantes nuevas del mismo producto.
        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

        INSERT INTO @Valor (Posicion, IDValorAtributo, IDAtributo)
        SELECT Posicion, IDValorAtributo, IDAtributo
        FROM dbo.FU_Catalogo_LeerValoresAtributo(@Valores);

        IF EXISTS (SELECT 1 FROM @Valor WHERE IDValorAtributo IS NULL)
            THROW 50001, N'Los valores de atributo deben ser IDs enteros.', 1;

        SELECT TOP (1) @Mensaje = CONCAT(N'El valor de atributo ', IDValorAtributo, N' no existe.')
        FROM @Valor WHERE IDAtributo IS NULL ORDER BY Posicion;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        SELECT TOP (1) @Mensaje = CONCAT(N'La variante repite el atributo ', a.Nombre,
                                         N'; lleva como máximo un valor por atributo.')
        FROM @Valor AS x
        INNER JOIN dbo.Atributo AS a ON a.IDAtributo = x.IDAtributo
        GROUP BY a.IDAtributo, a.Nombre
        HAVING COUNT(*) > 1;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        SET @Combinacion = ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), IDValorAtributo), N',')
                                          WITHIN GROUP (ORDER BY IDValorAtributo)
                                   FROM @Valor), N'');

        SELECT TOP (1) @Mensaje = CONCAT(N'La variante ', v.SKU, N' ya tiene esa combinación de valores de atributo.')
        FROM dbo.Variante AS v
        WHERE v.IDProducto = @IDProducto
          AND ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), vva.IDValorAtributo), N',')
                             WITHIN GROUP (ORDER BY vva.IDValorAtributo)
                      FROM dbo.VarianteValorAtributo AS vva
                      WHERE vva.IDVariante = v.IDVariante), N'') = @Combinacion;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        SELECT @IDTipoInicial = IDTipoMovimientoInventario, @SignoInicial = Signo
        FROM dbo.TipoMovimientoInventario
        WHERE Codigo = N'INVENTARIO_INICIAL';

        IF @IDTipoInicial IS NULL
            THROW 50000, N'No existe el tipo de movimiento INVENTARIO_INICIAL; ejecuta 085_datos_catalogos.sql.', 1;

        -- 3. Escribir. SKU repetido → 2627 → DUPLICADO.
        INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ExistenciaReservada, Activo)
        VALUES (@IDProducto, @SKU, @Precio, 0, 0, 1);

        SET @IDVariante = SCOPE_IDENTITY();

        INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo)
        SELECT @IDVariante, IDAtributo, IDValorAtributo
        FROM @Valor;

        -- 4. Kardex
        IF @ExistenciaInicial > 0
        BEGIN
            INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                                  Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
            SELECT IDVariante, @IDTipoInicial, @SignoInicial, @IDUsuarioSolicitante,
                   @ExistenciaInicial, ExistenciaFisica, ExistenciaFisica + @SignoInicial * @ExistenciaInicial,
                   N'Inventario inicial al crear la variante'
            FROM dbo.Variante
            WHERE IDVariante = @IDVariante;

            UPDATE dbo.Variante
            SET ExistenciaFisica = ExistenciaFisica + @SignoInicial * @ExistenciaInicial
            WHERE IDVariante = @IDVariante;
        END;

        UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

        -- 4. Bitácora
        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        SELECT @IDUsuarioSolicitante, N'Catalogo', N'Variante', @IDVariante, N'CREAR', NULL, vj.Json
        FROM dbo.FU_Catalogo_VarianteJson(@IDVariante) AS vj;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Variantes_ObtenerPorId @IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/variantes/:id: cambia el SKU y, si @Valores no es NULL, reemplaza sus valores de atributo
-- ("[]" los quita todos). Mismas reglas de valores que SP_Variantes_Crear. No toca precio, estado
-- ni existencia. Los pedidos conservan su copia del SKU y de la descripción.
-- Bitácora: MODIFICAR de Variante (solo si cambió algo). Resultado: SP_Variantes_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_Actualizar
    @IDUsuarioSolicitante INT,
    @IDVariante           INT,
    @SKU                  NVARCHAR(50),
    @Valores              NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT;
    DECLARE @SKUActual NVARCHAR(50);
    DECLARE @Combinacion NVARCHAR(MAX), @CombinacionActual NVARCHAR(MAX);
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);
    DECLARE @Mensaje NVARCHAR(2048);
    DECLARE @Valor TABLE (Posicion INT NULL, IDValorAtributo INT NULL, IDAtributo INT NULL);

    SET @SKU = NULLIF(TRIM(@SKU), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @SKU IS NULL
            THROW 50001, N'El SKU es obligatorio.', 1;

        IF @Valores IS NOT NULL
           AND (ISJSON(@Valores) = 0
                OR (SELECT [type] FROM OPENJSON(N'[' + @Valores + N']') WHERE [key] = N'0') <> 4)
            THROW 50001, N'Los valores de atributo deben enviarse como un arreglo JSON de IDs.', 1;

        -- 2. Bloquear: producto (serializa la regla de combinación única) y luego la variante.
        SELECT @IDProducto = IDProducto FROM dbo.Variante WHERE IDVariante = @IDVariante;

        IF @IDProducto IS NULL
            THROW 50004, N'La variante no existe.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'La variante no existe.', 1;

        SELECT @SKUActual = SKU
        FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
        WHERE IDVariante = @IDVariante;

        IF @SKUActual IS NULL
            THROW 50004, N'La variante no existe.', 1;

        SET @CombinacionActual = ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), IDValorAtributo), N',')
                                                WITHIN GROUP (ORDER BY IDValorAtributo)
                                         FROM dbo.VarianteValorAtributo
                                         WHERE IDVariante = @IDVariante), N'');

        IF @Valores IS NULL
            SET @Combinacion = @CombinacionActual;
        ELSE
        BEGIN
            INSERT INTO @Valor (Posicion, IDValorAtributo, IDAtributo)
            SELECT Posicion, IDValorAtributo, IDAtributo
            FROM dbo.FU_Catalogo_LeerValoresAtributo(@Valores);

            IF EXISTS (SELECT 1 FROM @Valor WHERE IDValorAtributo IS NULL)
                THROW 50001, N'Los valores de atributo deben ser IDs enteros.', 1;

            SELECT TOP (1) @Mensaje = CONCAT(N'El valor de atributo ', IDValorAtributo, N' no existe.')
            FROM @Valor WHERE IDAtributo IS NULL ORDER BY Posicion;

            IF @@ROWCOUNT > 0
                THROW 50001, @Mensaje, 1;

            SELECT TOP (1) @Mensaje = CONCAT(N'La variante repite el atributo ', a.Nombre,
                                             N'; lleva como máximo un valor por atributo.')
            FROM @Valor AS x
            INNER JOIN dbo.Atributo AS a ON a.IDAtributo = x.IDAtributo
            GROUP BY a.IDAtributo, a.Nombre
            HAVING COUNT(*) > 1;

            IF @@ROWCOUNT > 0
                THROW 50001, @Mensaje, 1;

            SET @Combinacion = ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), IDValorAtributo), N',')
                                              WITHIN GROUP (ORDER BY IDValorAtributo)
                                       FROM @Valor), N'');

            SELECT TOP (1) @Mensaje = CONCAT(N'La variante ', v.SKU, N' ya tiene esa combinación de valores de atributo.')
            FROM dbo.Variante AS v
            WHERE v.IDProducto = @IDProducto
              AND v.IDVariante <> @IDVariante
              AND ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), vva.IDValorAtributo), N',')
                                 WITHIN GROUP (ORDER BY vva.IDValorAtributo)
                          FROM dbo.VarianteValorAtributo AS vva
                          WHERE vva.IDVariante = v.IDVariante), N'') = @Combinacion;

            IF @@ROWCOUNT > 0
                THROW 50001, @Mensaje, 1;
        END;

        -- Sin cambios: no escribe ni registra nada. El SKU se compara distinguiendo mayúsculas
        -- para que corregir "cam-01" a "CAM-01" sí cuente como cambio.
        IF @SKU COLLATE Modern_Spanish_100_CS_AS <> @SKUActual COLLATE Modern_Spanish_100_CS_AS
           OR @Combinacion <> @CombinacionActual
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Catalogo_VarianteJson(@IDVariante);

            -- SKU repetido → 2627 → DUPLICADO.
            UPDATE dbo.Variante SET SKU = @SKU WHERE IDVariante = @IDVariante;

            IF @Combinacion <> @CombinacionActual
            BEGIN
                DELETE FROM dbo.VarianteValorAtributo WHERE IDVariante = @IDVariante;

                INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo)
                SELECT @IDVariante, IDAtributo, IDValorAtributo
                FROM @Valor;
            END;

            UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

            SELECT @Nuevo = Json FROM dbo.FU_Catalogo_VarianteJson(@IDVariante);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Variante', @IDVariante, N'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Variantes_ObtenerPorId @IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/variantes/:id/precio. No altera pedidos ya realizados: PedidoDetalle guarda su precio.
-- Bitácora: MODIFICAR de Variante con ValorAnterior {"IDVariante","SKU","Precio"} y ValorNuevo igual
-- con el precio nuevo. Si el precio no cambia no escribe ni registra nada.
-- Resultado: los 2 result sets de SP_Variantes_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_CambiarPrecio
    @IDUsuarioSolicitante INT,
    @IDVariante           INT,
    @Precio               DECIMAL(12,2)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @PrecioActual DECIMAL(12,2);
    DECLARE @IDProducto INT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Precio IS NULL OR @Precio <= 0
            THROW 50001, N'El precio debe ser mayor que 0.', 1;

        SELECT @PrecioActual = Precio, @IDProducto = IDProducto
        FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
        WHERE IDVariante = @IDVariante;

        IF @PrecioActual IS NULL
            THROW 50004, N'La variante no existe.', 1;

        IF @PrecioActual <> @Precio
        BEGIN
            SET @Anterior = (SELECT IDVariante, SKU, Precio FROM dbo.Variante WHERE IDVariante = @IDVariante
                             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            UPDATE dbo.Variante SET Precio = @Precio WHERE IDVariante = @IDVariante;

            UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

            SET @Nuevo = (SELECT IDVariante, SKU, Precio FROM dbo.Variante WHERE IDVariante = @IDVariante
                          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Variante', @IDVariante, N'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Variantes_ObtenerPorId @IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/variantes/:id/estado. Una variante inactiva no se muestra ni se vende; conserva su
-- existencia. Si ya está en ese estado no escribe ni registra nada.
-- Bitácora: ACTIVAR o DESACTIVAR de Variante. Resultado: SP_Variantes_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDVariante           INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT;
    DECLARE @IDProducto INT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        SELECT @ActivoActual = Activo, @IDProducto = IDProducto
        FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
        WHERE IDVariante = @IDVariante;

        IF @ActivoActual IS NULL
            THROW 50004, N'La variante no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Catalogo_VarianteJson(@IDVariante);

            UPDATE dbo.Variante SET Activo = @Activo WHERE IDVariante = @IDVariante;

            UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

            SELECT @Nuevo = Json FROM dbo.FU_Catalogo_VarianteJson(@IDVariante);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Variante', @IDVariante,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Variantes_ObtenerPorId @IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Atributos
   ========================================================= */

-- GET /api/atributos: atributos con sus valores, en orden de creación (S, M, L, XL).
-- Result sets, en orden:
--   1. Atributos
--   2. Valores de todos los atributos, con cuántas variantes los usan
CREATE OR ALTER PROCEDURE dbo.SP_Atributos_Listar
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.IDAtributo,
        a.Nombre,
        (SELECT COUNT(*) FROM dbo.ValorAtributo AS va WHERE va.IDAtributo = a.IDAtributo) AS CantidadValores
    FROM dbo.Atributo AS a
    ORDER BY a.IDAtributo;

    SELECT
        va.IDValorAtributo,
        va.IDAtributo,
        va.Valor,
        (SELECT COUNT(*) FROM dbo.VarianteValorAtributo AS vva WHERE vva.IDValorAtributo = va.IDValorAtributo) AS CantidadVariantes
    FROM dbo.ValorAtributo AS va
    ORDER BY va.IDAtributo, va.IDValorAtributo;
END;
GO

-- POST /api/atributos. Nombre repetido → 2627 (UQ_Atributo_Nombre) → DUPLICADO.
-- Bitácora: CREAR de Atributo.
CREATE OR ALTER PROCEDURE dbo.SP_Atributos_Crear
    @IDUsuarioSolicitante INT,
    @Nombre               NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDAtributo INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Nombre = TRIM(@Nombre);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre del atributo es obligatorio.', 1;

        INSERT INTO dbo.Atributo (Nombre) VALUES (@Nombre);

        SET @IDAtributo = SCOPE_IDENTITY();

        SET @Nuevo = (SELECT IDAtributo, Nombre FROM dbo.Atributo WHERE IDAtributo = @IDAtributo
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Atributo', @IDAtributo, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        SELECT IDAtributo, Nombre
        FROM dbo.Atributo
        WHERE IDAtributo = @IDAtributo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/atributos/:id/valores. Valor repetido en el mismo atributo → 2627
-- (UQ_ValorAtributo_IDAtributo_Valor) → DUPLICADO. Bitácora: CREAR de ValorAtributo.
CREATE OR ALTER PROCEDURE dbo.SP_Atributos_AgregarValor
    @IDUsuarioSolicitante INT,
    @IDAtributo           INT,
    @Valor                NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDValorAtributo INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Valor = TRIM(@Valor);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Valor IS NULL OR LEN(@Valor) = 0
            THROW 50001, N'El valor del atributo es obligatorio.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.Atributo WITH (UPDLOCK, ROWLOCK) WHERE IDAtributo = @IDAtributo)
            THROW 50004, N'El atributo no existe.', 1;

        INSERT INTO dbo.ValorAtributo (IDAtributo, Valor) VALUES (@IDAtributo, @Valor);

        SET @IDValorAtributo = SCOPE_IDENTITY();

        SET @Nuevo = (SELECT va.IDValorAtributo, va.IDAtributo, a.Nombre AS Atributo, va.Valor
                      FROM dbo.ValorAtributo AS va
                      INNER JOIN dbo.Atributo AS a ON a.IDAtributo = va.IDAtributo
                      WHERE va.IDValorAtributo = @IDValorAtributo
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'ValorAtributo', @IDValorAtributo, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        SELECT va.IDValorAtributo, va.IDAtributo, a.Nombre AS Atributo, va.Valor
        FROM dbo.ValorAtributo AS va
        INNER JOIN dbo.Atributo AS a ON a.IDAtributo = va.IDAtributo
        WHERE va.IDValorAtributo = @IDValorAtributo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
