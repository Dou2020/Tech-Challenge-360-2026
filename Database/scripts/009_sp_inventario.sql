/*
    009_sp_inventario.sql
    Stored procedures de inventario: existencias, kardex, entradas, ajustes y reservas.

    La existencia física solo cambia con un movimiento de kardex (MovimientoInventario) que
    guarda la existencia anterior y la nueva, con el Signo de su tipo: la FK compuesta exige que
    sea el del tipo y CK_MovimientoInventario_Existencias que ExistenciaNueva =
    ExistenciaAnterior + Signo * Cantidad. El SP que inserta el movimiento actualiza
    Variante.ExistenciaFisica en la misma transacción, con la variante bloqueada (UPDLOCK, ROWLOCK).
    Los tipos de movimiento se buscan por Codigo (085_datos_catalogos.sql), nunca por ID.

    Reservada vigente: solo cuentan las reservas ACTIVA no vencidas, aunque el job que las libera
    todavía no haya corrido (FU_Inventario_ExistenciaDisponible). El saldo
    Variante.ExistenciaReservada incluye las vencidas hasta que se liberan; por eso un ajuste de
    salida libera primero las vencidas de su variante.

    Orden de bloqueo: Variante → ReservaExistencia. Varias variantes se bloquean en orden de
    IDVariante.

    Bitácora: entradas y ajustes registran MODIFICAR de la Variante (Modulo 'Inventario') con la
    existencia anterior y la nueva. Liberar reservas no cambia la existencia física y no se registra.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (solicitante desactivado, SP_Usuarios_ValidarSolicitante)
      50030  STOCK_INSUFICIENTE (reservar el checkout)
      50032  EXISTENCIA_NEGATIVA
      50060–50067  motivos de rechazo del cupón al reservar (FU_Cupones_Validar)

    Reservas del checkout: Carrito → Variante → ReservaExistencia (ver 010_sp_carrito.sql). Reservar y
    liberar bloquean el carrito del cliente y después sus variantes en orden de IDVariante.
    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Consultas
   ========================================================= */

-- GET /api/inventario/tipos-movimiento: tipos para el filtro del kardex. Entradas primero.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ListarTiposMovimiento
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        IDTipoMovimientoInventario,
        Codigo,
        Nombre,
        Signo
    FROM dbo.TipoMovimientoInventario
    ORDER BY Signo DESC, Nombre;
END;
GO

