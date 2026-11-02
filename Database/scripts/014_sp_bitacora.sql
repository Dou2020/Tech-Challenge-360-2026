/*
    014_sp_bitacora.sql
    Stored procedures de bitácora, configuración y sistema.

    Errores: 50001 VALIDACION, 50004 NO_ENCONTRADO y 50012 USUARIO_INACTIVO (solicitante desactivado).
    La bitácora es de solo lectura desde la API; la escriben los SPs de cada módulo.

    Sin objetos pendientes en este archivo.
    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Bitácora
   ========================================================= */

-- GET /api/bitacora: lista paginada (Admin), con el nombre y el correo del usuario que hizo el cambio.
--   @Modulo, @Entidad, @Accion  coincidencia exacta (CI_AI)
--   @IDRegistro, @IDUsuario     el ID del registro modificado y el del usuario que lo modificó
--   @Desde, @Hasta              UTC, ambos inclusivos; @Desde > @Hasta → 50001
--   @Orden                      fecha | modulo | entidad | accion, con :asc o :desc
--                               (por defecto fecha:desc; desempata por IDBitacora en el mismo sentido)
-- Los filtros van contra las columnas de Bitacora con sus índices; no se copia la tabla.
-- ValorAnterior y ValorNuevo son JSON (NVARCHAR(MAX)) o NULL.
CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_Listar
    @Modulo       NVARCHAR(50)  = NULL,
    @Entidad      NVARCHAR(50)  = NULL,
    @IDRegistro   INT           = NULL,
    @IDUsuario    INT           = NULL,
    @Accion       NVARCHAR(20)  = NULL,
    @Desde        DATETIME2(3)  = NULL,
    @Hasta        DATETIME2(3)  = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Mensaje NVARCHAR(2048);

    SET @Modulo  = NULLIF(TRIM(@Modulo), N'');
    SET @Entidad = NULLIF(TRIM(@Entidad), N'');
    SET @Accion  = NULLIF(TRIM(@Accion), N'');
    SET @Orden   = ISNULL(NULLIF(TRIM(@Orden), N''), N'fecha:desc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'fecha:asc', N'fecha:desc', N'modulo:asc', N'modulo:desc',
                      N'entidad:asc', N'entidad:desc', N'accion:asc', N'accion:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa fecha, modulo, entidad o accion con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    IF @Desde IS NOT NULL AND @Hasta IS NOT NULL AND @Desde > @Hasta
        THROW 50001, N'La fecha inicial no puede ser posterior a la final.', 1;

    SELECT
        b.IDBitacora,
        b.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario,
        u.Correo                           AS CorreoUsuario,
        b.Modulo,
        b.Entidad,
        b.IDRegistro,
        b.Accion,
        b.ValorAnterior,
        b.ValorNuevo,
        b.Fecha
    FROM dbo.Bitacora AS b
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = b.IDUsuario
    WHERE (@Modulo     IS NULL OR b.Modulo     = @Modulo)
      AND (@Entidad    IS NULL OR b.Entidad    = @Entidad)
      AND (@IDRegistro IS NULL OR b.IDRegistro = @IDRegistro)
      AND (@IDUsuario  IS NULL OR b.IDUsuario  = @IDUsuario)
      AND (@Accion     IS NULL OR b.Accion     = @Accion)
      AND (@Desde      IS NULL OR b.Fecha     >= @Desde)
      AND (@Hasta      IS NULL OR b.Fecha     <= @Hasta)
    ORDER BY
        CASE WHEN @Orden = N'fecha:asc'    THEN b.Fecha      END ASC,
        CASE WHEN @Orden = N'fecha:desc'   THEN b.Fecha      END DESC,
        CASE WHEN @Orden = N'modulo:asc'   THEN b.Modulo     END ASC,
        CASE WHEN @Orden = N'modulo:desc'  THEN b.Modulo     END DESC,
        CASE WHEN @Orden = N'entidad:asc'  THEN b.Entidad    END ASC,
        CASE WHEN @Orden = N'entidad:desc' THEN b.Entidad    END DESC,
        CASE WHEN @Orden = N'accion:asc'   THEN b.Accion     END ASC,
        CASE WHEN @Orden = N'accion:desc'  THEN b.Accion     END DESC,
        CASE WHEN @Orden LIKE N'%:desc'    THEN b.IDBitacora END DESC,
        b.IDBitacora ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);

    SELECT COUNT_BIG(*) AS Total
    FROM dbo.Bitacora AS b
    WHERE (@Modulo     IS NULL OR b.Modulo     = @Modulo)
      AND (@Entidad    IS NULL OR b.Entidad    = @Entidad)
      AND (@IDRegistro IS NULL OR b.IDRegistro = @IDRegistro)
      AND (@IDUsuario  IS NULL OR b.IDUsuario  = @IDUsuario)
      AND (@Accion     IS NULL OR b.Accion     = @Accion)
      AND (@Desde      IS NULL OR b.Fecha     >= @Desde)
      AND (@Hasta      IS NULL OR b.Fecha     <= @Hasta)
    OPTION (RECOMPILE);
END;
GO

-- GET /api/bitacora/modulos: módulos que ya tienen registros, en orden alfabético (filtro del
-- frontend). Un resultado: Modulo NVARCHAR(50).
CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_ListarModulos
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT Modulo
    FROM dbo.Bitacora
    ORDER BY Modulo;
END;
GO

/* =========================================================
   Configuración
   ========================================================= */

