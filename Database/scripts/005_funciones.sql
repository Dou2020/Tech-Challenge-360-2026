/*
    005_funciones.sql
    Funciones tipo tabla (FU_). Todas son inline (RETURN SELECT): el optimizador las expande
    dentro de la consulta que las usa, como si fueran una vista con parámetros.

    Para varias filas se usan con CROSS APPLY / OUTER APPLY, por ejemplo:
        FROM dbo.Variante AS v
        CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(v.IDVariante, NULL) AS d

    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Sistema
   ========================================================= */

-- Patrón LIKE para las búsquedas por texto de los listados (parámetro q de la API).
-- Escapa los comodines de LIKE ([, %, _) para que el texto se busque literal: buscar "50%"
-- no debe traer todo lo que empiece por 50. Devuelve NULL si el texto viene vacío.
-- No es SQL dinámico: el patrón se usa como valor en "Columna LIKE @Patron".
CREATE OR ALTER FUNCTION dbo.FU_Sistema_PatronBusqueda (@Texto NVARCHAR(200))
RETURNS TABLE
AS
RETURN
    SELECT
        CASE
            WHEN NULLIF(TRIM(@Texto), N'') IS NULL THEN NULL
            ELSE N'%' + REPLACE(REPLACE(REPLACE(TRIM(@Texto), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%'
        END AS Patron;
GO

/* =========================================================
   Inventario
   ========================================================= */

-- Existencia disponible de una variante: física menos las reservas vigentes.
-- Una reserva cuenta solo si está ACTIVA y no ha vencido, aunque el job que las libera
-- (SP_Inventario_LiberarReservasVencidas) todavía no haya corrido. Por eso no usa el saldo
-- Variante.ExistenciaReservada, que incluye las vencidas hasta que el job las libera.
-- @IDCarritoExcluido: las reservas de ese carrito no se restan (el checkout de un carrito no
-- compite con su propia reserva). NULL resta todas.
-- No mira Variante.Activo: quien la usa decide si muestra variantes inactivas.
CREATE OR ALTER FUNCTION dbo.FU_Inventario_ExistenciaDisponible (
    @IDVariante        INT,
    @IDCarritoExcluido INT
)
RETURNS TABLE
AS
RETURN
    SELECT
        v.IDVariante,
        v.ExistenciaFisica,
        ISNULL(r.Cantidad, 0) AS ExistenciaReservada,
        CASE
            WHEN v.ExistenciaFisica > ISNULL(r.Cantidad, 0) THEN v.ExistenciaFisica - ISNULL(r.Cantidad, 0)
            ELSE 0
        END AS ExistenciaDisponible
    FROM dbo.Variante AS v
    OUTER APPLY (
        SELECT SUM(re.Cantidad) AS Cantidad
        FROM dbo.ReservaExistencia AS re
        WHERE re.IDVariante = v.IDVariante
          AND re.Estado = N'ACTIVA'
          AND re.FechaExpiracion > SYSUTCDATETIME()
          AND (@IDCarritoExcluido IS NULL OR re.IDCarrito <> @IDCarritoExcluido)
    ) AS r
    WHERE v.IDVariante = @IDVariante;
GO

/* =========================================================
   Catálogo
   ========================================================= */

-- Texto de los valores de atributo de una variante, en el orden en que se crearon los atributos:
-- "Talla M / Color Negro". Siempre devuelve una fila; Descripcion es NULL si la variante no
-- tiene valores. Lo usan el catálogo, el carrito y la copia PedidoDetalle.DescripcionVariante.
CREATE OR ALTER FUNCTION dbo.FU_Catalogo_DescripcionVariante (@IDVariante INT)
RETURNS TABLE
AS
RETURN
    SELECT
        CONVERT(NVARCHAR(200),
            STRING_AGG(CONCAT(a.Nombre, N' ', va.Valor), N' / ') WITHIN GROUP (ORDER BY a.IDAtributo)
        ) AS Descripcion
    FROM dbo.VarianteValorAtributo AS vva
    INNER JOIN dbo.ValorAtributo AS va ON va.IDValorAtributo = vva.IDValorAtributo
    INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vva.IDAtributo
    WHERE vva.IDVariante = @IDVariante;
GO

-- Lee un arreglo JSON de IDValorAtributo ("[2, 12]") de SP_Productos_Crear, SP_Variantes_Crear
-- y SP_Variantes_Actualizar. Una fila por elemento:
--   Posicion         índice del elemento en el arreglo (desde 0)
--   IDValorAtributo  NULL si el elemento no es un número entero
--   IDAtributo       atributo del valor; NULL si el valor no existe
-- El SP valida antes que @Valores sea un arreglo JSON (OPENJSON falla con un JSON inválido)
-- y después rechaza con 50001 los elementos inválidos, los inexistentes y los atributos repetidos.
CREATE OR ALTER FUNCTION dbo.FU_Catalogo_LeerValoresAtributo (@Valores NVARCHAR(MAX))
RETURNS TABLE
AS
RETURN
    SELECT
        TRY_CONVERT(INT, j.[key]) AS Posicion,
        x.IDValorAtributo,
        va.IDAtributo
    FROM OPENJSON(@Valores) AS j
    CROSS APPLY (
        SELECT CASE WHEN j.[type] = 2 THEN TRY_CONVERT(INT, j.[value]) END AS IDValorAtributo
    ) AS x
    LEFT JOIN dbo.ValorAtributo AS va ON va.IDValorAtributo = x.IDValorAtributo;
GO

-- Foto JSON de una variante para la bitácora (ValorAnterior / ValorNuevo).
-- Una fila; Json es NULL si la variante no existe.
CREATE OR ALTER FUNCTION dbo.FU_Catalogo_VarianteJson (@IDVariante INT)
RETURNS TABLE
AS
RETURN
    SELECT (
        SELECT
            v.IDVariante,
            v.IDProducto,
            v.SKU,
            v.Precio,
            v.ExistenciaFisica,
            v.Activo,
            d.Descripcion,
            (
                SELECT vva.IDAtributo, a.Nombre AS Atributo, vva.IDValorAtributo, va.Valor
                FROM dbo.VarianteValorAtributo AS vva
                INNER JOIN dbo.ValorAtributo AS va ON va.IDValorAtributo = vva.IDValorAtributo
                INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vva.IDAtributo
                WHERE vva.IDVariante = v.IDVariante
                ORDER BY vva.IDAtributo
                FOR JSON PATH
            ) AS Valores
        FROM dbo.Variante AS v
        OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(v.IDVariante) AS d
        WHERE v.IDVariante = @IDVariante
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    ) AS Json;
GO

-- Foto JSON de un producto para la bitácora. Con @IncluirVariantes = 1 agrega el arreglo
-- Variantes (cada una como en FU_Catalogo_VarianteJson): se usa al crear y al eliminar.
-- Una fila; Json es NULL si el producto no existe.
CREATE OR ALTER FUNCTION dbo.FU_Catalogo_ProductoJson (
    @IDProducto       INT,
    @IncluirVariantes BIT
)
RETURNS TABLE
AS
RETURN
    SELECT (
        SELECT
            p.IDProducto,
            p.IDCategoria,
            c.Nombre AS Categoria,
            p.Nombre,
            p.Descripcion,
            p.Activo,
            JSON_QUERY(CASE WHEN @IncluirVariantes = 1 THEN (
                SELECT N'[' + STRING_AGG(vj.Json, N',') WITHIN GROUP (ORDER BY v.IDVariante) + N']'
                FROM dbo.Variante AS v
                CROSS APPLY dbo.FU_Catalogo_VarianteJson(v.IDVariante) AS vj
                WHERE v.IDProducto = p.IDProducto
            ) END) AS Variantes
        FROM dbo.Producto AS p
        INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
        WHERE p.IDProducto = @IDProducto
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    ) AS Json;
GO

/* =========================================================
   Cupones y carrito
   =========================================================
   El cálculo de montos del carrito vive solo aquí. Lo usan el carrito (010_sp_carrito.sql), el
   resumen del checkout y SP_Pedidos_CrearPedido, así el total que ve el cliente es el mismo que
   se cobra y se guarda en Pedido / PedidoDetalle.

   Reglas:
     - Importe de una línea = Variante.Precio vigente * Cantidad. Los precios ya incluyen IVA.
     - Subtotal = suma de los importes de todas las líneas del carrito (también las que tienen
       una variante inactiva o una cantidad mayor a la disponible: el carrito las marca y el
       checkout las rechaza, así que al pagar todas las líneas son vendibles).
     - Líneas elegibles: todas si el cupón no tiene categoría; si la tiene, solo las de productos
       de esa categoría (categoría vigente del producto). Subtotal elegible = suma de sus importes.
     - Descuento PORCENTAJE = ROUND(SubtotalElegible * Valor / 100, 2): redondeo a 2 decimales,
       mitad hacia arriba (ROUND de SQL Server sobre DECIMAL). Valor <= 100 (CK_Cupon_Valor),
       así que nunca supera el subtotal elegible.
     - Descuento MONTO_FIJO = el menor entre Valor y el subtotal elegible.
     - Reparto por línea (PedidoDetalle.DescuentoLinea): proporcional al importe de cada línea
       elegible, truncado a centavos; los centavos que faltan para llegar al descuento total se
       asignan de uno en uno a las líneas con mayor fracción truncada (desempate por
       IDCarritoDetalle). La suma de DescuentoLinea es exactamente el descuento y ninguna línea
       recibe más que su importe.
     - Total = Subtotal - Descuento + CostoEnvio, nunca negativo.
     - IVA incluido (desglose, no recargo): MontoIVA = Total - ROUND(Total * 100 / (100 + PorcentajeIVA), 2),
       con PorcentajeIVA de Configuracion (12.00 si falta o no es un número entre 0 y 100).
     - Monto mínimo del cupón: se compara con el Subtotal de todo el carrito, antes del
       descuento ("compra mínima"), no con el subtotal elegible.
*/

-- Descuento de un cupón sobre las líneas de un carrito. Una fila por línea del carrito:
--   IDCarritoDetalle, IDVariante, IDCategoria, Cantidad, PrecioUnitario (precio vigente),
--   Importe, Elegible (1 si el cupón aplica a la línea), DescuentoLinea, ImporteNeto
--   (Importe - DescuentoLinea).
-- Solo calcula: no revisa si el cupón está activo, vigente o agotado (eso es
-- FU_Cupones_Validar). Con @IDCupon NULL o inexistente, DescuentoLinea es 0 en todas las líneas.
CREATE OR ALTER FUNCTION dbo.FU_Cupones_CalculoDescuento (
    @IDCarrito INT,
    @IDCupon   INT
)
RETURNS TABLE
AS
RETURN
    WITH Linea AS (
        SELECT
            cd.IDCarritoDetalle,
            cd.IDVariante,
            p.IDCategoria,
            cd.Cantidad,
            v.Precio                                       AS PrecioUnitario,
            CONVERT(DECIMAL(12,2), v.Precio * cd.Cantidad) AS Importe,
            CONVERT(BIT, CASE
                WHEN cu.IDCupon IS NOT NULL AND (cu.IDCategoria IS NULL OR cu.IDCategoria = p.IDCategoria) THEN 1
                ELSE 0
            END)                                           AS Elegible,
            cu.TipoDescuento,
            cu.Valor
        FROM dbo.CarritoDetalle AS cd
        INNER JOIN dbo.Variante AS v ON v.IDVariante = cd.IDVariante
        INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
        LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = @IDCupon
        WHERE cd.IDCarrito = @IDCarrito
    ),
    Base AS (
        SELECT
            l.*,
            CONVERT(DECIMAL(14,2), SUM(CASE WHEN l.Elegible = 1 THEN l.Importe ELSE 0 END) OVER ()) AS SubtotalElegible
        FROM Linea AS l
    ),
    Monto AS (
        SELECT
            b.*,
            CONVERT(DECIMAL(12,2), CASE
                WHEN b.SubtotalElegible = 0               THEN 0
                WHEN b.TipoDescuento = N'PORCENTAJE'      THEN ROUND(b.SubtotalElegible * b.Valor / 100, 2)
                WHEN b.TipoDescuento = N'MONTO_FIJO'      THEN CASE WHEN b.Valor < b.SubtotalElegible THEN b.Valor ELSE b.SubtotalElegible END
                ELSE 0
            END) AS DescuentoTotal
        FROM Base AS b
    ),
    Reparto AS (
        SELECT
            m.*,
            x.Proporcional,
            CONVERT(DECIMAL(12,2), ROUND(x.Proporcional, 2, 1)) AS Piso  -- truncado a centavos
        FROM Monto AS m
        CROSS APPLY (
            SELECT CASE
                WHEN m.Elegible = 1 AND m.SubtotalElegible > 0
                    THEN m.DescuentoTotal * m.Importe / m.SubtotalElegible
                ELSE 0
            END AS Proporcional
        ) AS x
    ),
    Resto AS (
        SELECT
            r.*,
            CONVERT(INT, (r.DescuentoTotal - SUM(r.Piso) OVER ()) * 100) AS CentavosPendientes,
            ROW_NUMBER() OVER (
                ORDER BY r.Elegible DESC, r.Proporcional - r.Piso DESC, r.IDCarritoDetalle
            ) AS Turno
        FROM Reparto AS r
    ),
    Final AS (
        SELECT
            s.IDCarritoDetalle,
            s.IDVariante,
            s.IDCategoria,
            s.Cantidad,
            s.PrecioUnitario,
            s.Importe,
            s.Elegible,
            CONVERT(DECIMAL(12,2), s.Piso + CASE
                WHEN s.Elegible = 1 AND s.Turno <= s.CentavosPendientes THEN 0.01
                ELSE 0
            END) AS DescuentoLinea
        FROM Resto AS s
    )
    SELECT
        IDCarritoDetalle,
        IDVariante,
        IDCategoria,
        Cantidad,
        PrecioUnitario,
        Importe,
        Elegible,
        DescuentoLinea,
        CONVERT(DECIMAL(12,2), Importe - DescuentoLinea) AS ImporteNeto
    FROM Final;
GO

-- ¿Puede el cliente usar el cupón en este carrito? Una fila siempre (aunque el cupón no exista).
--   CodigoError   NULL si el cupón aplica; si no, el número de THROW del primer motivo, en este
--                 orden estable:
--                   50060 CUPON_NO_EXISTE            @IDCupon NULL o inexistente
--                   50061 CUPON_INACTIVO             Activo = 0
--                   50062 CUPON_NO_VIGENTE           ahora < FechaInicio
--                   50063 CUPON_VENCIDO              ahora > FechaFin
--                   50064 CUPON_AGOTADO              UsosActuales >= LimiteUsosTotal
--                   50065 CUPON_LIMITE_CLIENTE       usos del cliente >= LimiteUsosPorCliente
--                   50066 CUPON_MINIMO_NO_ALCANZADO  Subtotal del carrito < MontoMinimo
--                   50067 CUPON_NO_APLICA            ninguna línea elegible (incluye carrito vacío)
--   MensajeError  texto en español para el cliente (lo usa el THROW de SP_Carrito_AplicarCupon y
--                 el aviso del carrito cuando un cupón aplicado deja de valer).
-- La vigencia es inclusiva: FechaInicio <= ahora <= FechaFin (UTC).
-- Usos del cliente: filas de UsoCupon del cupón y del cliente cuyo pedido no está CANCELADO
-- (cancelar ya borra la fila; el filtro por estado es una segunda barrera).
-- Con @IDUsuario NULL no se cuentan usos: quien la llama exige un cliente antes (un invitado no
-- aplica cupones, CK_Carrito_Cupon).
-- No bloquea nada: el SP que la usa bloquea antes el carrito y el cupón.
CREATE OR ALTER FUNCTION dbo.FU_Cupones_Validar (
    @IDCupon   INT,
    @IDUsuario INT,
    @IDCarrito INT
)
RETURNS TABLE
AS
RETURN
    SELECT
        x.IDCupon,
        cu.Codigo,
        CONVERT(DECIMAL(12,2), ISNULL(b.Subtotal, 0))         AS Subtotal,
        CONVERT(DECIMAL(12,2), ISNULL(b.SubtotalElegible, 0)) AS SubtotalElegible,
        ISNULL(b.LineasElegibles, 0)                          AS LineasElegibles,
        u.UsosCliente,
        e.CodigoError,
        CONVERT(NVARCHAR(400), CASE e.CodigoError
            WHEN 50060 THEN N'El cupón no existe.'
            WHEN 50061 THEN CONCAT(N'El cupón ', cu.Codigo, N' no está activo.')
            WHEN 50062 THEN CONCAT(N'El cupón ', cu.Codigo, N' todavía no está vigente.')
            WHEN 50063 THEN CONCAT(N'El cupón ', cu.Codigo, N' ya venció.')
            WHEN 50064 THEN CONCAT(N'El cupón ', cu.Codigo, N' ya alcanzó su límite de usos.')
            WHEN 50065 THEN CONCAT(N'Ya usaste el cupón ', cu.Codigo, N' el máximo de veces permitido (',
                                   cu.LimiteUsosPorCliente, N').')
            WHEN 50066 THEN CONCAT(N'El cupón ', cu.Codigo, N' requiere una compra mínima de Q', cu.MontoMinimo,
                                   N'; tu carrito suma Q', CONVERT(DECIMAL(12,2), ISNULL(b.Subtotal, 0)), N'.')
            WHEN 50067 THEN CASE
                                WHEN cu.IDCategoria IS NULL THEN CONCAT(N'El cupón ', cu.Codigo, N' no aplica: tu carrito está vacío.')
                                ELSE CONCAT(N'El cupón ', cu.Codigo, N' solo aplica a productos de la categoría ',
                                            cat.Nombre, N' y tu carrito no tiene ninguno.')
                            END
        END) AS MensajeError
    FROM (SELECT @IDCupon AS IDCupon, SYSUTCDATETIME() AS Ahora) AS x
    LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = x.IDCupon
    LEFT JOIN dbo.Categoria AS cat ON cat.IDCategoria = cu.IDCategoria
    OUTER APPLY (
        SELECT
            SUM(d.Importe)                                          AS Subtotal,
            SUM(CASE WHEN d.Elegible = 1 THEN d.Importe ELSE 0 END) AS SubtotalElegible,
            SUM(CONVERT(INT, d.Elegible))                           AS LineasElegibles
        FROM dbo.FU_Cupones_CalculoDescuento(@IDCarrito, @IDCupon) AS d
    ) AS b
    OUTER APPLY (
        SELECT COUNT(*) AS UsosCliente
        FROM dbo.UsoCupon AS uc
        INNER JOIN dbo.Pedido AS p ON p.IDPedido = uc.IDPedido
        INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
        WHERE uc.IDCupon = @IDCupon
          AND uc.IDUsuario = @IDUsuario
          AND ep.Codigo <> N'CANCELADO'
    ) AS u
    CROSS APPLY (
        SELECT CASE
            WHEN cu.IDCupon IS NULL                                  THEN 50060
            WHEN cu.Activo = 0                                       THEN 50061
            WHEN x.Ahora < cu.FechaInicio                            THEN 50062
            WHEN x.Ahora > cu.FechaFin                               THEN 50063
            WHEN cu.UsosActuales >= cu.LimiteUsosTotal               THEN 50064
            WHEN u.UsosCliente >= cu.LimiteUsosPorCliente            THEN 50065
            WHEN ISNULL(b.Subtotal, 0) < cu.MontoMinimo              THEN 50066
            WHEN ISNULL(b.LineasElegibles, 0) = 0                    THEN 50067
        END AS CodigoError
    ) AS e;
GO

-- Montos de un carrito. Una fila siempre; si el carrito no existe, todo en 0.
--   @CostoEnvio  costo del método de envío (checkout); NULL o 0 en el carrito.
-- Columnas: IDCarrito, IDCupon (el guardado en el carrito), CuponAplicado (1 si el cupón sigue
-- siendo válido: FU_Cupones_Validar sin error), CodigoErrorCupon y MensajeErrorCupon (por qué el
-- cupón guardado ya no aplica; NULL si aplica o no hay cupón), CantidadLineas, CantidadUnidades,
-- Subtotal, Descuento (0 si el cupón no aplica), CostoEnvio, Total, PorcentajeIVA, MontoIVA.
-- Un cupón que dejó de valer (venció, se desactivó, se quitaron las líneas de su categoría…) no
-- descuenta, pero sigue guardado en el carrito: el cliente ve el aviso y lo quita o lo cambia.
CREATE OR ALTER FUNCTION dbo.FU_Carrito_CalcularTotales (
    @IDCarrito  INT,
    @CostoEnvio DECIMAL(12,2)
)
RETURNS TABLE
AS
RETURN
    SELECT
        c.IDCarrito,
        c.IDCupon,
        a.CuponAplicado,
        CASE WHEN c.IDCupon IS NOT NULL THEN v.CodigoError END  AS CodigoErrorCupon,
        CASE WHEN c.IDCupon IS NOT NULL THEN v.MensajeError END AS MensajeErrorCupon,
        ISNULL(l.CantidadLineas, 0)                             AS CantidadLineas,
        ISNULL(l.CantidadUnidades, 0)                           AS CantidadUnidades,
        s.Subtotal,
        s.Descuento,
        s.CostoEnvio,
        t.Total,
        i.PorcentajeIVA,
        CONVERT(DECIMAL(12,2), t.Total - ROUND(t.Total * 100 / (100 + i.PorcentajeIVA), 2)) AS MontoIVA
    FROM (SELECT @IDCarrito AS IDCarrito) AS x
    LEFT JOIN dbo.Carrito AS c ON c.IDCarrito = x.IDCarrito
    OUTER APPLY dbo.FU_Cupones_Validar(c.IDCupon, c.IDUsuario, c.IDCarrito) AS v
    CROSS APPLY (
        SELECT CONVERT(BIT, CASE WHEN c.IDCupon IS NOT NULL AND v.CodigoError IS NULL THEN 1 ELSE 0 END) AS CuponAplicado
    ) AS a
    OUTER APPLY (
        SELECT
            COUNT(*)            AS CantidadLineas,
            SUM(d.Cantidad)     AS CantidadUnidades,
            SUM(d.Importe)      AS Subtotal,
            SUM(d.DescuentoLinea) AS Descuento
        FROM dbo.FU_Cupones_CalculoDescuento(c.IDCarrito, CASE WHEN a.CuponAplicado = 1 THEN c.IDCupon END) AS d
    ) AS l
    CROSS APPLY (
        SELECT
            CONVERT(DECIMAL(12,2), ISNULL(l.Subtotal, 0))   AS Subtotal,
            CONVERT(DECIMAL(12,2), ISNULL(l.Descuento, 0))  AS Descuento,
            CONVERT(DECIMAL(12,2), CASE WHEN @CostoEnvio > 0 THEN @CostoEnvio ELSE 0 END) AS CostoEnvio
    ) AS s
    CROSS APPLY (
        SELECT CONVERT(DECIMAL(12,2), s.Subtotal - s.Descuento + s.CostoEnvio) AS Total
    ) AS t
    CROSS APPLY (
        SELECT ISNULL((
            SELECT TOP (1) TRY_CONVERT(DECIMAL(5,2), cf.Valor)
            FROM dbo.Configuracion AS cf
            WHERE cf.Clave = N'PorcentajeIVA'
              AND TRY_CONVERT(DECIMAL(5,2), cf.Valor) BETWEEN 0 AND 100
        ), CONVERT(DECIMAL(5,2), 12.00)) AS PorcentajeIVA
    ) AS i;
GO

-- Foto JSON de un cupón para la bitácora (ValorAnterior / ValorNuevo). Una fila; Json es NULL si
-- el cupón no existe.
CREATE OR ALTER FUNCTION dbo.FU_Cupones_CuponJson (@IDCupon INT)
RETURNS TABLE
AS
RETURN
    SELECT (
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
            cu.Activo
        FROM dbo.Cupon AS cu
        LEFT JOIN dbo.Categoria AS cat ON cat.IDCategoria = cu.IDCategoria
        WHERE cu.IDCupon = @IDCupon
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    ) AS Json;
GO

/* =========================================================
   Checkout y pedidos
   ========================================================= */

-- ¿La reserva ACTIVA y no vencida del carrito cubre exactamente sus líneas? Una fila siempre.
--   LineasSinReserva   líneas del carrito sin reserva vigente de la misma cantidad
--   ReservasSobrantes  reservas vigentes de variantes que ya no están en el carrito
--   ReservaExpiraEn    la expiración más próxima de las reservas vigentes (NULL si no hay)
--   Vigente            1 si el carrito tiene líneas, ninguna sin reserva y ninguna reserva sobrante
-- Una reserva vencida cuenta como inexistente aunque el job no la haya liberado. La usan
-- SP_Checkout_ObtenerResumen y SP_Pedidos_CrearPedido (esta última después de bloquear las
-- variantes del carrito, así el resultado ya no cambia hasta el COMMIT).
CREATE OR ALTER FUNCTION dbo.FU_Checkout_EstadoReserva (@IDCarrito INT)
RETURNS TABLE
AS
RETURN
    SELECT
        s.LineasSinReserva,
        s.ReservasSobrantes,
        s.ReservaExpiraEn,
        CONVERT(BIT, CASE
            WHEN l.Lineas > 0 AND s.LineasSinReserva = 0 AND s.ReservasSobrantes = 0 THEN 1
            ELSE 0
        END) AS Vigente
    FROM (SELECT SYSUTCDATETIME() AS Ahora) AS a
    CROSS APPLY (
        SELECT COUNT(*) AS Lineas
        FROM dbo.CarritoDetalle
        WHERE IDCarrito = @IDCarrito
    ) AS l
    CROSS APPLY (
        SELECT
            (SELECT COUNT(*)
             FROM dbo.CarritoDetalle AS cd
             WHERE cd.IDCarrito = @IDCarrito
               AND NOT EXISTS (
                    SELECT 1
                    FROM dbo.ReservaExistencia AS r
                    WHERE r.IDCarrito = cd.IDCarrito
                      AND r.IDVariante = cd.IDVariante
                      AND r.Estado = N'ACTIVA'
                      AND r.FechaExpiracion > a.Ahora
                      AND r.Cantidad = cd.Cantidad
               )) AS LineasSinReserva,
            (SELECT COUNT(*)
             FROM dbo.ReservaExistencia AS r
             WHERE r.IDCarrito = @IDCarrito
               AND r.Estado = N'ACTIVA'
               AND r.FechaExpiracion > a.Ahora
               AND NOT EXISTS (
                    SELECT 1
                    FROM dbo.CarritoDetalle AS cd
                    WHERE cd.IDCarrito = r.IDCarrito
                      AND cd.IDVariante = r.IDVariante
               )) AS ReservasSobrantes,
            (SELECT MIN(r.FechaExpiracion)
             FROM dbo.ReservaExistencia AS r
             WHERE r.IDCarrito = @IDCarrito
               AND r.Estado = N'ACTIVA'
               AND r.FechaExpiracion > a.Ahora) AS ReservaExpiraEn
    ) AS s;
GO

-- Foto JSON de un pedido para la bitácora (ValorAnterior / ValorNuevo): estado (Codigo), montos,
-- estado del pago, monto reembolsado por devoluciones y, con @IncluirLineas = 1, el arreglo Lineas con la cantidad devuelta de cada una.
-- Una fila; Json es NULL si el pedido no existe.
CREATE OR ALTER FUNCTION dbo.FU_Pedidos_PedidoJson (
    @IDPedido      INT,
    @IncluirLineas BIT
)
RETURNS TABLE
AS
RETURN
    SELECT (
        SELECT
            p.IDPedido,
            p.NumeroPedido,
            p.IDUsuario,
            ep.Codigo AS Estado,
            p.IDCupon,
            cu.Codigo AS CodigoCupon,
            p.Subtotal,
            p.Descuento,
            p.CostoEnvio,
            p.MontoIVA,
            p.Total,
            pg.Estado AS EstadoPago,
            (SELECT ISNULL(SUM(dv.MontoReembolso), 0) FROM dbo.Devolucion AS dv WHERE dv.IDPedido = p.IDPedido) AS MontoReembolsado,
            JSON_QUERY(CASE WHEN @IncluirLineas = 1 THEN (
                SELECT
                    d.IDPedidoDetalle,
                    d.IDVariante,
                    d.SKU,
                    d.Cantidad,
                    d.PrecioUnitario,
                    d.DescuentoLinea,
                    d.Subtotal,
                    d.CantidadDevuelta
                FROM dbo.PedidoDetalle AS d
                WHERE d.IDPedido = p.IDPedido
                ORDER BY d.IDPedidoDetalle
                FOR JSON PATH, INCLUDE_NULL_VALUES
            ) END) AS Lineas
        FROM dbo.Pedido AS p
        INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
        LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = p.IDCupon
        LEFT JOIN dbo.Pago AS pg ON pg.IDPedido = p.IDPedido
        WHERE p.IDPedido = @IDPedido
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    ) AS Json;
GO

/* =========================================================
   Usuarios
   ========================================================= */

-- Foto JSON de un usuario para la bitácora (ValorAnterior / ValorNuevo). Una fila; Json es NULL
-- si el usuario no existe. Nunca incluye HashContrasena.
CREATE OR ALTER FUNCTION dbo.FU_Usuarios_UsuarioJson (@IDUsuario INT)
RETURNS TABLE
AS
RETURN
    SELECT (
        SELECT
            u.IDUsuario,
            u.Correo,
            u.Nombre,
            u.Apellido,
            u.Telefono,
            r.Nombre AS Rol,
            u.Activo
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuario
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    ) AS Json;
GO

-- Foto JSON de una tarjeta guardada para la bitácora (ValorAnterior / ValorNuevo). Una fila; Json es
-- NULL si la tarjeta no existe. Solo contiene lo que la tabla guarda: nunca hay número completo ni CVV.
CREATE OR ALTER FUNCTION dbo.FU_Tarjetas_TarjetaJson (@IDTarjetaGuardada INT)
RETURNS TABLE
AS
RETURN
    SELECT (
        SELECT
            t.IDTarjetaGuardada,
            t.IDUsuario,
            t.Titular,
            t.Ultimos4,
            t.Tipo,
            t.Marca,
            t.Predeterminada
        FROM dbo.TarjetaGuardada AS t
        WHERE t.IDTarjetaGuardada = @IDTarjetaGuardada
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    ) AS Json;
GO