-- GET /api/inventario/existencias: lista paginada por variante, incluye las inactivas.
--   @Texto       busca en el SKU y en el nombre del producto
--   @IDCategoria categoría del producto
--   @BajoStock   1: disponible <= umbral; 0: disponible > umbral; NULL: todas
--   @Activo      estado de la variante; NULL: todas
--   @Orden       sku | producto | categoria | existenciaFisica | existenciaReservada |
--                existenciaDisponible, con :asc o :desc. Default existenciaDisponible:asc
--                (lo que está por agotarse primero).
-- El umbral es Configuracion 'UmbralBajoStock' (5 en 085_datos_catalogos.sql); si falta o no es
-- un entero >= 0 se usa 5. Cada fila lleva BajoStock y el umbral usado.
-- La reservada y la disponible son las vigentes (VW_Inventario_Existencias).
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ListarExistencias
    @Texto        NVARCHAR(150) = NULL,
    @IDCategoria  INT           = NULL,
    @BajoStock    BIT           = NULL,
    @Activo       BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Umbral INT;
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'existenciaDisponible:asc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'sku:asc', N'sku:desc', N'producto:asc', N'producto:desc',
                      N'categoria:asc', N'categoria:desc',
                      N'existenciaFisica:asc', N'existenciaFisica:desc',
                      N'existenciaReservada:asc', N'existenciaReservada:desc',
                      N'existenciaDisponible:asc', N'existenciaDisponible:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa sku, producto, categoria, existenciaFisica, existenciaReservada ',
                              N'o existenciaDisponible con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Umbral = TRY_CONVERT(INT, Valor)
    FROM dbo.Configuracion
    WHERE Clave = N'UmbralBajoStock';

    IF @Umbral IS NULL OR @Umbral < 0
        SET @Umbral = 5;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDVariante           INT           NOT NULL PRIMARY KEY,
        SKU                  NVARCHAR(50)  NOT NULL,
        IDProducto           INT           NOT NULL,
        Producto             NVARCHAR(150) NOT NULL,
        IDCategoria          INT           NOT NULL,
        Categoria            NVARCHAR(100) NOT NULL,
        Descripcion          NVARCHAR(200) NULL,
        Precio               DECIMAL(12,2) NOT NULL,
        ExistenciaFisica     INT           NOT NULL,
        ExistenciaReservada  INT           NOT NULL,
        ExistenciaDisponible INT           NOT NULL,
        BajoStock            BIT           NOT NULL,
        Activo               BIT           NOT NULL,
        ProductoActivo       BIT           NOT NULL,
        CategoriaActiva      BIT           NOT NULL
    );

    INSERT INTO @Fila (IDVariante, SKU, IDProducto, Producto, IDCategoria, Categoria, Descripcion,
                       Precio, ExistenciaFisica, ExistenciaReservada, ExistenciaDisponible, BajoStock,
                       Activo, ProductoActivo, CategoriaActiva)
    SELECT
        e.IDVariante,
        e.SKU,
        e.IDProducto,
        e.Producto,
        e.IDCategoria,
        e.Categoria,
        e.Descripcion,
        e.Precio,
        e.ExistenciaFisica,
        e.ExistenciaReservada,
        e.ExistenciaDisponible,
        CONVERT(BIT, CASE WHEN e.ExistenciaDisponible <= @Umbral THEN 1 ELSE 0 END),
        e.Activo,
        e.ProductoActivo,
        e.CategoriaActiva
    FROM dbo.VW_Inventario_Existencias AS e
    WHERE (@IDCategoria IS NULL OR e.IDCategoria = @IDCategoria)
      AND (@Activo IS NULL OR e.Activo = @Activo)
      AND (@BajoStock IS NULL
           OR (@BajoStock = 1 AND e.ExistenciaDisponible <= @Umbral)
           OR (@BajoStock = 0 AND e.ExistenciaDisponible > @Umbral))
      AND (@Patron IS NULL OR e.SKU LIKE @Patron OR e.Producto LIKE @Patron)
    OPTION (RECOMPILE);

    SELECT
        IDVariante, SKU, IDProducto, Producto, IDCategoria, Categoria, Descripcion, Precio,
        ExistenciaFisica, ExistenciaReservada, ExistenciaDisponible, BajoStock,
        @Umbral AS UmbralBajoStock, Activo, ProductoActivo, CategoriaActiva
    FROM @Fila
    ORDER BY
        CASE WHEN @Orden = N'sku:asc'                   THEN SKU                  END ASC,
        CASE WHEN @Orden = N'sku:desc'                  THEN SKU                  END DESC,
        CASE WHEN @Orden = N'producto:asc'              THEN Producto             END ASC,
        CASE WHEN @Orden = N'producto:desc'             THEN Producto             END DESC,
        CASE WHEN @Orden = N'categoria:asc'             THEN Categoria            END ASC,
        CASE WHEN @Orden = N'categoria:desc'            THEN Categoria            END DESC,
        CASE WHEN @Orden = N'existenciaFisica:asc'      THEN ExistenciaFisica     END ASC,
        CASE WHEN @Orden = N'existenciaFisica:desc'     THEN ExistenciaFisica     END DESC,
        CASE WHEN @Orden = N'existenciaReservada:asc'   THEN ExistenciaReservada  END ASC,
        CASE WHEN @Orden = N'existenciaReservada:desc'  THEN ExistenciaReservada  END DESC,
        CASE WHEN @Orden = N'existenciaDisponible:asc'  THEN ExistenciaDisponible END ASC,
        CASE WHEN @Orden = N'existenciaDisponible:desc' THEN ExistenciaDisponible END DESC,
        IDVariante ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/inventario/variantes/:idVariante/kardex: movimientos de una variante, paginados.