-- GET /api/configuracion: todos los parámetros, ordenados por clave.
CREATE OR ALTER PROCEDURE dbo.SP_Configuracion_Listar
AS
BEGIN
    SET NOCOUNT ON;

    SELECT IDConfiguracion, Clave, Valor, Descripcion
    FROM dbo.Configuracion
    ORDER BY Clave;
END;
GO

-- PUT /api/configuracion/:clave: cambia el valor de un parámetro. Valida según la clave:
--   MinutosReserva          entero de 1 a 120
--   HorasCarritoAbandonado  entero de 1 a 720
--   PorcentajeIVA           decimal de 0 a 100 con hasta 2 decimales (se guarda como 12.00)
--   UmbralBajoStock         entero mayor o igual a 0
--   otra clave existente    cualquier texto no vacío
-- Solo dígitos (y un punto en el IVA): sin signos, comas, espacios internos ni notación
-- científica. Los enteros se guardan normalizados (007 → 7). Clave inexistente → 50004;
-- valor inválido → 50001. Si el valor no cambia no escribe ni registra bitácora.
-- Bitácora: MODIFICAR, Modulo 'Configuracion', Entidad 'Configuracion', IDRegistro = IDConfiguracion;
-- ValorAnterior y ValorNuevo son {"Clave", "Valor"}.
-- Resultado: la fila de la clave (mismas columnas que SP_Configuracion_Listar).
CREATE OR ALTER PROCEDURE dbo.SP_Configuracion_Actualizar
    @IDUsuarioSolicitante INT,
    @Clave                NVARCHAR(50),
    @Valor                NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDConfiguracion INT;
    DECLARE @ClaveReal NVARCHAR(50);
    DECLARE @ValorActual NVARCHAR(200);
    DECLARE @Entero INT;
    DECLARE @Decimal DECIMAL(12,2);
    DECLARE @Anterior NVARCHAR(MAX);
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Clave = NULLIF(TRIM(@Clave), N'');
    SET @Valor = NULLIF(TRIM(@Valor), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar la clave y el valor
        IF @Clave IS NULL
            THROW 50001, N'La clave es obligatoria.', 1;

        IF @Valor IS NULL
            THROW 50001, N'El valor es obligatorio.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear el parámetro
        SELECT @IDConfiguracion = IDConfiguracion, @ClaveReal = Clave, @ValorActual = Valor
        FROM dbo.Configuracion WITH (UPDLOCK, ROWLOCK)
        WHERE Clave = @Clave;

        IF @IDConfiguracion IS NULL
            THROW 50004, N'El parámetro de configuración no existe.', 1;

        IF @ClaveReal IN (N'MinutosReserva', N'HorasCarritoAbandonado', N'UmbralBajoStock')
        BEGIN
            IF @Valor LIKE N'%[^0-9]%' OR LEN(@Valor) > 9
                THROW 50001, N'El valor debe ser un número entero sin signo.', 1;

            SET @Entero = CONVERT(INT, @Valor);

            IF @ClaveReal = N'MinutosReserva' AND @Entero NOT BETWEEN 1 AND 120
                THROW 50001, N'MinutosReserva debe estar entre 1 y 120.', 1;

            IF @ClaveReal = N'HorasCarritoAbandonado' AND @Entero NOT BETWEEN 1 AND 720
                THROW 50001, N'HorasCarritoAbandonado debe estar entre 1 y 720.', 1;

            SET @Valor = CONVERT(NVARCHAR(200), @Entero);
        END
        ELSE IF @ClaveReal = N'PorcentajeIVA'
        BEGIN
            -- Solo dígitos y un punto, con dígitos a ambos lados (o sin parte decimal), hasta 2 decimales
            IF @Valor LIKE N'%[^0-9.]%'
               OR LEN(@Valor) - LEN(REPLACE(@Valor, N'.', N'')) > 1
               OR LEFT(@Valor, 1) = N'.' OR RIGHT(@Valor, 1) = N'.'
               OR LEN(@Valor) > 9
               OR (CHARINDEX(N'.', @Valor) > 0 AND LEN(@Valor) - CHARINDEX(N'.', @Valor) > 2)
                THROW 50001, N'PorcentajeIVA debe ser un número decimal entre 0 y 100 con hasta 2 decimales.', 1;

            SET @Decimal = TRY_CONVERT(DECIMAL(12,2), @Valor);

            IF @Decimal IS NULL OR @Decimal NOT BETWEEN 0 AND 100
                THROW 50001, N'PorcentajeIVA debe ser un número decimal entre 0 y 100 con hasta 2 decimales.', 1;

            SET @Valor = CONVERT(NVARCHAR(200), @Decimal);
        END;

        -- 3. Escribir y 4. Bitácora (solo si cambia)
        IF @Valor COLLATE Latin1_General_BIN2 <> @ValorActual COLLATE Latin1_General_BIN2
        BEGIN
            SELECT @Anterior = (SELECT @ClaveReal AS Clave, @ValorActual AS Valor
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            UPDATE dbo.Configuracion
            SET Valor = @Valor
            WHERE IDConfiguracion = @IDConfiguracion;

            SELECT @Nuevo = (SELECT @ClaveReal AS Clave, @Valor AS Valor
                             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Configuracion', N'Configuracion', @IDConfiguracion,
                    N'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT IDConfiguracion, Clave, Valor, Descripcion
        FROM dbo.Configuracion
        WHERE IDConfiguracion = @IDConfiguracion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Sistema
   ========================================================= */

-- GET /api/health: comprueba que la base responde con el login de la aplicación.
CREATE OR ALTER PROCEDURE dbo.SP_Sistema_VerificarConexion
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        DB_NAME()        AS BaseDatos,
        SYSUTCDATETIME() AS FechaServidor;
END;
GO
