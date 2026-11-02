/*
    011_sp_cupones.sql
    Stored procedures de gestión de cupones (Administrador).

    Los SPs que escriben reciben @IDUsuarioSolicitante (sale del JWT), validan antes de escribir,
    bloquean con UPDLOCK, ROWLOCK y registran la Bitacora (Modulo 'Cupones', Entidad 'Cupon') en
    la misma transacción, con la foto de FU_Cupones_CuponJson en ValorAnterior / ValorNuevo.

    Reglas que se validan con 50001 antes de llegar a los CHECK de Cupon:
      - Codigo obligatorio, hasta 30 caracteres, solo letras A-Z, dígitos, '-' y '_'; se guarda en
        mayúsculas. Repetido → 2627 (UQ_Cupon_Codigo) → DUPLICADO.
      - TipoDescuento PORCENTAJE (Valor > 0 y <= 100) o MONTO_FIJO (Valor > 0).
      - MontoMinimo >= 0 (NULL = 0).
      - FechaFin > FechaInicio (instantes UTC). Se permite crear un cupón ya vencido o futuro.
      - LimiteUsosTotal > 0; LimiteUsosPorCliente entre 1 y LimiteUsosTotal.
      - Actualizar no puede bajar LimiteUsosTotal por debajo de UsosActuales.
    La categoría (opcional) debe existir → 50004; puede estar inactiva (sus productos no se ven,
    así que el cupón no aplicará mientras lo esté).

    UsosActuales no se edita aquí: lo mantienen SP_Pedidos_CrearPedido (+1) y SP_Pedidos_Cancelar (-1).

    Orden de bloqueo: Categoria → Cupon. Crear y Actualizar bloquean la categoría del cupón con
    UPDLOCK, igual que SP_Categorias_Eliminar, que comprueba los cupones con READCOMMITTEDLOCK:
    un cupón no puede quedar en una categoría que se está eliminando.

    Listados: @Pagina (desde 1), @TamanoPagina (1 a 100) y @Orden 'campo:asc|desc', elegido con
    CASE sobre una lista blanca (nunca concatenado). Devuelven las filas y luego Total.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (solicitante desactivado, SP_Usuarios_ValidarSolicitante)
      50051  EN_USO (eliminar un cupón que algún pedido o carrito tiene)
      2627   DUPLICADO (UQ_Cupon_Codigo; sin número de THROW propio)
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Uso interno
   ========================================================= */

-- Sin endpoint: valida los datos de un cupón para SP_Cupones_Crear y SP_Cupones_Actualizar.
-- Recibe los valores ya normalizados; lanza 50001 con el primer dato inválido.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ValidarDatos
    @Codigo               NVARCHAR(100),
    @TipoDescuento        NVARCHAR(20),
    @Valor                DECIMAL(12,2),
    @MontoMinimo          DECIMAL(12,2),
    @FechaInicio          DATETIME2(3),
    @FechaFin             DATETIME2(3),
    @LimiteUsosTotal      INT,
    @LimiteUsosPorCliente INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @Codigo IS NULL
        THROW 50001, N'El código del cupón es obligatorio.', 1;

    IF LEN(@Codigo) > 30
        THROW 50001, N'El código del cupón admite hasta 30 caracteres.', 1;

    -- Collation binaria: la de la base (CI_AI) haría que [A-Z] aceptara letras con tilde o Ñ.
    IF @Codigo COLLATE Latin1_General_BIN2 LIKE N'%[^-A-Z0-9_]%'
        THROW 50001, N'El código del cupón solo admite letras sin tilde, números, guion y guion bajo.', 1;

    IF @TipoDescuento IS NULL OR @TipoDescuento NOT IN (N'PORCENTAJE', N'MONTO_FIJO')
        THROW 50001, N'El tipo de descuento debe ser PORCENTAJE o MONTO_FIJO.', 1;

    IF @Valor IS NULL OR @Valor <= 0
        THROW 50001, N'El valor del descuento debe ser mayor que 0.', 1;

    IF @TipoDescuento = N'PORCENTAJE' AND @Valor > 100
        THROW 50001, N'Un descuento por porcentaje no puede ser mayor que 100.', 1;

    IF @MontoMinimo < 0
        THROW 50001, N'El monto mínimo no puede ser negativo.', 1;

    IF @FechaInicio IS NULL OR @FechaFin IS NULL
        THROW 50001, N'Las fechas de inicio y fin son obligatorias.', 1;

    IF @FechaFin <= @FechaInicio
        THROW 50001, N'La fecha de fin debe ser posterior a la fecha de inicio.', 1;

    IF @LimiteUsosTotal IS NULL OR @LimiteUsosTotal <= 0
        THROW 50001, N'El límite total de usos debe ser mayor que 0.', 1;

    IF @LimiteUsosPorCliente IS NULL OR @LimiteUsosPorCliente < 1
        THROW 50001, N'El límite de usos por cliente debe ser al menos 1.', 1;

    IF @LimiteUsosPorCliente > @LimiteUsosTotal
        THROW 50001, N'El límite de usos por cliente no puede ser mayor que el límite total.', 1;