--   @Desde, @Hasta           instantes UTC, ambos inclusive (Fecha >= @Desde AND Fecha <= @Hasta).
--                            Para "hasta el día X" el backend envía el final de ese día.
--   @CodigoTipoMovimiento    Codigo del tipo (SP_Inventario_ListarTiposMovimiento); NULL: todos
--   @Orden                   fecha:asc | fecha:desc. Default fecha:desc. Desempata por
--                            IDMovimientoInventario en la misma dirección (orden de registro).
-- Variante inexistente → 50004; tipo inexistente o rango invertido → 50001.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ConsultarKardex
    @IDVariante           INT,
    @Desde                DATETIME2(3) = NULL,
    @Hasta                DATETIME2(3) = NULL,
    @CodigoTipoMovimiento NVARCHAR(30) = NULL,
    @Pagina               INT          = 1,
    @TamanoPagina         INT          = 20,
    @Orden                NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IDTipo INT;
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'fecha:desc');
    SET @CodigoTipoMovimiento = NULLIF(TRIM(@CodigoTipoMovimiento), N'');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'fecha:asc', N'fecha:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden, N'. Usa fecha:asc o fecha:desc.');
        THROW 50001, @Mensaje, 1;
    END;

    IF @Desde IS NOT NULL AND @Hasta IS NOT NULL AND @Desde > @Hasta
        THROW 50001, N'La fecha inicial no puede ser posterior a la fecha final.', 1;

    IF @CodigoTipoMovimiento IS NOT NULL
    BEGIN
        SELECT @IDTipo = IDTipoMovimientoInventario
        FROM dbo.TipoMovimientoInventario
        WHERE Codigo = @CodigoTipoMovimiento;

        IF @IDTipo IS NULL
        BEGIN
            SET @Mensaje = CONCAT(N'El tipo de movimiento ', @CodigoTipoMovimiento, N' no existe.');
            THROW 50001, @Mensaje, 1;
        END;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.Variante WHERE IDVariante = @IDVariante)
        THROW 50004, N'La variante no existe.', 1;

    DECLARE @Fila TABLE (
        IDMovimientoInventario BIGINT       NOT NULL PRIMARY KEY,
        Fecha                  DATETIME2(3) NOT NULL
    );

    INSERT INTO @Fila (IDMovimientoInventario, Fecha)
    SELECT mi.IDMovimientoInventario, mi.Fecha
    FROM dbo.MovimientoInventario AS mi
    WHERE mi.IDVariante = @IDVariante
      AND (@Desde IS NULL OR mi.Fecha >= @Desde)
      AND (@Hasta IS NULL OR mi.Fecha <= @Hasta)
      AND (@IDTipo IS NULL OR mi.IDTipoMovimientoInventario = @IDTipo)
    OPTION (RECOMPILE);

    SELECT
        mi.IDMovimientoInventario,
        mi.IDVariante,
        mi.Fecha,
        t.Codigo AS CodigoTipoMovimiento,
        t.Nombre AS NombreTipoMovimiento,
        mi.Signo,
        mi.Cantidad,
        mi.ExistenciaAnterior,
        mi.ExistenciaNueva,
        mi.Motivo,
        mi.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario,
        mi.IDPedido,
        p.NumeroPedido,
        mi.IDDevolucion
    FROM @Fila AS f
    INNER JOIN dbo.MovimientoInventario AS mi ON mi.IDMovimientoInventario = f.IDMovimientoInventario
    INNER JOIN dbo.TipoMovimientoInventario AS t ON t.IDTipoMovimientoInventario = mi.IDTipoMovimientoInventario
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = mi.IDUsuario
    LEFT JOIN dbo.Pedido AS p ON p.IDPedido = mi.IDPedido
    ORDER BY
        CASE WHEN @Orden = N'fecha:asc'  THEN f.Fecha                  END ASC,
        CASE WHEN @Orden = N'fecha:asc'  THEN f.IDMovimientoInventario END ASC,
        CASE WHEN @Orden = N'fecha:desc' THEN f.Fecha                  END DESC,
        CASE WHEN @Orden = N'fecha:desc' THEN f.IDMovimientoInventario END DESC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- Movimiento de kardex con la existencia actual de su variante (sin endpoint propio): es el
-- resultado de SP_Inventario_RegistrarEntrada y SP_Inventario_RegistrarAjuste. Una fila con las
-- columnas de un movimiento de SP_Inventario_ConsultarKardex más SKU y la existencia física,
-- reservada vigente y disponible de la variante.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ObtenerMovimiento
    @IDMovimientoInventario BIGINT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.MovimientoInventario WHERE IDMovimientoInventario = @IDMovimientoInventario)
        THROW 50004, N'El movimiento de inventario no existe.', 1;

    SELECT
        mi.IDMovimientoInventario,
        mi.IDVariante,
        mi.Fecha,
        t.Codigo AS CodigoTipoMovimiento,
        t.Nombre AS NombreTipoMovimiento,
        mi.Signo,
        mi.Cantidad,
        mi.ExistenciaAnterior,
        mi.ExistenciaNueva,
        mi.Motivo,
        mi.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario,
        mi.IDPedido,
        p.NumeroPedido,
        mi.IDDevolucion,
        v.SKU,
        d.ExistenciaFisica,
        d.ExistenciaReservada,
        d.ExistenciaDisponible
    FROM dbo.MovimientoInventario AS mi
    INNER JOIN dbo.TipoMovimientoInventario AS t ON t.IDTipoMovimientoInventario = mi.IDTipoMovimientoInventario
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = mi.IDUsuario
    INNER JOIN dbo.Variante AS v ON v.IDVariante = mi.IDVariante
    CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(mi.IDVariante, NULL) AS d
    LEFT JOIN dbo.Pedido AS p ON p.IDPedido = mi.IDPedido
    WHERE mi.IDMovimientoInventario = @IDMovimientoInventario;
END;
GO

/* =========================================================
   Movimientos
   ========================================================= */

