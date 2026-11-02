/*
    010_sp_carrito.sql
    Stored procedures de carrito y cupón aplicado.

    Identificación del carrito: nunca por un IDCarrito que envíe el cliente.
      - Cliente: @IDUsuarioSolicitante (sale del JWT). Su carrito ACTIVO (UX_Carrito_IDUsuario_Activo
        garantiza que hay como máximo uno).
      - Invitado: @TokenInvitado (header X-Cart-Token). Solo carritos ACTIVO sin usuario.
      - Si llegan los dos, manda el usuario y el token se ignora: un cliente nunca ve ni toca un
        carrito de invitado (eso lo hace solo SP_Carrito_FusionarInvitado), y el carrito de otro
        cliente no se encuentra nunca, así que responde como inexistente (50004).
      - Un token que no existe, o de un carrito que ya no está ACTIVO, se trata como si no
        viniera: SP_Carrito_AgregarItem crea un carrito con un token nuevo (NEWID()) y lo devuelve.

    Resultado: todos los SPs del carrito devuelven el carrito completo con la forma de
    SP_Carrito_ObtenerPorId (encabezado + líneas), también cuando no hay carrito (encabezado con
    IDCarrito NULL y montos en 0, sin líneas). Los montos salen de FU_Carrito_CalcularTotales y
    FU_Cupones_CalculoDescuento (005_funciones.sql); el backend no los recalcula.

    Existencia: el carrito no aparta unidades. Agregar o cambiar una cantidad exige que no supere
    la existencia disponible (física menos reservas vigentes de otros carritos,
    FU_Inventario_ExistenciaDisponible con @IDCarritoExcluido = el propio carrito); la garantía
    contra la sobreventa la dan la reserva del checkout y SP_Pedidos_CrearPedido. Una línea cuya
    variante se desactivó o cuya cantidad ya supera lo disponible se marca (RequiereAjuste).
    Estos SPs no crean, cambian ni liberan reservas.

    Cupón: solo un cliente puede aplicarlo (CK_Carrito_Cupon). El carrito guarda el cupón elegido
    (Carrito.IDCupon) y el descuento se recalcula en cada lectura; si el cupón deja de valer no
    descuenta y el encabezado dice por qué (CodigoErrorCupon, MensajeErrorCupon). El checkout lo
    vuelve a validar. Aplicar o quitar un cupón del carrito no va a la bitácora: no modifica el
    cupón; su uso se registra al pagar (UsoCupon).

    Orden de bloqueo: Carrito → Cupon → Variante → ReservaExistencia. Todo SP que escribe en un
    carrito bloquea primero su fila con UPDLOCK (más HOLDLOCK al buscarlo, para que dos peticiones
    simultáneas del mismo cliente no creen dos carritos), así las escrituras sobre un mismo
    carrito se serializan. La fusión bloquea el carrito del cliente y después el del invitado.
    SP_Carrito_AplicarCupon bloquea el cupón con UPDLOCK después del carrito (carrera con
    SP_Cupones_Eliminar / SP_Cupones_Actualizar). Las variantes no se bloquean aquí.

    Cada escritura actualiza Carrito.FechaUltimaActividad (reporte de carritos abandonados).

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION (cantidad <= 0, cupón sin sesión, carrito vacío al aplicar un cupón…)
      50004  NO_ENCONTRADO (variante inexistente o no vendible, línea que no está en el carrito)
      50012  USUARIO_INACTIVO (solicitante desactivado, SP_Usuarios_ValidarSolicitante)
      50030  STOCK_INSUFICIENTE
      50060–50067  motivos de rechazo del cupón (FU_Cupones_Validar)
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Uso interno
   ========================================================= */