END;
GO

/* =========================================================
   Consultas
   ========================================================= */

-- GET /api/cupones: lista paginada.
--   @Texto    busca en el código
--   @Activo   1 / 0 / NULL (todos)
--   @Vigente  1: FechaInicio <= ahora <= FechaFin; 0: fuera de vigencia (futuro o vencido);
--             NULL: todos. No mira Activo ni los usos.
--   @Orden    codigo | fechaInicio | fechaFin | usosActuales | valor, con :asc o :desc.
--             Default codigo:asc.
-- Mismas columnas que SP_Cupones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Listar
    @Texto        NVARCHAR(100) = NULL,
    @Activo       BIT           = NULL,
    @Vigente      BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'codigo:asc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'codigo:asc', N'codigo:desc', N'fechaInicio:asc', N'fechaInicio:desc',
                      N'fechaFin:asc', N'fechaFin:desc', N'usosActuales:asc', N'usosActuales:desc',
                      N'valor:asc', N'valor:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa codigo, fechaInicio, fechaFin, usosActuales o valor con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDCupon      INT           NOT NULL PRIMARY KEY,
        Codigo       NVARCHAR(30)  NOT NULL,
        FechaInicio  DATETIME2(3)  NOT NULL,
        FechaFin     DATETIME2(3)  NOT NULL,
        UsosActuales INT           NOT NULL,
        Valor        DECIMAL(12,2) NOT NULL
    );

    INSERT INTO @Fila (IDCupon, Codigo, FechaInicio, FechaFin, UsosActuales, Valor)
    SELECT cu.IDCupon, cu.Codigo, cu.FechaInicio, cu.FechaFin, cu.UsosActuales, cu.Valor
    FROM dbo.Cupon AS cu
    WHERE (@Activo IS NULL OR cu.Activo = @Activo)
      AND (@Vigente IS NULL
           OR (@Vigente = 1 AND cu.FechaInicio <= @Ahora AND cu.FechaFin >= @Ahora)
           OR (@Vigente = 0 AND (cu.FechaInicio > @Ahora OR cu.FechaFin < @Ahora)))
      AND (@Patron IS NULL OR cu.Codigo LIKE @Patron)
    OPTION (RECOMPILE);

    SELECT
        cu.IDCupon,
        cu.Codigo,
        cu.Descripcion,
        cu.TipoDescuento,
        cu.Valor,
        cu.IDCategoria,
        cat.Nombre AS Categoria,
        cu.MontoMinimo,
        cu.FechaInicio,
        cu.FechaFin,
        cu.LimiteUsosTotal,
        cu.LimiteUsosPorCliente,
        cu.UsosActuales,
        cu.LimiteUsosTotal - cu.UsosActuales AS UsosDisponibles,
        cu.Activo,
        CONVERT(BIT, CASE WHEN cu.FechaInicio <= @Ahora AND cu.FechaFin >= @Ahora THEN 1 ELSE 0 END) AS Vigente,
        CONVERT(BIT, CASE WHEN cu.UsosActuales >= cu.LimiteUsosTotal THEN 1 ELSE 0 END) AS Agotado,
        n.CantidadPedidos,
        n.CantidadCarritos,
        CONVERT(BIT, CASE WHEN n.CantidadPedidos = 0 AND n.CantidadCarritos = 0 THEN 1 ELSE 0 END) AS PuedeEliminarse
    FROM @Fila AS f
    INNER JOIN dbo.Cupon AS cu ON cu.IDCupon = f.IDCupon
    LEFT JOIN dbo.Categoria AS cat ON cat.IDCategoria = cu.IDCategoria
    CROSS APPLY (
        SELECT
            (SELECT COUNT(*) FROM dbo.Pedido AS p WHERE p.IDCupon = cu.IDCupon)   AS CantidadPedidos,
            (SELECT COUNT(*) FROM dbo.Carrito AS c WHERE c.IDCupon = cu.IDCupon)  AS CantidadCarritos
    ) AS n
    ORDER BY
        CASE WHEN @Orden = N'codigo:asc'        THEN f.Codigo       END ASC,
        CASE WHEN @Orden = N'codigo:desc'       THEN f.Codigo       END DESC,
        CASE WHEN @Orden = N'fechaInicio:asc'   THEN f.FechaInicio  END ASC,
        CASE WHEN @Orden = N'fechaInicio:desc'  THEN f.FechaInicio  END DESC,
        CASE WHEN @Orden = N'fechaFin:asc'      THEN f.FechaFin     END ASC,
        CASE WHEN @Orden = N'fechaFin:desc'     THEN f.FechaFin     END DESC,
        CASE WHEN @Orden = N'usosActuales:asc'  THEN f.UsosActuales END ASC,
        CASE WHEN @Orden = N'usosActuales:desc' THEN f.UsosActuales END DESC,
        CASE WHEN @Orden = N'valor:asc'         THEN f.Valor        END ASC,
        CASE WHEN @Orden = N'valor:desc'        THEN f.Valor        END DESC,
        f.IDCupon ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/cupones/:id. También es el resultado de los SPs que crean o modifican cupones.