-- POST /api/inventario/entradas: entrada por compra (tipo ENTRADA_COMPRA, Signo +1).
--   @Cantidad  entero > 0; la existencia resultante no puede pasar del máximo de INT
--   @Motivo    opcional, hasta 300 caracteres; vacío → 'Entrada por compra'
-- Se permite en variantes inactivas: conservan su existencia y pueden reactivarse.
-- Kardex: un movimiento ENTRADA_COMPRA. Bitácora: MODIFICAR de Variante (Modulo 'Inventario').
-- Resultado: SP_Inventario_ObtenerMovimiento del movimiento creado.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_RegistrarEntrada
    @IDUsuarioSolicitante INT,
    @IDVariante           INT,
    @Cantidad             INT,
    @Motivo               NVARCHAR(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDTipo INT, @Signo SMALLINT, @CodigoTipo NVARCHAR(30) = N'ENTRADA_COMPRA';
    DECLARE @Fisica INT, @Nueva INT;
    DECLARE @IDMovimiento BIGINT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    SET @Motivo = ISNULL(NULLIF(TRIM(@Motivo), N''), N'Entrada por compra');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Cantidad IS NULL OR @Cantidad <= 0
            THROW 50001, N'La cantidad debe ser un entero mayor que 0.', 1;

        SELECT @IDTipo = IDTipoMovimientoInventario, @Signo = Signo
        FROM dbo.TipoMovimientoInventario
        WHERE Codigo = @CodigoTipo;

        IF @IDTipo IS NULL
            THROW 50000, N'No existe el tipo de movimiento ENTRADA_COMPRA; ejecuta 085_datos_catalogos.sql.', 1;

        -- 2. Bloquear la variante: serializa los movimientos concurrentes de la misma variante.
        SELECT @Fisica = ExistenciaFisica
        FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
        WHERE IDVariante = @IDVariante;

        IF @Fisica IS NULL
            THROW 50004, N'La variante no existe.', 1;

        IF @Cantidad > 2147483647 - @Fisica
            THROW 50001, N'La cantidad excede la existencia máxima permitida.', 1;

        SET @Nueva = @Fisica + @Signo * @Cantidad;

        SET @Anterior = (SELECT IDVariante, SKU, ExistenciaFisica, ExistenciaReservada
                         FROM dbo.Variante WHERE IDVariante = @IDVariante
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        -- 3. Kardex y saldo en la misma transacción
        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                              Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
        VALUES (@IDVariante, @IDTipo, @Signo, @IDUsuarioSolicitante, @Cantidad, @Fisica, @Nueva, @Motivo);

        SET @IDMovimiento = SCOPE_IDENTITY();

        UPDATE dbo.Variante
        SET ExistenciaFisica = @Nueva
        WHERE IDVariante = @IDVariante;

        -- 4. Bitácora
        SET @Nuevo = (SELECT v.IDVariante, v.SKU, v.ExistenciaFisica, v.ExistenciaReservada,
                             @IDMovimiento AS IDMovimientoInventario, @CodigoTipo AS TipoMovimiento,
                             @Cantidad AS Cantidad, @Motivo AS Motivo
                      FROM dbo.Variante AS v WHERE v.IDVariante = @IDVariante
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Inventario', N'Variante', @IDVariante, N'MODIFICAR', @Anterior, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Inventario_ObtenerMovimiento @IDMovimientoInventario = @IDMovimiento;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/inventario/ajustes: ajuste manual de existencia.
--   @Tipo      'ENTRADA' (AJUSTE_ENTRADA, +1) o 'SALIDA' (AJUSTE_SALIDA, -1)
--   @Cantidad  entero > 0
--   @Motivo    obligatorio, hasta 300 caracteres
-- Una salida no puede dejar la existencia física por debajo de 0 ni de la reservada vigente
-- (reservas ACTIVA no vencidas) → 50032 EXISTENCIA_NEGATIVA. Antes de escribirla libera las
-- reservas vencidas de la variante (como SP_Inventario_LiberarReservasVencidas), para que el saldo
-- Variante.ExistenciaReservada coincida con la reservada vigente y CK_Variante_ExistenciaReservada
-- no rechace un ajuste válido.
-- Kardex: un movimiento AJUSTE_ENTRADA o AJUSTE_SALIDA. Bitácora: MODIFICAR de Variante
-- (Modulo 'Inventario'). Resultado: SP_Inventario_ObtenerMovimiento del movimiento creado.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_RegistrarAjuste
    @IDUsuarioSolicitante INT,
    @IDVariante           INT,
    @Tipo                 NVARCHAR(10),
    @Cantidad             INT,
    @Motivo               NVARCHAR(300)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @IDTipo INT, @Signo SMALLINT, @CodigoTipo NVARCHAR(30);
    DECLARE @Fisica INT, @Nueva INT, @ReservadaVigente INT;
    DECLARE @IDMovimiento BIGINT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);
    DECLARE @Mensaje NVARCHAR(2048);
    DECLARE @Liberada TABLE (Cantidad INT NOT NULL);

    SET @Tipo = UPPER(TRIM(@Tipo));
    SET @Motivo = NULLIF(TRIM(@Motivo), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Tipo IS NULL OR @Tipo NOT IN (N'ENTRADA', N'SALIDA')
            THROW 50001, N'El tipo de ajuste debe ser ENTRADA o SALIDA.', 1;

        IF @Cantidad IS NULL OR @Cantidad <= 0
            THROW 50001, N'La cantidad debe ser un entero mayor que 0.', 1;

        IF @Motivo IS NULL
            THROW 50001, N'El motivo del ajuste es obligatorio.', 1;

        SET @CodigoTipo = CASE @Tipo WHEN N'ENTRADA' THEN N'AJUSTE_ENTRADA' ELSE N'AJUSTE_SALIDA' END;

        SELECT @IDTipo = IDTipoMovimientoInventario, @Signo = Signo
        FROM dbo.TipoMovimientoInventario
        WHERE Codigo = @CodigoTipo;

        IF @IDTipo IS NULL
        BEGIN
            SET @Mensaje = CONCAT(N'No existe el tipo de movimiento ', @CodigoTipo, N'; ejecuta 085_datos_catalogos.sql.');
            THROW 50000, @Mensaje, 1;
        END;

        -- 2. Bloquear la variante. Quien crea o confirma una reserva también la bloquea primero,
        --    así las reservas de la variante no cambian hasta el COMMIT.
        SELECT @Fisica = ExistenciaFisica
        FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
        WHERE IDVariante = @IDVariante;

        IF @Fisica IS NULL
            THROW 50004, N'La variante no existe.', 1;

        IF @Signo > 0 AND @Cantidad > 2147483647 - @Fisica
            THROW 50001, N'La cantidad excede la existencia máxima permitida.', 1;

        SET @Nueva = @Fisica + @Signo * @Cantidad;

        IF @Signo < 0
        BEGIN
            IF @Nueva < 0
            BEGIN
                SET @Mensaje = CONCAT(N'El ajuste dejaría la existencia en negativo: hay ', @Fisica,
                                      N' unidades y se quieren retirar ', @Cantidad, N'.');
                THROW 50032, @Mensaje, 1;
            END;

            -- READCOMMITTEDLOCK: con READ_COMMITTED_SNAPSHOT una lectura normal no esperaría a una
            -- reserva aún sin confirmar.
            SELECT @ReservadaVigente = ISNULL(SUM(Cantidad), 0)
            FROM dbo.ReservaExistencia WITH (READCOMMITTEDLOCK)
            WHERE IDVariante = @IDVariante
              AND Estado = N'ACTIVA'
              AND FechaExpiracion > @Ahora;

            IF @Nueva < @ReservadaVigente
            BEGIN
                SET @Mensaje = CONCAT(N'El ajuste dejaría la existencia (', @Nueva,
                                      N') por debajo de lo reservado en checkouts en curso (', @ReservadaVigente, N').');
                THROW 50032, @Mensaje, 1;
            END;
        END;

        SET @Anterior = (SELECT IDVariante, SKU, ExistenciaFisica, ExistenciaReservada
                         FROM dbo.Variante WHERE IDVariante = @IDVariante
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        -- 3. Una salida libera antes las reservas vencidas de la variante (mismo @Ahora que la validación).
        IF @Signo < 0
        BEGIN
            UPDATE dbo.ReservaExistencia
            SET Estado = N'LIBERADA'
            OUTPUT inserted.Cantidad INTO @Liberada (Cantidad)
            WHERE IDVariante = @IDVariante
              AND Estado = N'ACTIVA'
              AND FechaExpiracion <= @Ahora;

            IF @@ROWCOUNT > 0
                UPDATE dbo.Variante
                SET ExistenciaReservada = ExistenciaReservada - (SELECT SUM(Cantidad) FROM @Liberada)
                WHERE IDVariante = @IDVariante;
        END;

        -- 4. Kardex y saldo en la misma transacción
        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                              Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
        VALUES (@IDVariante, @IDTipo, @Signo, @IDUsuarioSolicitante, @Cantidad, @Fisica, @Nueva, @Motivo);

        SET @IDMovimiento = SCOPE_IDENTITY();

        UPDATE dbo.Variante
        SET ExistenciaFisica = @Nueva
        WHERE IDVariante = @IDVariante;

        -- 5. Bitácora
        SET @Nuevo = (SELECT v.IDVariante, v.SKU, v.ExistenciaFisica, v.ExistenciaReservada,
                             @IDMovimiento AS IDMovimientoInventario, @CodigoTipo AS TipoMovimiento,
                             @Cantidad AS Cantidad, @Motivo AS Motivo
                      FROM dbo.Variante AS v WHERE v.IDVariante = @IDVariante
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Inventario', N'Variante', @IDVariante, N'MODIFICAR', @Anterior, @Nuevo);

        COMMIT TRANSACTION;

        -- 6. Resultado
        EXEC dbo.SP_Inventario_ObtenerMovimiento @IDMovimientoInventario = @IDMovimiento;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Reservas
   ========================================================= */

-- Sin endpoint: jobs/liberarReservas.job.ts lo ejecuta cada minuto.
-- Marca LIBERADA cada reserva ACTIVA con FechaExpiracion <= @Ahora y resta su cantidad de
-- Variante.ExistenciaReservada, en la misma transacción. Las reservas vencidas ya no cuentan
-- para la disponible (FU_Inventario_ExistenciaDisponible); esto solo pone al día el saldo.
--   @Ahora  instante UTC de corte; NULL = SYSUTCDATETIME(). Solo para pruebas.
-- Bloquea con UPDLOCK, ROWLOCK las variantes afectadas (en orden de IDVariante) antes de tocar sus
-- reservas, igual que los SPs de checkout y pedidos: una reserva que el pedido confirma a la vez
-- no puede liberarse dos veces. Una reserva que vence entre la lectura y el bloqueo queda para la
-- siguiente ejecución.
-- No escribe bitácora ni kardex: la existencia física no cambia.
-- Resultado: una fila con ReservasLiberadas, UnidadesLiberadas y VariantesAfectadas.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_LiberarReservasVencidas
    @Ahora DATETIME2(3) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bloqueadas INT;
    DECLARE @Variante TABLE (IDVariante INT NOT NULL PRIMARY KEY);
    DECLARE @Liberada TABLE (
        IDReservaExistencia INT NOT NULL PRIMARY KEY,
        IDVariante          INT NOT NULL,
        Cantidad            INT NOT NULL
    );

    SET @Ahora = ISNULL(@Ahora, SYSUTCDATETIME());

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Variantes con reservas vencidas (IX_ReservaExistencia_FechaExpiracion)
        INSERT INTO @Variante (IDVariante)
        SELECT DISTINCT IDVariante
        FROM dbo.ReservaExistencia
        WHERE Estado = N'ACTIVA'
          AND FechaExpiracion <= @Ahora;

        IF @@ROWCOUNT > 0
        BEGIN
            -- 2. Bloquear las variantes en orden de IDVariante
            SELECT @Bloqueadas = COUNT(*)
            FROM (
                SELECT v.IDVariante
                FROM dbo.Variante AS v WITH (UPDLOCK, ROWLOCK)
                INNER JOIN @Variante AS x ON x.IDVariante = v.IDVariante
            ) AS b;

            -- 3. Liberar: el UPDATE relee el estado confirmado, así no toca una reserva que otra
            --    transacción confirmó o liberó mientras tanto.
            UPDATE re
            SET Estado = N'LIBERADA'
            OUTPUT inserted.IDReservaExistencia, inserted.IDVariante, inserted.Cantidad
            INTO @Liberada (IDReservaExistencia, IDVariante, Cantidad)
            FROM dbo.ReservaExistencia AS re
            INNER JOIN @Variante AS x ON x.IDVariante = re.IDVariante
            WHERE re.Estado = N'ACTIVA'
              AND re.FechaExpiracion <= @Ahora;

            UPDATE v
            SET ExistenciaReservada = v.ExistenciaReservada - l.Cantidad
            FROM dbo.Variante AS v
            INNER JOIN (
                SELECT IDVariante, SUM(Cantidad) AS Cantidad
                FROM @Liberada
                GROUP BY IDVariante
            ) AS l ON l.IDVariante = v.IDVariante;
        END;

        COMMIT TRANSACTION;

        SELECT
            COUNT(*)                   AS ReservasLiberadas,
            ISNULL(SUM(Cantidad), 0)   AS UnidadesLiberadas,
            COUNT(DISTINCT IDVariante) AS VariantesAfectadas
        FROM @Liberada;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/checkout/iniciar: reserva la existencia de cada línea del carrito del cliente por
-- Configuracion.MinutosReserva (15 si falta o no es un entero entre 1 y 1440) y devuelve el resumen.
--   @IDDireccion    dirección del propio cliente y activa; si no, 50004
--   @IDMetodoEnvio  método de envío activo; si no, 50004
-- Validaciones, en orden: solicitante (50004/50012), dirección y método (50004), carrito vacío (50001),
-- línea no vendible (variante, producto o categoría inactivos → 50001), cupón del carrito
-- (FU_Cupones_Validar → su código 50060–50067; el carrito conserva el cupón, el cliente lo quita) y
-- existencia (50030).
-- Reemplaza la reserva ACTIVA anterior del carrito: la marca LIBERADA y devuelve sus unidades antes de
-- comprobar la existencia, así el cliente no compite con su propia reserva. Libera también las vencidas de
-- las variantes involucradas (el saldo Variante.ExistenciaReservada las incluye hasta que corre el job y,
-- sin liberarlas, CK_Variante_ExistenciaReservada rechazaría una reserva válida).
-- Bloquea carrito → variantes (UPDLOCK, ROWLOCK, una por una en orden de IDVariante) y después toca las
-- reservas. No bloquea el cupón: aquí solo se revalida; el límite se garantiza al pagar (CrearPedido).
-- Sin existencia suficiente en alguna línea: THROW 50030, todo se revierte (incluida la liberación de la
-- reserva anterior, que sigue vigente) y el mensaje trae las variantes afectadas:
--     <texto para el cliente>
--     DETALLE=[{"idVariante":4,"sku":"CAM-LIM-NEG-M","solicitado":2,"disponible":1}]
-- Todo lo que sigue a "\nDETALLE=" es un arreglo JSON válido (hasta 8 variantes).
-- No escribe bitácora ni kardex: la existencia física no cambia.
-- Resultado: SP_Checkout_ArmarResumen (encabezado y líneas), igual que SP_Checkout_ObtenerResumen con
-- el mismo @IDMetodoEnvio.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservarExistencia
    @IDUsuarioSolicitante INT,
    @IDDireccion          INT,
    @IDMetodoEnvio        INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3);
    DECLARE @IDCarrito INT, @IDCupon INT, @IDVariante INT, @Minutos INT, @Error INT, @Bloqueada INT;
    DECLARE @Mensaje NVARCHAR(2048), @Detalle NVARCHAR(MAX), @Skus NVARCHAR(MAX);
    DECLARE @Linea TABLE (
        IDVariante INT           NOT NULL PRIMARY KEY,
        SKU        NVARCHAR(50)  NOT NULL,
        Cantidad   INT           NOT NULL,
        Vendible   BIT           NOT NULL
    );
    DECLARE @Bloqueo TABLE (IDVariante INT NOT NULL PRIMARY KEY);
    DECLARE @Liberada TABLE (IDVariante INT NOT NULL, Cantidad INT NOT NULL);
    DECLARE @Falta TABLE (
        IDVariante INT          NOT NULL PRIMARY KEY,
        SKU        NVARCHAR(50) NOT NULL,
        Solicitado INT          NOT NULL,
        Disponible INT          NOT NULL
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF NOT EXISTS (
            SELECT 1 FROM dbo.Direccion
            WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuarioSolicitante AND Activo = 1
        )
            THROW 50004, N'La dirección no existe.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.MetodoEnvio WHERE IDMetodoEnvio = @IDMetodoEnvio AND Activo = 1)
            THROW 50004, N'El método de envío no existe o no está disponible.', 1;

        -- 2. Bloquear el carrito (primero en el orden de bloqueo)
        EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 1, @IDCarrito OUTPUT;

        IF @IDCarrito IS NOT NULL
            INSERT INTO @Linea (IDVariante, SKU, Cantidad, Vendible)
            SELECT cd.IDVariante, v.SKU, cd.Cantidad,
                   CONVERT(BIT, CASE WHEN v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END)
            FROM dbo.CarritoDetalle AS cd
            INNER JOIN dbo.Variante AS v ON v.IDVariante = cd.IDVariante
            INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
            INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
            WHERE cd.IDCarrito = @IDCarrito;

        IF NOT EXISTS (SELECT 1 FROM @Linea)
            THROW 50001, N'Tu carrito está vacío; agrega productos antes de iniciar el pago.', 1;

        IF EXISTS (SELECT 1 FROM @Linea WHERE Vendible = 0)
        BEGIN
            SELECT @Skus = STRING_AGG(SKU, N', ') WITHIN GROUP (ORDER BY IDVariante)
            FROM @Linea WHERE Vendible = 0;

            SET @Mensaje = CONCAT(N'Estos productos ya no están disponibles para la venta; quítalos del carrito: ',
                                  LEFT(@Skus, 1500), N'.');
            THROW 50001, @Mensaje, 1;
        END;

        SELECT @IDCupon = IDCupon FROM dbo.Carrito WHERE IDCarrito = @IDCarrito;

        IF @IDCupon IS NOT NULL
        BEGIN
            SELECT @Error = CodigoError, @Mensaje = MensajeError
            FROM dbo.FU_Cupones_Validar(@IDCupon, @IDUsuarioSolicitante, @IDCarrito);

            IF @Error IS NOT NULL
                THROW @Error, @Mensaje, 1;
        END;

        -- 3. Bloquear las variantes (las del carrito y las de su reserva anterior) en orden de IDVariante
        INSERT INTO @Bloqueo (IDVariante)
        SELECT IDVariante FROM @Linea
        UNION
        SELECT IDVariante
        FROM dbo.ReservaExistencia
        WHERE IDCarrito = @IDCarrito AND Estado = N'ACTIVA';

        SET @IDVariante = 0;
        WHILE 1 = 1
        BEGIN
            SELECT TOP (1) @IDVariante = IDVariante
            FROM @Bloqueo
            WHERE IDVariante > @IDVariante
            ORDER BY IDVariante;

            IF @@ROWCOUNT = 0
                BREAK;

            -- La fila se lee solo para tomar el bloqueo; el valor no se usa.
            SELECT @Bloqueada = ExistenciaFisica
            FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
            WHERE IDVariante = @IDVariante;
        END;

        SET @Ahora = SYSUTCDATETIME();

        -- 4. Liberar la reserva anterior del carrito y las vencidas de esas variantes
        UPDATE re
        SET Estado = N'LIBERADA'
        OUTPUT inserted.IDVariante, inserted.Cantidad INTO @Liberada (IDVariante, Cantidad)
        FROM dbo.ReservaExistencia AS re
        INNER JOIN @Bloqueo AS b ON b.IDVariante = re.IDVariante
        WHERE re.Estado = N'ACTIVA'
          AND (re.IDCarrito = @IDCarrito OR re.FechaExpiracion <= @Ahora);

        UPDATE v
        SET ExistenciaReservada = v.ExistenciaReservada - l.Cantidad
        FROM dbo.Variante AS v
        INNER JOIN (
            SELECT IDVariante, SUM(Cantidad) AS Cantidad
            FROM @Liberada
            GROUP BY IDVariante
        ) AS l ON l.IDVariante = v.IDVariante;

        -- 5. Existencia disponible (física menos reservas vigentes de otros carritos)
        INSERT INTO @Falta (IDVariante, SKU, Solicitado, Disponible)
        SELECT TOP (8) l.IDVariante, l.SKU, l.Cantidad, d.ExistenciaDisponible
        FROM @Linea AS l
        CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(l.IDVariante, NULL) AS d
        WHERE l.Cantidad > d.ExistenciaDisponible
        ORDER BY l.IDVariante;

        IF EXISTS (SELECT 1 FROM @Falta)
        BEGIN
            SET @Detalle = (SELECT IDVariante AS idVariante, SKU AS sku, Solicitado AS solicitado, Disponible AS disponible
                            FROM @Falta ORDER BY IDVariante FOR JSON PATH);

            SELECT @Skus = STRING_AGG(CONCAT(SKU, N' (pides ', Solicitado, N', hay ', Disponible, N')'), N', ')
                           WITHIN GROUP (ORDER BY IDVariante)
            FROM @Falta;

            SET @Mensaje = CONCAT(N'No hay existencia suficiente para: ', LEFT(@Skus, 700), N'.',
                                  NCHAR(10), N'DETALLE=', @Detalle);
            THROW 50030, @Mensaje, 1;
        END;

        -- 6. Reservar
        SELECT @Minutos = TRY_CONVERT(INT, Valor)
        FROM dbo.Configuracion
        WHERE Clave = N'MinutosReserva';

        IF @Minutos IS NULL OR @Minutos NOT BETWEEN 1 AND 1440
            SET @Minutos = 15;

        INSERT INTO dbo.ReservaExistencia (IDCarrito, IDVariante, Cantidad, Estado, FechaExpiracion, FechaCreacion)
        SELECT @IDCarrito, IDVariante, Cantidad, N'ACTIVA', DATEADD(MINUTE, @Minutos, @Ahora), @Ahora
        FROM @Linea;

        UPDATE v
        SET ExistenciaReservada = v.ExistenciaReservada + l.Cantidad
        FROM dbo.Variante AS v
        INNER JOIN @Linea AS l ON l.IDVariante = v.IDVariante;

        UPDATE dbo.Carrito
        SET FechaUltimaActividad = @Ahora
        WHERE IDCarrito = @IDCarrito;

        COMMIT TRANSACTION;

        -- 7. Resultado
        EXEC dbo.SP_Checkout_ArmarResumen @IDCarrito = @IDCarrito, @IDMetodoEnvio = @IDMetodoEnvio;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/checkout/reserva: el cliente vuelve al carrito. Marca LIBERADA la reserva ACTIVA de su
-- carrito (vigente o vencida) y devuelve sus unidades a Variante.ExistenciaReservada en la misma
-- transacción. Sin carrito o sin reserva no es un error: no cambia nada y devuelve ceros.
-- Bloquea carrito → variantes (en orden de IDVariante) → reservas. No escribe bitácora ni kardex.
-- Resultado (una fila): ReservasLiberadas INT, UnidadesLiberadas INT.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_LiberarReserva
    @IDUsuarioSolicitante INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCarrito INT, @IDVariante INT, @Bloqueada INT;
    DECLARE @Bloqueo TABLE (IDVariante INT NOT NULL PRIMARY KEY);
    DECLARE @Liberada TABLE (IDVariante INT NOT NULL, Cantidad INT NOT NULL);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 1, @IDCarrito OUTPUT;

        IF @IDCarrito IS NOT NULL
        BEGIN
            INSERT INTO @Bloqueo (IDVariante)
            SELECT DISTINCT IDVariante
            FROM dbo.ReservaExistencia
            WHERE IDCarrito = @IDCarrito AND Estado = N'ACTIVA';

            SET @IDVariante = 0;
            WHILE 1 = 1
            BEGIN
                SELECT TOP (1) @IDVariante = IDVariante
                FROM @Bloqueo
                WHERE IDVariante > @IDVariante
                ORDER BY IDVariante;

                IF @@ROWCOUNT = 0
                    BREAK;

                SELECT @Bloqueada = ExistenciaFisica
                FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
                WHERE IDVariante = @IDVariante;
            END;

            UPDATE re
            SET Estado = N'LIBERADA'
            OUTPUT inserted.IDVariante, inserted.Cantidad INTO @Liberada (IDVariante, Cantidad)
            FROM dbo.ReservaExistencia AS re
            INNER JOIN @Bloqueo AS b ON b.IDVariante = re.IDVariante
            WHERE re.IDCarrito = @IDCarrito
              AND re.Estado = N'ACTIVA';

            UPDATE v
            SET ExistenciaReservada = v.ExistenciaReservada - l.Cantidad
            FROM dbo.Variante AS v
            INNER JOIN (
                SELECT IDVariante, SUM(Cantidad) AS Cantidad
                FROM @Liberada
                GROUP BY IDVariante
            ) AS l ON l.IDVariante = v.IDVariante;
        END;

        COMMIT TRANSACTION;

        SELECT
            COUNT(*)                 AS ReservasLiberadas,
            ISNULL(SUM(Cantidad), 0) AS UnidadesLiberadas
        FROM @Liberada;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