-- Sin endpoint. Busca el carrito ACTIVO del cliente o, si no hay usuario, el del invitado.
-- @IDCarrito queda NULL si no hay. Con @Bloquear = 1 (dentro de la transacción del SP que
-- escribe) toma UPDLOCK, HOLDLOCK: la fila queda bloqueada hasta el COMMIT y, si no existe, el
-- rango del índice único también, así otra petición del mismo cliente espera en lugar de crear
-- un segundo carrito (que fallaría con 2601 en UX_Carrito_IDUsuario_Activo).
-- Los predicados IS NOT NULL repiten el filtro de los índices UX_ para que el optimizador los use.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_BuscarActivo
    @IDUsuario     INT,
    @TokenInvitado UNIQUEIDENTIFIER,
    @Bloquear      BIT,
    @IDCarrito     INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SET @IDCarrito = NULL;

    IF @IDUsuario IS NOT NULL
    BEGIN
        IF @Bloquear = 1
            SELECT @IDCarrito = IDCarrito
            FROM dbo.Carrito WITH (UPDLOCK, HOLDLOCK)
            WHERE IDUsuario = @IDUsuario
              AND IDUsuario IS NOT NULL
              AND Estado = N'ACTIVO';
        ELSE
            SELECT @IDCarrito = IDCarrito
            FROM dbo.Carrito
            WHERE IDUsuario = @IDUsuario
              AND IDUsuario IS NOT NULL
              AND Estado = N'ACTIVO';
    END
    ELSE IF @TokenInvitado IS NOT NULL
    BEGIN
        IF @Bloquear = 1
            SELECT @IDCarrito = IDCarrito
            FROM dbo.Carrito WITH (UPDLOCK, HOLDLOCK)
            WHERE TokenInvitado = @TokenInvitado
              AND TokenInvitado IS NOT NULL
              AND IDUsuario IS NULL
              AND Estado = N'ACTIVO';
        ELSE
            SELECT @IDCarrito = IDCarrito
            FROM dbo.Carrito
            WHERE TokenInvitado = @TokenInvitado
              AND TokenInvitado IS NOT NULL
              AND IDUsuario IS NULL
              AND Estado = N'ACTIVO';
    END;
END;
GO

