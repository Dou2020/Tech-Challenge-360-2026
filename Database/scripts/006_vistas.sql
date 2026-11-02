/*
    006_vistas.sql
    Vistas (VW_).

    Sin objetos pendientes en este archivo.
    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Inventario
   ========================================================= */

-- Existencia por variante con su producto y categoría, incluidas las inactivas (gestión de
-- inventario). ExistenciaReservada es la reservada vigente: solo reservas ACTIVA no vencidas
-- (FU_Inventario_ExistenciaDisponible), no el saldo Variante.ExistenciaReservada, que incluye
-- las vencidas hasta que SP_Inventario_LiberarReservasVencidas las libera.
-- La usa SP_Inventario_ListarExistencias; el login de la aplicación la lee solo a través del SP.
CREATE OR ALTER VIEW dbo.VW_Inventario_Existencias
AS
    SELECT
        v.IDVariante,
        v.SKU,
        p.IDProducto,
        p.Nombre              AS Producto,
        c.IDCategoria,
        c.Nombre              AS Categoria,
        dv.Descripcion,
        v.Precio,
        d.ExistenciaFisica,
        d.ExistenciaReservada,
        d.ExistenciaDisponible,
        v.Activo,
        p.Activo              AS ProductoActivo,
        c.Activo              AS CategoriaActiva
    FROM dbo.Variante AS v
    INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(v.IDVariante, NULL) AS d
    OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(v.IDVariante) AS dv;
GO

/* =========================================================
   Pedidos
   ========================================================= */

-- Historial de estados de un pedido con los nombres de estado y del usuario que hizo el cambio.
-- IDEstadoAnterior es NULL en la creación del pedido. La usa SP_Pedidos_ObtenerHistorialEstados.
CREATE OR ALTER VIEW dbo.VW_Pedidos_Historial
AS
    SELECT
        h.IDHistorialEstadoPedido,
        h.IDPedido,
        ea.Codigo                          AS CodigoEstadoAnterior,
        ea.Nombre                          AS EstadoAnterior,
        en.Codigo                          AS CodigoEstadoNuevo,
        en.Nombre                          AS EstadoNuevo,
        h.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario,
        h.Comentario,
        h.Fecha
    FROM dbo.HistorialEstadoPedido AS h
    INNER JOIN dbo.EstadoPedido AS en ON en.IDEstadoPedido = h.IDEstadoNuevo
    LEFT JOIN dbo.EstadoPedido AS ea ON ea.IDEstadoPedido = h.IDEstadoAnterior
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = h.IDUsuario;
GO

/* =========================================================
   Reportes
   ========================================================= */

-- Base única de las ventas netas: una fila por línea de pedido COMPLETADO (ENTREGADO o
-- DEVUELTO_PARCIAL). Los cancelados, los DEVUELTO (neto cero) y los que aún no se entregan quedan fuera.
-- Todos los reportes (SP_Reportes_*) leen esta vista, así que suman lo mismo.
--   FechaLocal        fecha de Guatemala de Pedido.FechaCreacion (UTC → 'Central America Standard Time'
--                     → DATE): es la fecha que usan los filtros y las agrupaciones de los reportes.
--   Subtotal          PedidoDetalle.Subtotal: precio × cantidad − descuento de la línea (cupón), sin envío.
--   MontoReembolsado  suma de DevolucionDetalle.MontoReembolso de la línea (el monto proporcional al
--                     subtotal neto que calculó SP_Pedidos_RegistrarDevolucion).
--   VentaNeta         Subtotal − MontoReembolsado. Las ventas netas NO incluyen el envío ni distinguen el
--                     IVA (los precios ya lo traen incluido). El envío se informa aparte en el resumen.
--   UnidadesNetas     Cantidad − CantidadDevuelta.
-- Producto y categoría son los vigentes (no se congelan en PedidoDetalle).
CREATE OR ALTER VIEW dbo.VW_Reportes_VentasNetas
AS
    SELECT
        pd.IDPedidoDetalle,
        pe.IDPedido,
        pe.NumeroPedido,
        pe.IDUsuario,
        pe.FechaCreacion,
        CONVERT(DATE, pe.FechaCreacion AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time') AS FechaLocal,
        pd.IDVariante,
        pd.SKU,
        p.IDProducto,
        p.Nombre                                       AS Producto,
        c.IDCategoria,
        c.Nombre                                       AS Categoria,
        pd.Cantidad                                    AS UnidadesVendidas,
        pd.CantidadDevuelta                            AS UnidadesDevueltas,
        pd.Cantidad - pd.CantidadDevuelta              AS UnidadesNetas,
        pd.Subtotal,
        r.MontoReembolsado,
        CONVERT(DECIMAL(12,2), pd.Subtotal - r.MontoReembolsado) AS VentaNeta
    FROM dbo.PedidoDetalle AS pd
    INNER JOIN dbo.Pedido AS pe ON pe.IDPedido = pd.IDPedido
    INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = pe.IDEstadoPedido
    INNER JOIN dbo.Variante AS v ON v.IDVariante = pd.IDVariante
    INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT CONVERT(DECIMAL(12,2), ISNULL(SUM(dd.MontoReembolso), 0)) AS MontoReembolsado
        FROM dbo.DevolucionDetalle AS dd
        WHERE dd.IDPedidoDetalle = pd.IDPedidoDetalle
    ) AS r
    WHERE ep.Codigo IN (N'ENTREGADO', N'DEVUELTO_PARCIAL');
GO

-- Ventas netas por categoría y día local, sobre VW_Reportes_VentasNetas. Se agrupa también por día
-- para que SP_Reportes_VentasPorCategoria filtre por rango de fechas sumando estas filas.
-- La usa SP_Reportes_VentasPorCategoria.
CREATE OR ALTER VIEW dbo.VW_Dashboard_VentasPorCategoria
AS
    SELECT
        FechaLocal,
        IDCategoria,
        Categoria,
        SUM(UnidadesVendidas)  AS UnidadesVendidas,
        SUM(UnidadesDevueltas) AS UnidadesDevueltas,
        SUM(UnidadesNetas)     AS UnidadesNetas,
        SUM(Subtotal)          AS VentaBruta,
        SUM(MontoReembolsado)  AS MontoReembolsado,
        SUM(VentaNeta)         AS VentaNeta
    FROM dbo.VW_Reportes_VentasNetas
    GROUP BY FechaLocal, IDCategoria, Categoria;
GO