--   UsosActuales     usos que cuentan contra el límite (pedidos no cancelados)
--   CantidadPedidos  pedidos con el cupón, incluidos los cancelados
--   CantidadCarritos carritos (en cualquier estado) que lo tienen aplicado
--   PuedeEliminarse  1 si las dos cantidades son 0 (SP_Cupones_Eliminar)
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ObtenerPorId
    @IDCupon INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();

    IF NOT EXISTS (SELECT 1 FROM dbo.Cupon WHERE IDCupon = @IDCupon)
        THROW 50004, N'El cupón no existe.', 1;

    SELECT
        cu.IDCupon,
        cu.Codigo,
        cu.Descripcion,
        cu.TipoDescuento,
        cu.Valor,
        cu.IDCategoria,
        cat.Nombre AS Categoria,
        cu.MontoMinimo,
        cu.FechaInicio,
        cu.FechaFin,
        cu.LimiteUsosTotal,
        cu.LimiteUsosPorCliente,
        cu.UsosActuales,
        cu.LimiteUsosTotal - cu.UsosActuales AS UsosDisponibles,
        cu.Activo,
        CONVERT(BIT, CASE WHEN cu.FechaInicio <= @Ahora AND cu.FechaFin >= @Ahora THEN 1 ELSE 0 END) AS Vigente,
        CONVERT(BIT, CASE WHEN cu.UsosActuales >= cu.LimiteUsosTotal THEN 1 ELSE 0 END) AS Agotado,
        n.CantidadPedidos,
        n.CantidadCarritos,
        CONVERT(BIT, CASE WHEN n.CantidadPedidos = 0 AND n.CantidadCarritos = 0 THEN 1 ELSE 0 END) AS PuedeEliminarse
    FROM dbo.Cupon AS cu
    LEFT JOIN dbo.Categoria AS cat ON cat.IDCategoria = cu.IDCategoria
    CROSS APPLY (
        SELECT
            (SELECT COUNT(*) FROM dbo.Pedido AS p WHERE p.IDCupon = cu.IDCupon)   AS CantidadPedidos,
            (SELECT COUNT(*) FROM dbo.Carrito AS c WHERE c.IDCupon = cu.IDCupon)  AS CantidadCarritos
    ) AS n
    WHERE cu.IDCupon = @IDCupon;