-- Sin endpoint: resultado de todos los SPs del carrito (y del resumen del checkout). Recibe el
-- IDCarrito ya resuelto por el SP que lo llama; con NULL o un carrito inexistente devuelve el
-- carrito vacío. Result sets, en orden:
--   1. Encabezado (una fila siempre)
--   2. Líneas (0 o más filas), en el orden en que se agregaron
-- Montos en DECIMAL(12,2). ExistenciaDisponible excluye las reservas del propio carrito y es 0
-- si la línea no es vendible (variante, producto o categoría inactivos).
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_ObtenerPorId
    @IDCarrito INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IDCuponAplicado INT;

    SELECT @IDCuponAplicado = CASE WHEN CuponAplicado = 1 THEN IDCupon END
    FROM dbo.FU_Carrito_CalcularTotales(@IDCarrito, 0);

    DECLARE @Linea TABLE (
        IDCarritoDetalle     INT           NOT NULL PRIMARY KEY,
        IDVariante           INT           NOT NULL,
        SKU                  NVARCHAR(50)  NOT NULL,
        IDProducto           INT           NOT NULL,
        Producto             NVARCHAR(150) NOT NULL,
        IDCategoria          INT           NOT NULL,
        Categoria            NVARCHAR(100) NOT NULL,
        DescripcionVariante  NVARCHAR(200) NULL,
        ImagenPrincipal      NVARCHAR(500) NULL,
        PrecioUnitario       DECIMAL(12,2) NOT NULL,
        Cantidad             INT           NOT NULL,
        Importe              DECIMAL(12,2) NOT NULL,
        DescuentoLinea       DECIMAL(12,2) NOT NULL,
        ImporteNeto          DECIMAL(12,2) NOT NULL,
        ElegibleCupon        BIT           NOT NULL,
        ExistenciaDisponible INT           NOT NULL,
        Vendible             BIT           NOT NULL,
        ExcedeDisponible     BIT           NOT NULL,
        RequiereAjuste       BIT           NOT NULL,
        FechaAgregado        DATETIME2(3)  NOT NULL
    );

    INSERT INTO @Linea (IDCarritoDetalle, IDVariante, SKU, IDProducto, Producto, IDCategoria, Categoria,
                        DescripcionVariante, ImagenPrincipal, PrecioUnitario, Cantidad, Importe,
                        DescuentoLinea, ImporteNeto, ElegibleCupon, ExistenciaDisponible, Vendible,
                        ExcedeDisponible, RequiereAjuste, FechaAgregado)
    SELECT
        f.IDCarritoDetalle,
        f.IDVariante,
        v.SKU,
        p.IDProducto,
        p.Nombre,
        cat.IDCategoria,
        cat.Nombre,
        dv.Descripcion,
        img.Url,
        f.PrecioUnitario,
        f.Cantidad,
        f.Importe,
        f.DescuentoLinea,
        f.ImporteNeto,
        f.Elegible,
        CASE WHEN x.Vendible = 1 THEN d.ExistenciaDisponible ELSE 0 END,
        x.Vendible,
        CONVERT(BIT, CASE WHEN x.Vendible = 1 AND f.Cantidad > d.ExistenciaDisponible THEN 1 ELSE 0 END),
        CONVERT(BIT, CASE WHEN x.Vendible = 0 OR f.Cantidad > d.ExistenciaDisponible THEN 1 ELSE 0 END),
        cd.FechaAgregado
    FROM dbo.FU_Cupones_CalculoDescuento(@IDCarrito, @IDCuponAplicado) AS f
    INNER JOIN dbo.CarritoDetalle AS cd ON cd.IDCarritoDetalle = f.IDCarritoDetalle
    INNER JOIN dbo.Variante AS v ON v.IDVariante = f.IDVariante
    INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    INNER JOIN dbo.Categoria AS cat ON cat.IDCategoria = p.IDCategoria
    CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(f.IDVariante, @IDCarrito) AS d
    OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(f.IDVariante) AS dv
    OUTER APPLY (
        SELECT TOP (1) pi.Url
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProducto = p.IDProducto
        ORDER BY pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen
    ) AS img
    CROSS APPLY (
        SELECT CONVERT(BIT, CASE WHEN v.Activo = 1 AND p.Activo = 1 AND cat.Activo = 1 THEN 1 ELSE 0 END) AS Vendible
    ) AS x;

    -- 1. Encabezado
    SELECT
        c.IDCarrito,
        c.TokenInvitado,
        c.IDUsuario,
        t.IDCupon,
        cu.Codigo        AS CodigoCupon,
        cu.Descripcion   AS DescripcionCupon,
        cu.TipoDescuento,
        cu.Valor         AS ValorCupon,
        cu.IDCategoria   AS IDCategoriaCupon,
        catc.Nombre      AS CategoriaCupon,
        t.CuponAplicado,
        t.CodigoErrorCupon,
        t.MensajeErrorCupon,
        t.CantidadLineas,
        t.CantidadUnidades,
        t.Subtotal,
        t.Descuento,
        t.Total,
        t.PorcentajeIVA,
        t.MontoIVA,
        (SELECT COUNT(*) FROM @Linea WHERE RequiereAjuste = 1) AS LineasRequierenAjuste,
        c.FechaCreacion,
        c.FechaUltimaActividad
    FROM dbo.FU_Carrito_CalcularTotales(@IDCarrito, 0) AS t
    LEFT JOIN dbo.Carrito AS c ON c.IDCarrito = t.IDCarrito
    LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = t.IDCupon
    LEFT JOIN dbo.Categoria AS catc ON catc.IDCategoria = cu.IDCategoria;

    -- 2. Líneas
    SELECT
        IDCarritoDetalle, IDVariante, SKU, IDProducto, Producto, IDCategoria, Categoria,
        DescripcionVariante, ImagenPrincipal, PrecioUnitario, Cantidad, Importe, DescuentoLinea,
        ImporteNeto, ElegibleCupon, ExistenciaDisponible, Vendible, ExcedeDisponible, RequiereAjuste,
        FechaAgregado
    FROM @Linea
    ORDER BY FechaAgregado, IDCarritoDetalle;
