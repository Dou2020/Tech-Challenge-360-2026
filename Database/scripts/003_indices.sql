/*
    003_indices.sql
    Índices de búsqueda, filtros, reportes y de las llaves foráneas usadas en joins.
    SQL Server no indexa las FK automáticamente.

    Convención: IX_<Tabla>_<Columnas>; únicos filtrados UX_<Tabla>_<Columnas>.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* Seguridad */
CREATE INDEX IX_Usuario_IDRol ON dbo.Usuario (IDRol);
CREATE INDEX IX_Direccion_IDUsuario ON dbo.Direccion (IDUsuario) WHERE Activo = 1;
GO

/* Catálogo */
CREATE INDEX IX_Producto_IDCategoria_Activo ON dbo.Producto (IDCategoria, Activo);
CREATE INDEX IX_ProductoImagen_IDProducto ON dbo.ProductoImagen (IDProducto, Orden);
-- Una sola imagen principal por producto.
CREATE UNIQUE INDEX UX_ProductoImagen_Principal ON dbo.ProductoImagen (IDProducto) WHERE EsPrincipal = 1;
CREATE INDEX IX_Variante_IDProducto ON dbo.Variante (IDProducto) INCLUDE (Precio, ExistenciaFisica, ExistenciaReservada, Activo);
CREATE INDEX IX_Variante_Precio ON dbo.Variante (Precio) WHERE Activo = 1;
CREATE INDEX IX_VarianteValorAtributo_IDValorAtributo ON dbo.VarianteValorAtributo (IDValorAtributo);
GO

/* Cupones */
CREATE INDEX IX_Cupon_IDCategoria ON dbo.Cupon (IDCategoria);
CREATE INDEX IX_UsoCupon_IDCupon_IDUsuario ON dbo.UsoCupon (IDCupon, IDUsuario);
GO

/* Carrito */
-- Un invitado se identifica por su token.
CREATE UNIQUE INDEX UX_Carrito_TokenInvitado ON dbo.Carrito (TokenInvitado) WHERE TokenInvitado IS NOT NULL;
-- Un cliente tiene como máximo un carrito activo.
CREATE UNIQUE INDEX UX_Carrito_IDUsuario_Activo ON dbo.Carrito (IDUsuario) WHERE Estado = N'ACTIVO' AND IDUsuario IS NOT NULL;
-- Carritos abandonados.
CREATE INDEX IX_Carrito_Estado_FechaUltimaActividad ON dbo.Carrito (Estado, FechaUltimaActividad);
CREATE INDEX IX_CarritoDetalle_IDVariante ON dbo.CarritoDetalle (IDVariante);
GO

/* Pedidos */
CREATE INDEX IX_Pedido_IDUsuario_FechaCreacion ON dbo.Pedido (IDUsuario, FechaCreacion DESC);
CREATE INDEX IX_Pedido_IDEstadoPedido_FechaCreacion ON dbo.Pedido (IDEstadoPedido, FechaCreacion) INCLUDE (Total);
CREATE INDEX IX_Pedido_FechaCreacion ON dbo.Pedido (FechaCreacion) INCLUDE (IDEstadoPedido, Total);
CREATE INDEX IX_Pedido_IDCupon ON dbo.Pedido (IDCupon) WHERE IDCupon IS NOT NULL;
CREATE INDEX IX_PedidoDetalle_IDVariante ON dbo.PedidoDetalle (IDVariante);
CREATE INDEX IX_HistorialEstadoPedido_IDPedido ON dbo.HistorialEstadoPedido (IDPedido, Fecha);
CREATE INDEX IX_Devolucion_IDPedido ON dbo.Devolucion (IDPedido);
CREATE INDEX IX_DevolucionDetalle_IDPedidoDetalle ON dbo.DevolucionDetalle (IDPedidoDetalle);
GO

/* Inventario */
CREATE INDEX IX_MovimientoInventario_IDVariante_Fecha ON dbo.MovimientoInventario (IDVariante, Fecha);
CREATE INDEX IX_MovimientoInventario_IDPedido ON dbo.MovimientoInventario (IDPedido) WHERE IDPedido IS NOT NULL;
-- Liberación de reservas vencidas.
CREATE INDEX IX_ReservaExistencia_FechaExpiracion ON dbo.ReservaExistencia (FechaExpiracion) INCLUDE (IDVariante, Cantidad) WHERE Estado = N'ACTIVA';
CREATE INDEX IX_ReservaExistencia_IDCarrito ON dbo.ReservaExistencia (IDCarrito, Estado);
CREATE INDEX IX_ReservaExistencia_IDVariante ON dbo.ReservaExistencia (IDVariante) WHERE Estado = N'ACTIVA';
-- Una sola reserva activa por línea del carrito: repetir el checkout no aparta dos veces.
CREATE UNIQUE INDEX UX_ReservaExistencia_IDCarrito_IDVariante ON dbo.ReservaExistencia (IDCarrito, IDVariante) WHERE Estado = N'ACTIVA';
GO

/* Auditoría */
CREATE INDEX IX_Bitacora_Modulo_Fecha ON dbo.Bitacora (Modulo, Fecha DESC);
CREATE INDEX IX_Bitacora_Entidad_IDRegistro ON dbo.Bitacora (Entidad, IDRegistro);
CREATE INDEX IX_Bitacora_IDUsuario_Fecha ON dbo.Bitacora (IDUsuario, Fecha DESC);
GO