END;
GO

-- GET /api/cupones/:id/usos: usos que cuentan del cupón (UsoCupon), paginados. Al cancelar un
-- pedido se borra su uso, así que los cancelados no aparecen. Descuento es Pedido.Descuento.
--   @Orden  fecha | descuento, con :asc o :desc. Default fecha:desc.
-- Cupón inexistente → 50004.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ListarUsos
    @IDCupon      INT,
    @Pagina       INT          = 1,
    @TamanoPagina INT          = 20,
    @Orden        NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'fecha:desc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'fecha:asc', N'fecha:desc', N'descuento:asc', N'descuento:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden, N'. Usa fecha o descuento con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.Cupon WHERE IDCupon = @IDCupon)
        THROW 50004, N'El cupón no existe.', 1;

    DECLARE @Fila TABLE (
        IDUsoCupon INT           NOT NULL PRIMARY KEY,
        Fecha      DATETIME2(3)  NOT NULL,
        Descuento  DECIMAL(12,2) NOT NULL
    );

    INSERT INTO @Fila (IDUsoCupon, Fecha, Descuento)
    SELECT uc.IDUsoCupon, uc.Fecha, p.Descuento
    FROM dbo.UsoCupon AS uc
    INNER JOIN dbo.Pedido AS p ON p.IDPedido = uc.IDPedido
    INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
    WHERE uc.IDCupon = @IDCupon
      AND ep.Codigo <> N'CANCELADO';

    SELECT
        uc.IDUsoCupon,
        uc.IDPedido,
        p.NumeroPedido,
        uc.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Cliente,
        u.Correo,
        p.Descuento,
        p.Total AS TotalPedido,
        ep.Codigo AS EstadoPedido,
        uc.Fecha
    FROM @Fila AS f
    INNER JOIN dbo.UsoCupon AS uc ON uc.IDUsoCupon = f.IDUsoCupon
    INNER JOIN dbo.Pedido AS p ON p.IDPedido = uc.IDPedido
    INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = uc.IDUsuario
    ORDER BY
        CASE WHEN @Orden = N'fecha:asc'      THEN f.Fecha      END ASC,
        CASE WHEN @Orden = N'fecha:desc'     THEN f.Fecha      END DESC,
        CASE WHEN @Orden = N'descuento:asc'  THEN f.Descuento  END ASC,
        CASE WHEN @Orden = N'descuento:desc' THEN f.Descuento  END DESC,
        f.IDUsoCupon DESC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

/* =========================================================
   Escritura
   ========================================================= */