END;
GO

/* =========================================================
   Carrito
   ========================================================= */

-- GET /api/carrito: carrito ACTIVO del cliente o del invitado. Sin carrito (o sin usuario ni
-- token, o con un token que no existe) devuelve el carrito vacío: no es un error.
-- Resultado: SP_Carrito_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_Obtener
    @IDUsuarioSolicitante INT              = NULL,
    @TokenInvitado        UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IDCarrito INT;

    EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, @TokenInvitado, 0, @IDCarrito OUTPUT;

    EXEC dbo.SP_Carrito_ObtenerPorId @IDCarrito = @IDCarrito;
END;
GO

-- POST /api/carrito/items: agrega una variante; si ya está en el carrito, suma la cantidad.
--   @Cantidad  entero > 0 → si no, 50001
-- Variante inexistente, inactiva, o de un producto o categoría inactivos → 50004.
-- La cantidad total de la línea no puede superar la existencia disponible → 50030.
-- Si no hay carrito lo crea: al cliente con su usuario; al invitado con un token nuevo (NEWID()),
-- también cuando envió un token que no existe. El token va en TokenInvitado del encabezado.
-- Resultado: SP_Carrito_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_AgregarItem
    @IDUsuarioSolicitante INT              = NULL,
    @TokenInvitado        UNIQUEIDENTIFIER = NULL,
    @IDVariante           INT,
    @Cantidad             INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCarrito INT, @SKU NVARCHAR(50), @Actual INT = 0, @Disponible INT;
    DECLARE @Mensaje NVARCHAR(2048);

    IF @IDUsuarioSolicitante IS NOT NULL
        SET @TokenInvitado = NULL;  -- manda el usuario

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @IDUsuarioSolicitante IS NOT NULL
            EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Cantidad IS NULL OR @Cantidad <= 0
            THROW 50001, N'La cantidad debe ser un entero mayor que 0.', 1;

        SELECT @SKU = v.SKU
        FROM dbo.Variante AS v
        INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
        INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
        WHERE v.IDVariante = @IDVariante
          AND v.Activo = 1
          AND p.Activo = 1
          AND c.Activo = 1;

        IF @SKU IS NULL
            THROW 50004, N'La variante no existe o no está disponible para la venta.', 1;

        -- 2. Bloquear el carrito (o el rango donde se crearía)
        EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, @TokenInvitado, 1, @IDCarrito OUTPUT;

        IF @IDCarrito IS NOT NULL
            SELECT @Actual = Cantidad
            FROM dbo.CarritoDetalle
            WHERE IDCarrito = @IDCarrito
              AND IDVariante = @IDVariante;

        SELECT @Disponible = ExistenciaDisponible
        FROM dbo.FU_Inventario_ExistenciaDisponible(@IDVariante, @IDCarrito);

        -- Restando en lugar de sumar: @Actual + @Cantidad podría desbordar INT.
        IF @Cantidad > @Disponible - @Actual
        BEGIN
            SET @Mensaje = CASE
                WHEN @Disponible = 0 THEN CONCAT(N'No hay unidades disponibles de ', @SKU, N'.')
                ELSE CONCAT(N'Solo hay ', @Disponible,
                            CASE WHEN @Disponible = 1 THEN N' unidad disponible de ' ELSE N' unidades disponibles de ' END,
                            @SKU, N'.')
            END;

            IF @Actual > 0
                SET @Mensaje = CONCAT(@Mensaje, N' Ya tienes ', @Actual, N' en el carrito.');

            THROW 50030, @Mensaje, 1;
        END;

        -- 3. Escribir
        IF @IDCarrito IS NULL
        BEGIN
            IF @IDUsuarioSolicitante IS NULL
                SET @TokenInvitado = NEWID();  -- nunca se crea un carrito con un token del cliente

            INSERT INTO dbo.Carrito (IDUsuario, TokenInvitado, Estado)
            VALUES (@IDUsuarioSolicitante, @TokenInvitado, N'ACTIVO');

            SET @IDCarrito = SCOPE_IDENTITY();
        END;

        IF @Actual > 0
            UPDATE dbo.CarritoDetalle
            SET Cantidad = Cantidad + @Cantidad
            WHERE IDCarrito = @IDCarrito
              AND IDVariante = @IDVariante;
        ELSE
            INSERT INTO dbo.CarritoDetalle (IDCarrito, IDVariante, Cantidad)
            VALUES (@IDCarrito, @IDVariante, @Cantidad);

        UPDATE dbo.Carrito
        SET FechaUltimaActividad = SYSUTCDATETIME()
        WHERE IDCarrito = @IDCarrito;

        COMMIT TRANSACTION;

        -- 4. Resultado
        EXEC dbo.SP_Carrito_ObtenerPorId @IDCarrito = @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/carrito/items/:idVariante: reemplaza la cantidad de una línea.
