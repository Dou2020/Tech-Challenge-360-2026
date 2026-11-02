/*
    013_sp_reportes.sql
    Stored procedures de reportes y dashboard (solo lectura, sin bitácora; solo Administrador desde la API).

    Reglas comunes:
      - Solo pedidos ENTREGADO y DEVUELTO_PARCIAL, sin cancelados, descontando lo devuelto
        (todo sale de VW_Reportes_VentasNetas).
      - @Desde y @Hasta son fechas LOCALES de Guatemala, ambas inclusivas (se comparan con la fecha
        local del pedido, no con UTC). NULL = sin límite. @Desde > @Hasta → 50001.
      - Ventas netas = subtotal − descuento − reembolsos, sin envío.
    Errores: 50001 VALIDACION.

    Sin objetos pendientes en este archivo.
    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

-- GET /api/reportes/resumen: una fila con los indicadores del dashboard.
--   VentasNetas       DECIMAL(12,2)  subtotal − descuento − reembolsos de los pedidos del rango
--   Pedidos           INT            pedidos completados del rango
--   TicketPromedio    DECIMAL(12,2)  VentasNetas / Pedidos (0 si no hay pedidos)
--   UnidadesNetas     INT            unidades vendidas menos devueltas
--   EnvioCobrado      DECIMAL(12,2)  CostoEnvio de esos pedidos (aparte, no suma a VentasNetas)
--   CarritosAbandonados INT          carritos ACTIVO con líneas y sin actividad por más de
--                                    Configuracion.HorasCarritoAbandonado cuya última actividad cae en
--                                    el rango (fecha local); igual criterio que SP_Reportes_CarritosAbandonados
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_ResumenDashboard
    @Desde DATE = NULL,
    @Hasta DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Desde IS NOT NULL AND @Hasta IS NOT NULL AND @Desde > @Hasta
        THROW 50001, N'La fecha inicial no puede ser posterior a la final.', 1;

    DECLARE @Horas INT = ISNULL((
        SELECT TOP (1) TRY_CONVERT(INT, Valor) FROM dbo.Configuracion
        WHERE Clave = N'HorasCarritoAbandonado' AND TRY_CONVERT(INT, Valor) > 0), 24);
    DECLARE @Limite DATETIME2(3) = DATEADD(HOUR, -@Horas, SYSUTCDATETIME());

    DECLARE @Ventas DECIMAL(12,2), @Pedidos INT, @Unidades INT, @Envio DECIMAL(12,2), @Abandonados INT;

    SELECT @Ventas   = CONVERT(DECIMAL(12,2), ISNULL(SUM(VentaNeta), 0)),
           @Pedidos  = COUNT(DISTINCT IDPedido),
           @Unidades = CONVERT(INT, ISNULL(SUM(UnidadesNetas), 0))
    FROM dbo.VW_Reportes_VentasNetas
    WHERE (@Desde IS NULL OR FechaLocal >= @Desde)
      AND (@Hasta IS NULL OR FechaLocal <= @Hasta);

    SELECT @Envio = CONVERT(DECIMAL(12,2), ISNULL(SUM(pe.CostoEnvio), 0))
    FROM dbo.Pedido AS pe
    WHERE pe.IDPedido IN (
        SELECT IDPedido FROM dbo.VW_Reportes_VentasNetas
        WHERE (@Desde IS NULL OR FechaLocal >= @Desde)
          AND (@Hasta IS NULL OR FechaLocal <= @Hasta));

    SELECT @Abandonados = COUNT(*)
    FROM dbo.Carrito AS c
    WHERE c.Estado = N'ACTIVO'
      AND c.FechaUltimaActividad < @Limite
      AND EXISTS (SELECT 1 FROM dbo.CarritoDetalle AS d WHERE d.IDCarrito = c.IDCarrito)
      AND (@Desde IS NULL OR CONVERT(DATE, c.FechaUltimaActividad AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time') >= @Desde)
      AND (@Hasta IS NULL OR CONVERT(DATE, c.FechaUltimaActividad AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time') <= @Hasta);

    SELECT
        @Ventas AS VentasNetas,
        @Pedidos AS Pedidos,
        CONVERT(DECIMAL(12,2), CASE WHEN @Pedidos > 0 THEN @Ventas / @Pedidos ELSE 0 END) AS TicketPromedio,
        @Unidades AS UnidadesNetas,
        @Envio AS EnvioCobrado,
        @Abandonados AS CarritosAbandonados;
END;
GO

-- GET /api/reportes/ventas: serie de ventas por periodo, ordenada por fecha ascendente.
--   @Agrupacion  dia | semana | mes (sin distinguir mayúsculas; por defecto dia; otro valor → 50001)
--   Semana: inicia el lunes (no depende de DATEFIRST). Mes: día 1. Todo en fecha local de Guatemala.
--   Solo salen los periodos con ventas (no se rellenan huecos).
-- Columnas: PeriodoInicio DATE, Ventas DECIMAL(12,2), Pedidos INT, UnidadesNetas INT.
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_VentasPorPeriodo
    @Agrupacion NVARCHAR(10) = N'dia',
    @Desde      DATE = NULL,
    @Hasta      DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SET @Agrupacion = LOWER(ISNULL(NULLIF(TRIM(@Agrupacion), N''), N'dia'));

    IF @Agrupacion NOT IN (N'dia', N'semana', N'mes')
        THROW 50001, N'La agrupación debe ser dia, semana o mes.', 1;

    IF @Desde IS NOT NULL AND @Hasta IS NOT NULL AND @Desde > @Hasta
        THROW 50001, N'La fecha inicial no puede ser posterior a la final.', 1;

    SELECT
        x.PeriodoInicio,
        CONVERT(DECIMAL(12,2), SUM(v.VentaNeta))    AS Ventas,
        COUNT(DISTINCT v.IDPedido)                  AS Pedidos,
        CONVERT(INT, SUM(v.UnidadesNetas))          AS UnidadesNetas
    FROM dbo.VW_Reportes_VentasNetas AS v
    CROSS APPLY (
        SELECT CASE @Agrupacion
            WHEN N'dia'    THEN v.FechaLocal
            -- 1900-01-01 fue lunes: el resto de la división es los días desde el lunes
            WHEN N'semana' THEN DATEADD(DAY, -(DATEDIFF(DAY, '19000101', v.FechaLocal) % 7), v.FechaLocal)
            ELSE DATEFROMPARTS(YEAR(v.FechaLocal), MONTH(v.FechaLocal), 1)
        END AS PeriodoInicio
    ) AS x
    WHERE (@Desde IS NULL OR v.FechaLocal >= @Desde)
      AND (@Hasta IS NULL OR v.FechaLocal <= @Hasta)
    GROUP BY x.PeriodoInicio
    ORDER BY x.PeriodoInicio;
END;
GO

-- GET /api/reportes/ventas-por-categoria: ventas netas por categoría (VW_Dashboard_VentasPorCategoria),
-- de mayor a menor venta (desempata por nombre). Solo categorías con ventas en el rango.
-- Columnas: IDCategoria INT, Categoria NVARCHAR(100), UnidadesVendidas INT, UnidadesDevueltas INT,
-- UnidadesNetas INT, VentaBruta DECIMAL(12,2) (antes de reembolsos), MontoReembolsado DECIMAL(12,2),
-- VentaNeta DECIMAL(12,2).
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_VentasPorCategoria
    @Desde DATE = NULL,
    @Hasta DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Desde IS NOT NULL AND @Hasta IS NOT NULL AND @Desde > @Hasta
        THROW 50001, N'La fecha inicial no puede ser posterior a la final.', 1;

    SELECT
        IDCategoria,
        Categoria,
        CONVERT(INT, SUM(UnidadesVendidas))               AS UnidadesVendidas,
        CONVERT(INT, SUM(UnidadesDevueltas))              AS UnidadesDevueltas,
        CONVERT(INT, SUM(UnidadesNetas))                  AS UnidadesNetas,
        CONVERT(DECIMAL(12,2), SUM(VentaBruta))           AS VentaBruta,
        CONVERT(DECIMAL(12,2), SUM(MontoReembolsado))     AS MontoReembolsado,
        CONVERT(DECIMAL(12,2), SUM(VentaNeta))            AS VentaNeta
    FROM dbo.VW_Dashboard_VentasPorCategoria
    WHERE (@Desde IS NULL OR FechaLocal >= @Desde)
      AND (@Hasta IS NULL OR FechaLocal <= @Hasta)
    GROUP BY IDCategoria, Categoria
    ORDER BY SUM(VentaNeta) DESC, Categoria;
END;
GO

-- GET /api/reportes/productos-mas-vendidos: top de productos (no variantes) por unidades netas,
-- desempata por venta neta y luego IDProducto. @Limite 1 a 100 (por defecto 10; otro valor → 50001).
-- Columnas: IDProducto INT, Producto NVARCHAR(150), IDCategoria INT, Categoria NVARCHAR(100),
-- UnidadesNetas INT, VentaNeta DECIMAL(12,2). Se omiten productos con 0 unidades netas.
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_ProductosMasVendidos
    @Limite INT  = 10,
    @Desde  DATE = NULL,
    @Hasta  DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Limite IS NULL OR @Limite NOT BETWEEN 1 AND 100
        THROW 50001, N'El límite debe estar entre 1 y 100.', 1;

    IF @Desde IS NOT NULL AND @Hasta IS NOT NULL AND @Desde > @Hasta
        THROW 50001, N'La fecha inicial no puede ser posterior a la final.', 1;

    SELECT TOP (@Limite)
        IDProducto,
        Producto,
        IDCategoria,
        Categoria,
        CONVERT(INT, SUM(UnidadesNetas))      AS UnidadesNetas,
        CONVERT(DECIMAL(12,2), SUM(VentaNeta)) AS VentaNeta
    FROM dbo.VW_Reportes_VentasNetas
    WHERE (@Desde IS NULL OR FechaLocal >= @Desde)
      AND (@Hasta IS NULL OR FechaLocal <= @Hasta)
    GROUP BY IDProducto, Producto, IDCategoria, Categoria
    HAVING SUM(UnidadesNetas) > 0
    ORDER BY SUM(UnidadesNetas) DESC, SUM(VentaNeta) DESC, IDProducto;
END;
GO

-- GET /api/reportes/carritos-abandonados: carritos ACTIVO con al menos una línea y sin actividad por
-- más de Configuracion.HorasCarritoAbandonado (24 si falta o no es válido). Cliente o invitado.
--   @Desde, @Hasta  fecha local de la última actividad, inclusivos
--   @Orden          fecha | valor | unidades | cliente, con :asc o :desc (por defecto fecha:asc, el más
--                   antiguo primero); desempata por IDCarrito
-- Primer result set: IDCarrito INT, IDUsuario INT NULL, Tipo NVARCHAR(9) ('CLIENTE'/'INVITADO'),
-- Cliente NVARCHAR(201) NULL (nombre y apellido), Correo NVARCHAR(150) NULL, CantidadLineas INT,
-- CantidadUnidades INT, Subtotal DECIMAL(12,2), Descuento DECIMAL(12,2), Valor DECIMAL(12,2)
-- (FU_Carrito_CalcularTotales sin envío: Subtotal − Descuento), FechaCreacion DATETIME2(3),
-- FechaUltimaActividad DATETIME2(3) (UTC), HorasInactivo INT. Segundo: Total BIGINT.
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_CarritosAbandonados
    @Desde        DATE          = NULL,
    @Hasta        DATE          = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'fecha:asc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'fecha:asc', N'fecha:desc', N'valor:asc', N'valor:desc',
                      N'unidades:asc', N'unidades:desc', N'cliente:asc', N'cliente:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa fecha, valor, unidades o cliente con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    IF @Desde IS NOT NULL AND @Hasta IS NOT NULL AND @Desde > @Hasta
        THROW 50001, N'La fecha inicial no puede ser posterior a la final.', 1;

    DECLARE @Horas INT = ISNULL((
        SELECT TOP (1) TRY_CONVERT(INT, Valor) FROM dbo.Configuracion
        WHERE Clave = N'HorasCarritoAbandonado' AND TRY_CONVERT(INT, Valor) > 0), 24);
    DECLARE @Ahora  DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @Limite DATETIME2(3) = DATEADD(HOUR, -@Horas, @Ahora);

    CREATE TABLE #Abandonados (
        IDCarrito            INT           NOT NULL PRIMARY KEY,
        IDUsuario            INT           NULL,
        Tipo                 NVARCHAR(9)   NOT NULL,
        Cliente              NVARCHAR(201) NULL,
        Correo               NVARCHAR(150) NULL,
        CantidadLineas       INT           NOT NULL,
        CantidadUnidades     INT           NOT NULL,
        Subtotal             DECIMAL(12,2) NOT NULL,
        Descuento            DECIMAL(12,2) NOT NULL,
        Valor                DECIMAL(12,2) NOT NULL,
        FechaCreacion        DATETIME2(3)  NOT NULL,
        FechaUltimaActividad DATETIME2(3)  NOT NULL,
        HorasInactivo        INT           NOT NULL
    );

    INSERT INTO #Abandonados
    SELECT
        c.IDCarrito,
        c.IDUsuario,
        CASE WHEN c.IDUsuario IS NULL THEN N'INVITADO' ELSE N'CLIENTE' END,
        CASE WHEN u.IDUsuario IS NOT NULL THEN CONCAT(u.Nombre, N' ', u.Apellido) END,
        u.Correo,
        t.CantidadLineas,
        t.CantidadUnidades,
        t.Subtotal,
        t.Descuento,
        t.Total,
        c.FechaCreacion,
        c.FechaUltimaActividad,
        DATEDIFF(HOUR, c.FechaUltimaActividad, @Ahora)
    FROM dbo.Carrito AS c
    LEFT JOIN dbo.Usuario AS u ON u.IDUsuario = c.IDUsuario
    CROSS APPLY dbo.FU_Carrito_CalcularTotales(c.IDCarrito, NULL) AS t
    WHERE c.Estado = N'ACTIVO'
      AND c.FechaUltimaActividad < @Limite
      AND t.CantidadLineas > 0
      AND (@Desde IS NULL OR CONVERT(DATE, c.FechaUltimaActividad AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time') >= @Desde)
      AND (@Hasta IS NULL OR CONVERT(DATE, c.FechaUltimaActividad AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time') <= @Hasta);

    SELECT *
    FROM #Abandonados
    ORDER BY
        CASE WHEN @Orden = N'fecha:asc'     THEN FechaUltimaActividad END ASC,
        CASE WHEN @Orden = N'fecha:desc'    THEN FechaUltimaActividad END DESC,
        CASE WHEN @Orden = N'valor:asc'     THEN Valor END ASC,
        CASE WHEN @Orden = N'valor:desc'    THEN Valor END DESC,
        CASE WHEN @Orden = N'unidades:asc'  THEN CantidadUnidades END ASC,
        CASE WHEN @Orden = N'unidades:desc' THEN CantidadUnidades END DESC,
        CASE WHEN @Orden = N'cliente:asc'   THEN Cliente END ASC,
        CASE WHEN @Orden = N'cliente:desc'  THEN Cliente END DESC,
        CASE WHEN @Orden LIKE N'%:desc'     THEN IDCarrito END DESC,
        IDCarrito ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT_BIG(*) AS Total FROM #Abandonados;
END;
GO
