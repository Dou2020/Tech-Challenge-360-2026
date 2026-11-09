/*
    085_datos_catalogos.sql
    Catálogos del sistema que la aplicación necesita para funcionar:
    roles, estados y transiciones del pedido, tipos de movimiento de inventario,
    métodos de envío y configuración.
    Los datos de ejemplo (usuarios, productos, cupones, pedidos) van en 090_datos_semilla.sql.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

/* Roles */
INSERT INTO dbo.Rol (Nombre)
VALUES (N'Cliente'), (N'Operador'), (N'Administrador');

/* Estados del pedido */
INSERT INTO dbo.EstadoPedido (Codigo, Nombre, EsFinal)
VALUES
    (N'PAGADO',           N'Pagado',             0),
    (N'EN_PREPARACION',   N'En preparación',     0),
    (N'DESPACHADO',       N'Despachado',         0),
    (N'ENTREGADO',        N'Entregado',          0),
    (N'DEVUELTO_PARCIAL', N'Devuelto parcial',   0),
    (N'CANCELADO',        N'Cancelado',          1),
    (N'DEVUELTO',         N'Devuelto',           1);

/* Transiciones permitidas por rol.
   El pedido nace en PAGADO. El Cliente solo puede cancelar antes del despacho. */
INSERT INTO dbo.TransicionEstadoPedido (IDEstadoOrigen, IDEstadoDestino, IDRol)
SELECT o.IDEstadoPedido, d.IDEstadoPedido, r.IDRol
FROM (VALUES
        (N'PAGADO',           N'EN_PREPARACION',   N'Operador'),
        (N'PAGADO',           N'EN_PREPARACION',   N'Administrador'),
        (N'PAGADO',           N'CANCELADO',        N'Cliente'),
        (N'PAGADO',           N'CANCELADO',        N'Operador'),
        (N'PAGADO',           N'CANCELADO',        N'Administrador'),
        (N'EN_PREPARACION',   N'DESPACHADO',       N'Operador'),
        (N'EN_PREPARACION',   N'DESPACHADO',       N'Administrador'),
        (N'EN_PREPARACION',   N'CANCELADO',        N'Cliente'),
        (N'EN_PREPARACION',   N'CANCELADO',        N'Operador'),
        (N'EN_PREPARACION',   N'CANCELADO',        N'Administrador'),
        (N'DESPACHADO',       N'ENTREGADO',        N'Operador'),
        (N'DESPACHADO',       N'ENTREGADO',        N'Administrador'),
        (N'ENTREGADO',        N'DEVUELTO_PARCIAL', N'Operador'),
        (N'ENTREGADO',        N'DEVUELTO_PARCIAL', N'Administrador'),
        (N'ENTREGADO',        N'DEVUELTO',         N'Operador'),
        (N'ENTREGADO',        N'DEVUELTO',         N'Administrador'),
        (N'DEVUELTO_PARCIAL', N'DEVUELTO',         N'Operador'),
        (N'DEVUELTO_PARCIAL', N'DEVUELTO',         N'Administrador')
     ) AS t (Origen, Destino, Rol)
INNER JOIN dbo.EstadoPedido AS o ON o.Codigo = t.Origen
INNER JOIN dbo.EstadoPedido AS d ON d.Codigo = t.Destino
INNER JOIN dbo.Rol AS r ON r.Nombre = t.Rol;

/* Tipos de movimiento de inventario */
INSERT INTO dbo.TipoMovimientoInventario (Codigo, Nombre, Signo)
VALUES
    (N'INVENTARIO_INICIAL', N'Inventario inicial',          1),
    (N'ENTRADA_COMPRA',     N'Entrada por compra',          1),
    (N'SALIDA_VENTA',       N'Salida por venta',           -1),
    (N'AJUSTE_ENTRADA',     N'Ajuste de entrada',           1),
    (N'AJUSTE_SALIDA',      N'Ajuste de salida',           -1),
    (N'DEVOLUCION',         N'Devolución de cliente',       1),
    (N'CANCELACION',        N'Reintegro por cancelación',   1);

/* Métodos de envío (el que requiere sucursal no pide dirección: el cliente elige una sucursal) */
INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimados, RequiereSucursal)
VALUES
    (N'Estándar',            25.00, 3, 0),
    (N'Express',             45.00, 1, 0),
    (N'Recoger en sucursal',  0.00, 0, 1);

/* Sucursales de retiro: departamento y municipio existen en el catálogo del frontend (guatemala-locations.json).
   Sucursal Antigua está inactiva: no se ofrece en el checkout. */
INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario, Activo)
VALUES
    (N'Sucursal Zona 10', N'2400-1010', N'6a Avenida 12-34, Zona 10', N'Edificio Plaza Fontabella, local 5',
     N'Guatemala', N'Guatemala', N'01010', N'Lunes a sábado de 9:00 a 19:00', 1),
    (N'Sucursal Zona 1',  N'2400-1001', N'7a Avenida 8-25, Zona 1', NULL,
     N'Guatemala', N'Guatemala', N'01001', N'Lunes a sábado de 9:00 a 18:00', 1),
    (N'Sucursal Mixco',   N'2400-1020', N'Calzada Roosevelt 15-60, Zona 3 de Mixco', N'Centro Comercial Mixco, local 12',
     N'Mixco', N'Guatemala', N'01057', N'Todos los días de 10:00 a 20:00', 1),
    (N'Sucursal Antigua', N'2400-1030', N'4a Calle Poniente 14', NULL,
     N'Antigua Guatemala', N'Sacatepéquez', N'03001', N'Lunes a viernes de 9:00 a 17:00', 0);

/* Configuración */
INSERT INTO dbo.Configuracion (Clave, Valor, Descripcion)
VALUES
    (N'MinutosReserva',         N'15',    N'Minutos que dura la reserva de existencia durante el checkout'),
    (N'HorasCarritoAbandonado', N'24',    N'Horas sin actividad para considerar un carrito abandonado'),
    (N'PorcentajeIVA',          N'12.00', N'IVA incluido en los precios publicados'),
    (N'UmbralBajoStock',        N'5',     N'Existencia disponible a partir de la cual se marca bajo stock');

COMMIT TRANSACTION;
GO