--   @Cantidad  entero > 0 → si no, 50001 (para quitar la línea se usa SP_Carrito_EliminarItem)
-- Sin carrito o la variante no está en él → 50004. Variante, producto o categoría inactivos →
-- 50004 (la línea solo puede quitarse). La nueva cantidad no puede superar la existencia
-- disponible → 50030; reducir una línea que ya excedía lo disponible también debe quedar dentro.
-- Resultado: SP_Carrito_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_ActualizarCantidad
    @IDUsuarioSolicitante INT              = NULL,
    @TokenInvitado        UNIQUEIDENTIFIER = NULL,
    @IDVariante           INT,
    @Cantidad             INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCarrito INT, @Actual INT, @SKU NVARCHAR(50), @Vendible BIT, @Disponible INT;
    DECLARE @Mensaje NVARCHAR(2048);

    IF @IDUsuarioSolicitante IS NOT NULL
        SET @TokenInvitado = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @IDUsuarioSolicitante IS NOT NULL
            EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Cantidad IS NULL OR @Cantidad <= 0
            THROW 50001, N'La cantidad debe ser un entero mayor que 0; para quitar el producto elimínalo del carrito.', 1;

        -- 2. Bloquear el carrito
        EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, @TokenInvitado, 1, @IDCarrito OUTPUT;

        IF @IDCarrito IS NOT NULL
            SELECT @Actual = Cantidad
            FROM dbo.CarritoDetalle
            WHERE IDCarrito = @IDCarrito
              AND IDVariante = @IDVariante;

        IF @Actual IS NULL
            THROW 50004, N'El producto no está en el carrito.', 1;

        SELECT
            @SKU = v.SKU,
            @Vendible = CASE WHEN v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END
        FROM dbo.Variante AS v
        INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
        INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
        WHERE v.IDVariante = @IDVariante;

        IF @Vendible = 0
            THROW 50004, N'El producto ya no está disponible para la venta; quítalo del carrito.', 1;

        SELECT @Disponible = ExistenciaDisponible
        FROM dbo.FU_Inventario_ExistenciaDisponible(@IDVariante, @IDCarrito);

        IF @Cantidad > @Disponible
        BEGIN
            SET @Mensaje = CASE
                WHEN @Disponible = 0 THEN CONCAT(N'No hay unidades disponibles de ', @SKU, N'.')
                ELSE CONCAT(N'Solo hay ', @Disponible,
                            CASE WHEN @Disponible = 1 THEN N' unidad disponible de ' ELSE N' unidades disponibles de ' END,
                            @SKU, N'.')
            END;
            THROW 50030, @Mensaje, 1;
        END;

        -- 3. Escribir
        IF @Cantidad <> @Actual
            UPDATE dbo.CarritoDetalle
            SET Cantidad = @Cantidad
            WHERE IDCarrito = @IDCarrito
              AND IDVariante = @IDVariante;

        UPDATE dbo.Carrito
        SET FechaUltimaActividad = SYSUTCDATETIME()
        WHERE IDCarrito = @IDCarrito;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Carrito_ObtenerPorId @IDCarrito = @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/carrito/items/:idVariante: quita una línea (aunque la variante ya no se venda).
