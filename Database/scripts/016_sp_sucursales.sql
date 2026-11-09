/*
    016_sp_sucursales.sql
    Stored procedures de las sucursales de retiro: catálogo público (SP_Catalogo_ListarSucursales) y
    gestión del administrador (SP_Sucursales_*).

    Una sucursal es el destino de un pedido con un método de envío que requiere sucursal
    (MetodoEnvio.RequiereSucursal = 1, "Recoger en sucursal"). El pedido guarda IDSucursal y una copia
    textual de su dirección en DireccionEntrega (SP_Checkout_ResolverEntrega, 012_sp_pedidos.sql), así que
    editar o desactivar una sucursal no altera pedidos ya hechos.

    Reglas:
      * El catálogo público solo muestra sucursales activas. Una inactiva no se ofrece en el checkout.
      * Los SPs que escriben reciben @IDUsuarioSolicitante (sale del JWT; el backend exige el rol
        Administrador, igual que con las categorías), validan antes de escribir, bloquean la sucursal con
        UPDLOCK, ROWLOCK y registran la Bitacora (Modulo 'Sucursales', Entidad 'Sucursal') en la misma
        transacción.
      * Un nombre repetido no tiene THROW propio: termina en 2627 (UQ_Sucursal_Nombre) → DUPLICADO,
        como el nombre de categoría.
      * Una sucursal con pedidos no se elimina (50051); se desactiva. Los pedidos nuevos no pueden
        crearse contra una sucursal que se está eliminando porque CrearPedido solo lee Sucursal sin
        bloquearla: la FK FK_Pedido_Sucursal rechazaría el INSERT (el pedido se revertiría completo).
      * Orden de bloqueo: Sucursal (única tabla que bloquea). No toca variantes ni reservas.

    Listado: @Pagina (desde 1), @TamanoPagina (1 a 100) y @Orden 'campo:asc|desc' sobre una lista blanca
    con CASE (nunca concatenado). Devuelve las filas y luego un result set con Total.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (SP_Usuarios_ValidarSolicitante)
      50051  EN_USO
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

-- GET /api/catalogo/sucursales (público, sin solicitante): sucursales activas ordenadas por nombre.
-- Fila: IDSucursal INT, Nombre NVARCHAR(100), Telefono NVARCHAR(20), Linea1 NVARCHAR(200),
-- Linea2 NVARCHAR(200) NULL, Municipio NVARCHAR(100), Departamento NVARCHAR(100), CodigoPostal NVARCHAR(10) NULL,
-- Horario NVARCHAR(200) NULL.
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarSucursales
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        IDSucursal,
        Nombre,
        Telefono,
        Linea1,
        Linea2,
        Municipio,
        Departamento,
        CodigoPostal,
        Horario
    FROM dbo.Sucursal
    WHERE Activo = 1
    ORDER BY Nombre, IDSucursal;
END;
GO

-- GET /api/sucursales: lista paginada, incluye inactivas.
--   @Q       busca en nombre, municipio y departamento (comodines de LIKE escapados)
--   @Activo  filtra por estado
--   @Orden   nombre | municipio | departamento | activo | cantidadPedidos, con :asc o :desc. Default nombre:asc.
-- Result sets: 1. filas de la página; 2. Total INT.
-- Fila: IDSucursal INT, Nombre, Telefono, Linea1, Linea2 NULL, Municipio, Departamento, CodigoPostal NULL,
-- Horario NULL, Activo BIT, CantidadPedidos INT, FechaCreacion DATETIME2(3), FechaModificacion DATETIME2(3) (UTC).
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_Listar
    @IDUsuarioSolicitante INT,
    @Q                    NVARCHAR(100) = NULL,
    @Activo               BIT           = NULL,
    @Pagina               INT           = 1,
    @TamanoPagina         INT           = 20,
    @Orden                NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'nombre:asc');

    EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'nombre:asc', N'nombre:desc', N'municipio:asc', N'municipio:desc',
                      N'departamento:asc', N'departamento:desc', N'activo:asc', N'activo:desc',
                      N'cantidadPedidos:asc', N'cantidadPedidos:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa nombre, municipio, departamento, activo o cantidadPedidos con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Q);

    DECLARE @Fila TABLE (
        IDSucursal        INT           NOT NULL PRIMARY KEY,
        Nombre            NVARCHAR(100) NOT NULL,
        Telefono          NVARCHAR(20)  NOT NULL,
        Linea1            NVARCHAR(200) NOT NULL,
        Linea2            NVARCHAR(200) NULL,
        Municipio         NVARCHAR(100) NOT NULL,
        Departamento      NVARCHAR(100) NOT NULL,
        CodigoPostal      NVARCHAR(10)  NULL,
        Horario           NVARCHAR(200) NULL,
        Activo            BIT           NOT NULL,
        CantidadPedidos   INT           NOT NULL,
        FechaCreacion     DATETIME2(3)  NOT NULL,
        FechaModificacion DATETIME2(3)  NOT NULL
    );

    INSERT INTO @Fila (IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario,
                       Activo, CantidadPedidos, FechaCreacion, FechaModificacion)
    SELECT
        s.IDSucursal, s.Nombre, s.Telefono, s.Linea1, s.Linea2, s.Municipio, s.Departamento, s.CodigoPostal,
        s.Horario, s.Activo,
        (SELECT COUNT(*) FROM dbo.Pedido AS p WHERE p.IDSucursal = s.IDSucursal),
        s.FechaCreacion, s.FechaModificacion
    FROM dbo.Sucursal AS s
    WHERE (@Activo IS NULL OR s.Activo = @Activo)
      AND (@Patron IS NULL OR s.Nombre LIKE @Patron OR s.Municipio LIKE @Patron OR s.Departamento LIKE @Patron)
    OPTION (RECOMPILE);

    SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario, Activo,
           CantidadPedidos, FechaCreacion, FechaModificacion
    FROM @Fila
    ORDER BY
        CASE WHEN @Orden = N'nombre:asc'            THEN Nombre          END ASC,
        CASE WHEN @Orden = N'nombre:desc'           THEN Nombre          END DESC,
        CASE WHEN @Orden = N'municipio:asc'         THEN Municipio       END ASC,
        CASE WHEN @Orden = N'municipio:desc'        THEN Municipio       END DESC,
        CASE WHEN @Orden = N'departamento:asc'      THEN Departamento    END ASC,
        CASE WHEN @Orden = N'departamento:desc'     THEN Departamento    END DESC,
        CASE WHEN @Orden = N'activo:asc'            THEN Activo          END ASC,
        CASE WHEN @Orden = N'activo:desc'           THEN Activo          END DESC,
        CASE WHEN @Orden = N'cantidadPedidos:asc'   THEN CantidadPedidos END ASC,
        CASE WHEN @Orden = N'cantidadPedidos:desc'  THEN CantidadPedidos END DESC,
        Nombre ASC,
        IDSucursal ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/sucursales/:id. También es el resultado de los SPs que crean o modifican sucursales.
-- Una fila con las columnas de SP_Sucursales_Listar. Inexistente → 50004.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_ObtenerPorId
    @IDSucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Sucursal WHERE IDSucursal = @IDSucursal)
        THROW 50004, N'La sucursal no existe.', 1;

    SELECT
        s.IDSucursal,
        s.Nombre,
        s.Telefono,
        s.Linea1,
        s.Linea2,
        s.Municipio,
        s.Departamento,
        s.CodigoPostal,
        s.Horario,
        s.Activo,
        (SELECT COUNT(*) FROM dbo.Pedido AS p WHERE p.IDSucursal = s.IDSucursal) AS CantidadPedidos,
        s.FechaCreacion,
        s.FechaModificacion
    FROM dbo.Sucursal AS s
    WHERE s.IDSucursal = @IDSucursal;
END;
GO

-- POST /api/sucursales: nombre, teléfono, línea 1, municipio y departamento son obligatorios (50001).
-- Nombre repetido → 2627 (UQ_Sucursal_Nombre) → DUPLICADO. La sucursal nace activa. Devuelve el detalle.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_Crear
    @IDUsuarioSolicitante INT,
    @Nombre               NVARCHAR(100),
    @Telefono             NVARCHAR(20),
    @Linea1               NVARCHAR(200),
    @Linea2               NVARCHAR(200) = NULL,
    @Municipio            NVARCHAR(100),
    @Departamento         NVARCHAR(100),
    @CodigoPostal         NVARCHAR(10)  = NULL,
    @Horario              NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDSucursal INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Nombre = NULLIF(TRIM(@Nombre), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');
    SET @Linea1 = NULLIF(TRIM(@Linea1), N'');
    SET @Linea2 = NULLIF(TRIM(@Linea2), N'');
    SET @Municipio = NULLIF(TRIM(@Municipio), N'');
    SET @Departamento = NULLIF(TRIM(@Departamento), N'');
    SET @CodigoPostal = NULLIF(TRIM(@CodigoPostal), N'');
    SET @Horario = NULLIF(TRIM(@Horario), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL
            THROW 50001, N'El nombre de la sucursal es obligatorio.', 1;

        IF @Telefono IS NULL
            THROW 50001, N'El teléfono de la sucursal es obligatorio.', 1;

        IF @Linea1 IS NULL
            THROW 50001, N'La dirección de la sucursal es obligatoria.', 1;

        IF @Municipio IS NULL
            THROW 50001, N'El municipio de la sucursal es obligatorio.', 1;

        IF @Departamento IS NULL
            THROW 50001, N'El departamento de la sucursal es obligatorio.', 1;

        -- 3. Escribir. Nombre repetido → 2627 → DUPLICADO.
        INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario, Activo)
        VALUES (@Nombre, @Telefono, @Linea1, @Linea2, @Municipio, @Departamento, @CodigoPostal, @Horario, 1);

        SET @IDSucursal = SCOPE_IDENTITY();

        -- 4. Bitácora
        SET @Nuevo = (SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal,
                             Horario, Activo
                      FROM dbo.Sucursal WHERE IDSucursal = @IDSucursal
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Sucursales', N'Sucursal', @IDSucursal, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Sucursales_ObtenerPorId @IDSucursal = @IDSucursal;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/sucursales/:id: reemplaza todos los campos editables (NULL borra Linea2, CodigoPostal y Horario).
-- No cambia el estado (ver CambiarEstado). Inexistente → 50004; nombre repetido → 2627 → DUPLICADO.
-- Devuelve el detalle.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_Actualizar
    @IDUsuarioSolicitante INT,
    @IDSucursal           INT,
    @Nombre               NVARCHAR(100),
    @Telefono             NVARCHAR(20),
    @Linea1               NVARCHAR(200),
    @Linea2               NVARCHAR(200) = NULL,
    @Municipio            NVARCHAR(100),
    @Departamento         NVARCHAR(100),
    @CodigoPostal         NVARCHAR(10)  = NULL,
    @Horario              NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    SET @Nombre = NULLIF(TRIM(@Nombre), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');
    SET @Linea1 = NULLIF(TRIM(@Linea1), N'');
    SET @Linea2 = NULLIF(TRIM(@Linea2), N'');
    SET @Municipio = NULLIF(TRIM(@Municipio), N'');
    SET @Departamento = NULLIF(TRIM(@Departamento), N'');
    SET @CodigoPostal = NULLIF(TRIM(@CodigoPostal), N'');
    SET @Horario = NULLIF(TRIM(@Horario), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL
            THROW 50001, N'El nombre de la sucursal es obligatorio.', 1;

        IF @Telefono IS NULL
            THROW 50001, N'El teléfono de la sucursal es obligatorio.', 1;

        IF @Linea1 IS NULL
            THROW 50001, N'La dirección de la sucursal es obligatoria.', 1;

        IF @Municipio IS NULL
            THROW 50001, N'El municipio de la sucursal es obligatorio.', 1;

        IF @Departamento IS NULL
            THROW 50001, N'El departamento de la sucursal es obligatorio.', 1;

        -- 2. Bloquear y leer el valor anterior
        SET @Anterior = (SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal,
                                Horario, Activo
                         FROM dbo.Sucursal WITH (UPDLOCK, ROWLOCK)
                         WHERE IDSucursal = @IDSucursal
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior IS NULL
            THROW 50004, N'La sucursal no existe.', 1;

        -- 3. Escribir. Nombre repetido → 2627 → DUPLICADO.
        UPDATE dbo.Sucursal
        SET Nombre = @Nombre,
            Telefono = @Telefono,
            Linea1 = @Linea1,
            Linea2 = @Linea2,
            Municipio = @Municipio,
            Departamento = @Departamento,
            CodigoPostal = @CodigoPostal,
            Horario = @Horario,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDSucursal = @IDSucursal;

        -- 4. Bitácora
        SET @Nuevo = (SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal,
                             Horario, Activo
                      FROM dbo.Sucursal WHERE IDSucursal = @IDSucursal
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Sucursales', N'Sucursal', @IDSucursal, N'MODIFICAR', @Anterior, @Nuevo);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Sucursales_ObtenerPorId @IDSucursal = @IDSucursal;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/sucursales/:id/estado. Desactivar la quita del checkout sin tocar los pedidos ya hechos.
-- Si ya está en ese estado no escribe ni registra nada. @Activo NULL → 50001; inexistente → 50004.
-- Devuelve el detalle.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDSucursal           INT,
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
        FROM dbo.Sucursal WITH (UPDLOCK, ROWLOCK)
        WHERE IDSucursal = @IDSucursal;

        IF @ActivoActual IS NULL
            THROW 50004, N'La sucursal no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SET @Anterior = (SELECT IDSucursal, Nombre, Activo FROM dbo.Sucursal
                             WHERE IDSucursal = @IDSucursal
                             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            UPDATE dbo.Sucursal
            SET Activo = @Activo,
                FechaModificacion = SYSUTCDATETIME()
            WHERE IDSucursal = @IDSucursal;

            SET @Nuevo = (SELECT IDSucursal, Nombre, Activo FROM dbo.Sucursal
                          WHERE IDSucursal = @IDSucursal
                          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Sucursales', N'Sucursal', @IDSucursal,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Sucursales_ObtenerPorId @IDSucursal = @IDSucursal;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/sucursales/:id: borrado físico, solo si ningún pedido la usó → 50051 (desactívala en su lugar).
-- La sucursal queda bloqueada con UPDLOCK. La comprobación lee con READCOMMITTEDLOCK: con
-- READ_COMMITTED_SNAPSHOT una lectura normal no vería un pedido insertado por otra transacción aún sin
-- confirmar. No devuelve result set.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_Eliminar
    @IDUsuarioSolicitante INT,
    @IDSucursal           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SET @Anterior = (SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal,
                                Horario, Activo
                         FROM dbo.Sucursal WITH (UPDLOCK, ROWLOCK)
                         WHERE IDSucursal = @IDSucursal
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior IS NULL
            THROW 50004, N'La sucursal no existe.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Pedido WITH (READCOMMITTEDLOCK) WHERE IDSucursal = @IDSucursal)
            THROW 50051, N'La sucursal tiene pedidos y no puede eliminarse; desactívala.', 1;

        DELETE FROM dbo.Sucursal WHERE IDSucursal = @IDSucursal;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Sucursales', N'Sucursal', @IDSucursal, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
