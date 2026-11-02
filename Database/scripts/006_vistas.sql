/*
    006_vistas.sql
    Vistas (VW_).

    PENDIENTE: VW_Dashboard_VentasPorCategoria, VW_Reportes_VentasNetas.
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