-- POST /api/cupones: crea un cupón activo con UsosActuales = 0.
--   @IDCategoria  NULL: aplica a todo el carrito
-- Código repetido → 2627 (UQ_Cupon_Codigo) → DUPLICADO. Categoría inexistente → 50004.
-- Bitácora: CREAR de Cupon. Resultado: SP_Cupones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Crear
    @IDUsuarioSolicitante INT,
    @Codigo               NVARCHAR(100),
    @Descripcion          NVARCHAR(300) = NULL,
    @TipoDescuento        NVARCHAR(20),
    @Valor                DECIMAL(12,2),
    @IDCategoria          INT           = NULL,
    @MontoMinimo          DECIMAL(12,2) = 0,
    @FechaInicio          DATETIME2(3),
    @FechaFin             DATETIME2(3),
    @LimiteUsosTotal      INT,
    @LimiteUsosPorCliente INT           = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCupon INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Codigo        = UPPER(NULLIF(TRIM(@Codigo), N''));
    SET @Descripcion   = NULLIF(TRIM(@Descripcion), N'');
    SET @TipoDescuento = UPPER(TRIM(@TipoDescuento));
    SET @MontoMinimo   = ISNULL(@MontoMinimo, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        EXEC dbo.SP_Cupones_ValidarDatos @Codigo, @TipoDescuento, @Valor, @MontoMinimo,
                                         @FechaInicio, @FechaFin, @LimiteUsosTotal, @LimiteUsosPorCliente;

        -- 2. Bloquear la categoría (carrera con SP_Categorias_Eliminar)
        IF @IDCategoria IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50004, N'La categoría no existe.', 1;

        -- 3. Escribir. Código repetido → 2627 → DUPLICADO.
        INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, IDCategoria, MontoMinimo,
                               FechaInicio, FechaFin, LimiteUsosTotal, LimiteUsosPorCliente, UsosActuales, Activo)
        VALUES (@Codigo, @Descripcion, @TipoDescuento, @Valor, @IDCategoria, @MontoMinimo,
                @FechaInicio, @FechaFin, @LimiteUsosTotal, @LimiteUsosPorCliente, 0, 1);

        SET @IDCupon = SCOPE_IDENTITY();

        -- 4. Bitácora
        SELECT @Nuevo = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Cupones', N'Cupon', @IDCupon, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Cupones_ObtenerPorId @IDCupon = @IDCupon;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/cupones/:id: reemplaza todos los datos editables (omitir Descripcion o IDCategoria
-- los borra). No cambia Activo (SP_Cupones_CambiarEstado) ni UsosActuales.
-- LimiteUsosTotal < UsosActuales → 50001. Los pedidos ya hechos conservan su descuento; los
-- carritos que lo tienen aplicado se recalculan con los datos nuevos.
-- Bitácora: MODIFICAR de Cupon (si no cambia nada, no registra). Resultado: SP_Cupones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Actualizar
    @IDUsuarioSolicitante INT,
    @IDCupon              INT,
    @Codigo               NVARCHAR(100),
    @Descripcion          NVARCHAR(300) = NULL,
    @TipoDescuento        NVARCHAR(20),
    @Valor                DECIMAL(12,2),
    @IDCategoria          INT           = NULL,
    @MontoMinimo          DECIMAL(12,2) = 0,
    @FechaInicio          DATETIME2(3),
    @FechaFin             DATETIME2(3),
    @LimiteUsosTotal      INT,
    @LimiteUsosPorCliente INT           = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @UsosActuales INT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX), @Mensaje NVARCHAR(2048);

    SET @Codigo        = UPPER(NULLIF(TRIM(@Codigo), N''));
    SET @Descripcion   = NULLIF(TRIM(@Descripcion), N'');
    SET @TipoDescuento = UPPER(TRIM(@TipoDescuento));
    SET @MontoMinimo   = ISNULL(@MontoMinimo, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        EXEC dbo.SP_Cupones_ValidarDatos @Codigo, @TipoDescuento, @Valor, @MontoMinimo,
                                         @FechaInicio, @FechaFin, @LimiteUsosTotal, @LimiteUsosPorCliente;

        -- 2. Bloquear: categoría nueva y después el cupón (orden Categoria → Cupon)
        IF @IDCategoria IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50004, N'La categoría no existe.', 1;

        SELECT @UsosActuales = UsosActuales
        FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK)
        WHERE IDCupon = @IDCupon;

        IF @UsosActuales IS NULL
            THROW 50004, N'El cupón no existe.', 1;

        IF @LimiteUsosTotal < @UsosActuales
        BEGIN
            SET @Mensaje = CONCAT(N'El límite total de usos no puede ser menor que los usos actuales (', @UsosActuales, N').');
            THROW 50001, @Mensaje, 1;
        END;

        SELECT @Anterior = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

        -- 3. Escribir. Código repetido → 2627 → DUPLICADO.
        UPDATE dbo.Cupon
        SET Codigo               = @Codigo,
            Descripcion          = @Descripcion,
            TipoDescuento        = @TipoDescuento,
            Valor                = @Valor,
            IDCategoria          = @IDCategoria,
            MontoMinimo          = @MontoMinimo,
            FechaInicio          = @FechaInicio,
            FechaFin             = @FechaFin,
            LimiteUsosTotal      = @LimiteUsosTotal,
            LimiteUsosPorCliente = @LimiteUsosPorCliente
        WHERE IDCupon = @IDCupon;

        -- 4. Bitácora, solo si algo cambió (comparación binaria: un cambio de mayúsculas cuenta)
        SELECT @Nuevo = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

        IF @Nuevo COLLATE Latin1_General_BIN2 <> @Anterior COLLATE Latin1_General_BIN2
            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Cupones', N'Cupon', @IDCupon, N'MODIFICAR', @Anterior, @Nuevo);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Cupones_ObtenerPorId @IDCupon = @IDCupon;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/cupones/:id/estado: activa o desactiva. Un cupón inactivo deja de descontar en los