-- Sin carrito o la variante no está en él → 50004. El cupón se conserva aunque el carrito quede
-- sin líneas elegibles: deja de descontar y el encabezado lo avisa.
-- Resultado: SP_Carrito_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_EliminarItem
    @IDUsuarioSolicitante INT              = NULL,
    @TokenInvitado        UNIQUEIDENTIFIER = NULL,
    @IDVariante           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCarrito INT;

    IF @IDUsuarioSolicitante IS NOT NULL
        SET @TokenInvitado = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuarioSolicitante IS NOT NULL
            EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, @TokenInvitado, 1, @IDCarrito OUTPUT;

        IF @IDCarrito IS NULL
            THROW 50004, N'El producto no está en el carrito.', 1;

        DELETE FROM dbo.CarritoDetalle
        WHERE IDCarrito = @IDCarrito
          AND IDVariante = @IDVariante;

        IF @@ROWCOUNT = 0
            THROW 50004, N'El producto no está en el carrito.', 1;

        UPDATE dbo.Carrito
        SET FechaUltimaActividad = SYSUTCDATETIME()
        WHERE IDCarrito = @IDCarrito;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Carrito_ObtenerPorId @IDCarrito = @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/carrito: quita todas las líneas y el cupón. El carrito sigue ACTIVO (vacío).
-- Sin carrito no es un error: devuelve el carrito vacío.
-- Resultado: SP_Carrito_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_Vaciar
    @IDUsuarioSolicitante INT              = NULL,
    @TokenInvitado        UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCarrito INT;

    IF @IDUsuarioSolicitante IS NOT NULL
        SET @TokenInvitado = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuarioSolicitante IS NOT NULL
            EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, @TokenInvitado, 1, @IDCarrito OUTPUT;

        IF @IDCarrito IS NOT NULL
        BEGIN
            DELETE FROM dbo.CarritoDetalle WHERE IDCarrito = @IDCarrito;

            UPDATE dbo.Carrito
            SET IDCupon = NULL,
                FechaUltimaActividad = SYSUTCDATETIME()
            WHERE IDCarrito = @IDCarrito;
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Carrito_ObtenerPorId @IDCarrito = @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Cupón aplicado
   ========================================================= */

-- POST /api/carrito/cupon: aplica un cupón al carrito del cliente; reemplaza al anterior.
--   @Codigo  código del cupón (sin distinguir mayúsculas ni tildes)
-- Orden de las validaciones (el primer motivo que falla es el que se responde):
--   50001  sin @IDUsuarioSolicitante (un invitado no aplica cupones, CK_Carrito_Cupon)
--   50004 / 50012  solicitante inexistente / desactivado (SP_Usuarios_ValidarSolicitante)
--   50001  código vacío
--   50001  el cliente no tiene carrito o su carrito no tiene líneas
--   50060  el código no existe
--   50061 … 50067  FU_Cupones_Validar, en su orden (inactivo, no vigente, vencido, agotado,
--                  límite por cliente, mínimo no alcanzado, no aplica)
-- No escribe bitácora (no modifica el cupón) ni cuenta un uso: eso ocurre al pagar.
-- Resultado: SP_Carrito_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_AplicarCupon
    @IDUsuarioSolicitante INT,
    @Codigo               NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCarrito INT, @IDCupon INT, @Error INT;
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Codigo = NULLIF(TRIM(@Codigo), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @IDUsuarioSolicitante IS NULL
            THROW 50001, N'Inicia sesión para aplicar un cupón.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Codigo IS NULL
            THROW 50001, N'El código del cupón es obligatorio.', 1;

        -- 2. Bloquear el carrito y después el cupón (orden Carrito → Cupon)
        EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 1, @IDCarrito OUTPUT;

        IF @IDCarrito IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.CarritoDetalle WHERE IDCarrito = @IDCarrito)
            THROW 50001, N'Tu carrito está vacío; agrega productos antes de aplicar un cupón.', 1;

        IF LEN(@Codigo) <= 30
            SELECT @IDCupon = IDCupon
            FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK)
            WHERE Codigo = @Codigo;

        IF @IDCupon IS NULL
        BEGIN
            SET @Mensaje = CONCAT(N'El cupón ', LEFT(@Codigo, 30), N' no existe.');
            THROW 50060, @Mensaje, 1;
        END;

        SELECT @Error = CodigoError, @Mensaje = MensajeError
        FROM dbo.FU_Cupones_Validar(@IDCupon, @IDUsuarioSolicitante, @IDCarrito);

        IF @Error IS NOT NULL
            THROW @Error, @Mensaje, 1;

        -- 3. Escribir
        UPDATE dbo.Carrito
        SET IDCupon = @IDCupon,
            FechaUltimaActividad = SYSUTCDATETIME()
        WHERE IDCarrito = @IDCarrito;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Carrito_ObtenerPorId @IDCarrito = @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/carrito/cupon: quita el cupón del carrito del cliente. Sin carrito o sin cupón no