-- carritos que lo tienen (CUPON_INACTIVO) y no puede aplicarse. Si ya está en ese estado no
-- escribe ni registra nada.
-- Bitácora: ACTIVAR / DESACTIVAR de Cupon. Resultado: SP_Cupones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDCupon              INT,
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
        FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK)
        WHERE IDCupon = @IDCupon;

        IF @ActivoActual IS NULL
            THROW 50004, N'El cupón no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

            UPDATE dbo.Cupon SET Activo = @Activo WHERE IDCupon = @IDCupon;

            SELECT @Nuevo = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Cupones', N'Cupon', @IDCupon,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Cupones_ObtenerPorId @IDCupon = @IDCupon;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/cupones/:id: borrado físico solo si ningún pedido (aunque esté cancelado) ni
-- carrito (en cualquier estado) lo tiene → si no, 50051 EN_USO: se debe desactivar.
-- El cupón queda bloqueado con UPDLOCK y SP_Carrito_AplicarCupon bloquea el suyo igual, así un
-- carrito no puede tomarlo entre la comprobación y el DELETE. La comprobación lee con
-- READCOMMITTEDLOCK: con READ_COMMITTED_SNAPSHOT una lectura normal no vería un pedido o carrito
-- aún sin confirmar.
-- Bitácora: ELIMINAR de Cupon con la foto en ValorAnterior. Sin result set.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Eliminar
    @IDUsuarioSolicitante INT,
    @IDCupon              INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF NOT EXISTS (SELECT 1 FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK) WHERE IDCupon = @IDCupon)
            THROW 50004, N'El cupón no existe.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Pedido WITH (READCOMMITTEDLOCK) WHERE IDCupon = @IDCupon)
            THROW 50051, N'El cupón se usó en pedidos y no puede eliminarse; desactívalo en lugar de eliminarlo.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Carrito WITH (READCOMMITTEDLOCK) WHERE IDCupon = @IDCupon)
            THROW 50051, N'El cupón está aplicado en carritos y no puede eliminarse; desactívalo en lugar de eliminarlo.', 1;

        SELECT @Anterior = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

        DELETE FROM dbo.Cupon WHERE IDCupon = @IDCupon;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Cupones', N'Cupon', @IDCupon, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