-- es un error (no cambia nada). Sin @IDUsuarioSolicitante → 50001.
-- Resultado: SP_Carrito_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_QuitarCupon
    @IDUsuarioSolicitante INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCarrito INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuarioSolicitante IS NULL
            THROW 50001, N'Inicia sesión para gestionar el cupón del carrito.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 1, @IDCarrito OUTPUT;

        IF @IDCarrito IS NOT NULL
            UPDATE dbo.Carrito
            SET IDCupon = NULL,
                FechaUltimaActividad = SYSUTCDATETIME()
            WHERE IDCarrito = @IDCarrito
              AND IDCupon IS NOT NULL;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Carrito_ObtenerPorId @IDCarrito = @IDCarrito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Fusión
   ========================================================= */

-- POST /api/carrito/fusionar: pasa las líneas del carrito de invitado (@TokenInvitado) al carrito
-- ACTIVO del cliente (lo crea si hace falta) y marca el del invitado FUSIONADO.
-- Por cada variante del invitado:
--   - Vendible: la cantidad final es la del cliente más la del invitado, recortada a la
--     existencia disponible (excluye las reservas del carrito del cliente). Si el cliente ya
--     tenía más de lo disponible, su cantidad no se reduce. No falla por existencia: recorta.
--   - No vendible (variante, producto o categoría inactivos) o sin existencia: no se pasa.
-- El cupón del cliente se conserva (un invitado no tiene cupón). Las líneas del carrito
-- FUSIONADO se conservan como historial.
-- Token inexistente, de un carrito que ya no está ACTIVO o de un carrito de cliente: no cambia
-- nada y devuelve el carrito del cliente (o el vacío). Sin @IDUsuarioSolicitante o sin
-- @TokenInvitado → 50001.
-- Result sets: 1 y 2 de SP_Carrito_ObtenerPorId (carrito del cliente) y
--   3. Detalle de la fusión, una fila por variante del invitado: IDVariante, SKU,
--      CantidadInvitado, CantidadAnterior (la que tenía el cliente), CantidadFinal,
--      CantidadAgregada (CantidadFinal - CantidadAnterior), Recortada (1 si no se pasó todo).
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_FusionarInvitado
    @IDUsuarioSolicitante INT,
    @TokenInvitado        UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCarritoCliente INT, @IDCarritoInvitado INT;
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @Fusion TABLE (
        IDVariante       INT          NOT NULL PRIMARY KEY,
        SKU              NVARCHAR(50) NOT NULL,
        CantidadInvitado INT          NOT NULL,
        CantidadAnterior INT          NOT NULL,
        CantidadFinal    INT          NOT NULL
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @IDUsuarioSolicitante IS NULL
            THROW 50001, N'Inicia sesión para fusionar el carrito de invitado.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @TokenInvitado IS NULL
            THROW 50001, N'El token del carrito de invitado es obligatorio.', 1;

        -- 2. Bloquear: carrito del cliente, después el del invitado
        EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 1, @IDCarritoCliente OUTPUT;
        EXEC dbo.SP_Carrito_BuscarActivo NULL, @TokenInvitado, 1, @IDCarritoInvitado OUTPUT;

        IF @IDCarritoInvitado IS NOT NULL
        BEGIN
            INSERT INTO @Fusion (IDVariante, SKU, CantidadInvitado, CantidadAnterior, CantidadFinal)
            SELECT
                gi.IDVariante,
                v.SKU,
                gi.Cantidad,
                ISNULL(ci.Cantidad, 0),
                CASE
                    WHEN v.Activo = 0 OR p.Activo = 0 OR c.Activo = 0                               THEN ISNULL(ci.Cantidad, 0)
                    WHEN CONVERT(BIGINT, ISNULL(ci.Cantidad, 0)) + gi.Cantidad <= d.ExistenciaDisponible THEN ISNULL(ci.Cantidad, 0) + gi.Cantidad
                    WHEN ISNULL(ci.Cantidad, 0) >= d.ExistenciaDisponible                            THEN ISNULL(ci.Cantidad, 0)
                    ELSE d.ExistenciaDisponible
                END
            FROM dbo.CarritoDetalle AS gi
            INNER JOIN dbo.Variante AS v ON v.IDVariante = gi.IDVariante
            INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
            INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
            LEFT JOIN dbo.CarritoDetalle AS ci ON ci.IDCarrito = @IDCarritoCliente AND ci.IDVariante = gi.IDVariante
            CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(gi.IDVariante, @IDCarritoCliente) AS d
            WHERE gi.IDCarrito = @IDCarritoInvitado;

            -- 3. Escribir
            IF @IDCarritoCliente IS NULL AND EXISTS (SELECT 1 FROM @Fusion WHERE CantidadFinal > 0)
            BEGIN
                INSERT INTO dbo.Carrito (IDUsuario, TokenInvitado, Estado)
                VALUES (@IDUsuarioSolicitante, NULL, N'ACTIVO');

                SET @IDCarritoCliente = SCOPE_IDENTITY();
            END;

            UPDATE ci
            SET Cantidad = f.CantidadFinal
            FROM dbo.CarritoDetalle AS ci
            INNER JOIN @Fusion AS f ON f.IDVariante = ci.IDVariante
            WHERE ci.IDCarrito = @IDCarritoCliente
              AND f.CantidadAnterior > 0
              AND f.CantidadFinal <> f.CantidadAnterior;

            INSERT INTO dbo.CarritoDetalle (IDCarrito, IDVariante, Cantidad)
            SELECT @IDCarritoCliente, f.IDVariante, f.CantidadFinal
            FROM @Fusion AS f
            WHERE f.CantidadAnterior = 0
              AND f.CantidadFinal > 0
            ORDER BY f.IDVariante;

            UPDATE dbo.Carrito
            SET Estado = N'FUSIONADO',
                FechaUltimaActividad = @Ahora
            WHERE IDCarrito = @IDCarritoInvitado;

            IF @IDCarritoCliente IS NOT NULL
                UPDATE dbo.Carrito
                SET FechaUltimaActividad = @Ahora
                WHERE IDCarrito = @IDCarritoCliente;
        END;

        COMMIT TRANSACTION;

        -- 4. Resultado
        EXEC dbo.SP_Carrito_ObtenerPorId @IDCarrito = @IDCarritoCliente;

        SELECT
            IDVariante,
            SKU,
            CantidadInvitado,
            CantidadAnterior,
            CantidadFinal,
            CantidadFinal - CantidadAnterior AS CantidadAgregada,
            CONVERT(BIT, CASE WHEN CantidadFinal - CantidadAnterior < CantidadInvitado THEN 1 ELSE 0 END) AS Recortada
        FROM @Fusion
        ORDER BY IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
