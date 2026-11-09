/*
    pruebas/integridad.sql
    Comprueba que la base rechace los datos que rompen las reglas de negocio,
    aunque alguien escriba sin pasar por los stored procedures.

    Crea sus propios datos dentro de una transacción, intenta cada caso y al final la deshace:
    no deja filas en la base. Los casos que disparan un trigger van cada uno en su propia
    transacción, porque un error dentro de un trigger condena la transacción completa.

    Cada caso espera un número de error y, si aplica, el nombre de la restricción que lo
    rechaza: 547 (FK o CHECK), 2627 (UNIQUE), 2601 (índice único), 50040, 50070 y 50071
    (triggers, ver 004_triggers.sql); 0 si la base lo acepta.
    Si algún caso no da lo esperado termina con THROW 50099 y sqlcmd -b devuelve error.

    Lo ejecuta docker-init.sh con DB_PRUEBAS=true, y también el globalSetup de las
    pruebas de integración del backend.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
-- Con XACT_ABORT OFF una violación de restricción solo cancela la sentencia y la prueba sigue.
SET XACT_ABORT OFF;
GO

DECLARE @Resultado TABLE (
    IDResultado INT IDENTITY(1,1) PRIMARY KEY,
    Caso        NVARCHAR(80)   NOT NULL,
    Esperado    INT            NOT NULL,
    Restriccion NVARCHAR(128)  NULL,  -- la que debe rechazar el caso; NULL en válidos y triggers
    Obtenido    INT            NOT NULL,
    Mensaje     NVARCHAR(4000) NULL,
    Correcto    BIT            NULL
);
DECLARE @Error INT, @Mensaje NVARCHAR(4000);

-- Catálogos de 085_datos_catalogos.sql, buscados por código o nombre.
DECLARE @IDRolCliente  INT = (SELECT IDRol FROM dbo.Rol WHERE Nombre = N'Cliente');
DECLARE @IDPagado      INT = (SELECT IDEstadoPedido FROM dbo.EstadoPedido WHERE Codigo = N'PAGADO');
DECLARE @IDEntregado   INT = (SELECT IDEstadoPedido FROM dbo.EstadoPedido WHERE Codigo = N'ENTREGADO');
DECLARE @IDTipoInicial INT = (SELECT IDTipoMovimientoInventario FROM dbo.TipoMovimientoInventario WHERE Codigo = N'INVENTARIO_INICIAL');
DECLARE @IDTipoDevolucion INT = (SELECT IDTipoMovimientoInventario FROM dbo.TipoMovimientoInventario WHERE Codigo = N'DEVOLUCION');
DECLARE @IDTipoSalida  INT = (SELECT IDTipoMovimientoInventario FROM dbo.TipoMovimientoInventario WHERE Codigo = N'SALIDA_VENTA');
DECLARE @IDMetodoEnvio INT = (SELECT IDMetodoEnvio FROM dbo.MetodoEnvio WHERE Nombre = N'Estándar');  -- a domicilio
DECLARE @IDMetodoRetiro INT = (SELECT IDMetodoEnvio FROM dbo.MetodoEnvio WHERE Nombre = N'Recoger en sucursal');

DECLARE
    @IDUsuarioA INT, @IDUsuarioB INT, @IDDireccionA INT, @IDDireccionB INT,
    @IDCategoria INT, @IDProducto INT, @IDVariante1 INT, @IDVariante2 INT,
    @IDTalla INT, @IDColor INT, @IDTallaS INT, @IDTallaM INT, @IDColorRojo INT,
    @IDCupon1 INT, @IDCupon2 INT, @IDCarritoA INT, @IDSucursalA INT,
    @IDPedidoA INT, @IDPedidoB INT, @IDLineaA INT, @IDLineaB INT, @IDDevolucionA INT,
    @IDBitacora BIGINT;

/* =========================================================
   1. Restricciones que solo cancelan la sentencia
   ========================================================= */

BEGIN TRANSACTION;

-- Datos de prueba: dos clientes con su dirección, un producto con dos variantes y atributos,
-- dos cupones, el pedido A (cliente A, cupón 1) y el pedido B (cliente B, sin cupón)
-- con una línea cada uno, y una devolución del pedido A.
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRolCliente, N'prueba.a@integridad.test', N'sin-hash', N'Prueba', N'A');
    SET @IDUsuarioA = SCOPE_IDENTITY();

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRolCliente, N'prueba.b@integridad.test', N'sin-hash', N'Prueba', N'B');
    SET @IDUsuarioB = SCOPE_IDENTITY();

    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, Municipio, Departamento)
    VALUES (@IDUsuarioA, N'Casa', N'Prueba A', N'55550001', N'Calle A', N'Guatemala', N'Guatemala');
    SET @IDDireccionA = SCOPE_IDENTITY();

    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, Municipio, Departamento)
    VALUES (@IDUsuarioB, N'Casa', N'Prueba B', N'55550002', N'Calle B', N'Guatemala', N'Guatemala');
    SET @IDDireccionB = SCOPE_IDENTITY();

    INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Municipio, Departamento)
    VALUES (N'Sucursal de prueba', N'55550003', N'Calle S', N'Guatemala', N'Guatemala');
    SET @IDSucursalA = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre) VALUES (N'Prueba de integridad');
    SET @IDCategoria = SCOPE_IDENTITY();

    INSERT INTO dbo.Producto (IDCategoria, Nombre) VALUES (@IDCategoria, N'Producto de prueba');
    SET @IDProducto = SCOPE_IDENTITY();

    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica)
    VALUES (@IDProducto, N'PRUEBA-INTEGRIDAD-1', 100.00, 10);
    SET @IDVariante1 = SCOPE_IDENTITY();

    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica)
    VALUES (@IDProducto, N'PRUEBA-INTEGRIDAD-2', 100.00, 10);
    SET @IDVariante2 = SCOPE_IDENTITY();

    INSERT INTO dbo.Atributo (Nombre) VALUES (N'Prueba talla');
    SET @IDTalla = SCOPE_IDENTITY();

    INSERT INTO dbo.Atributo (Nombre) VALUES (N'Prueba color');
    SET @IDColor = SCOPE_IDENTITY();

    INSERT INTO dbo.ValorAtributo (IDAtributo, Valor) VALUES (@IDTalla, N'S');
    SET @IDTallaS = SCOPE_IDENTITY();

    INSERT INTO dbo.ValorAtributo (IDAtributo, Valor) VALUES (@IDTalla, N'M');
    SET @IDTallaM = SCOPE_IDENTITY();

    INSERT INTO dbo.ValorAtributo (IDAtributo, Valor) VALUES (@IDColor, N'Rojo');
    SET @IDColorRojo = SCOPE_IDENTITY();

    INSERT INTO dbo.Cupon (Codigo, TipoDescuento, Valor, FechaInicio, FechaFin, LimiteUsosTotal)
    VALUES (N'PRUEBA-INTEGRIDAD-1', N'PORCENTAJE', 10, '2026-01-01', '2027-01-01', 10);
    SET @IDCupon1 = SCOPE_IDENTITY();

    INSERT INTO dbo.Cupon (Codigo, TipoDescuento, Valor, FechaInicio, FechaFin, LimiteUsosTotal)
    VALUES (N'PRUEBA-INTEGRIDAD-2', N'MONTO_FIJO', 15, '2026-01-01', '2027-01-01', 10);
    SET @IDCupon2 = SCOPE_IDENTITY();

    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-A', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            @IDDireccionA, 0, @IDMetodoEnvio, @IDCupon1, N'Calle A, Guatemala',
            200.00, 20.00, 0.00, 19.29, 180.00);
    SET @IDPedidoA = SCOPE_IDENTITY();

    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-B', NEWID(), REPLICATE('0', 64), @IDUsuarioB, @IDPagado,
            @IDDireccionB, 0, @IDMetodoEnvio, NULL, N'Calle B, Guatemala',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SET @IDPedidoB = SCOPE_IDENTITY();

    INSERT INTO dbo.PedidoDetalle (IDPedido, IDVariante, SKU, NombreProducto, DescripcionVariante,
                                   Cantidad, PrecioUnitario, DescuentoLinea, Subtotal)
    VALUES (@IDPedidoA, @IDVariante1, N'PRUEBA-INTEGRIDAD-1', N'Producto de prueba', N'S / Rojo',
            2, 100.00, 20.00, 180.00);
    SET @IDLineaA = SCOPE_IDENTITY();

    INSERT INTO dbo.PedidoDetalle (IDPedido, IDVariante, SKU, NombreProducto, DescripcionVariante,
                                   Cantidad, PrecioUnitario, DescuentoLinea, Subtotal)
    VALUES (@IDPedidoB, @IDVariante1, N'PRUEBA-INTEGRIDAD-1', N'Producto de prueba', N'S / Rojo',
            1, 100.00, 0.00, 100.00);
    SET @IDLineaB = SCOPE_IDENTITY();

    INSERT INTO dbo.Devolucion (IDPedido, IDUsuario, Tipo, Motivo, MontoReembolso)
    VALUES (@IDPedidoA, @IDUsuarioA, N'PARCIAL', N'Prueba de integridad', 90.00);
    SET @IDDevolucionA = SCOPE_IDENTITY();
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

/* Dirección del pedido */

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-C', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            @IDDireccionB, 0, @IDMetodoEnvio, NULL, N'Calle B, Guatemala',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Pedido con la dirección de otro cliente', 547, N'FK_Pedido_Direccion', @Error, @Mensaje);

/* Entrega del pedido: domicilio o sucursal */

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, IDSucursal, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-S1', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            NULL, @IDSucursalA, 1, @IDMetodoRetiro, NULL, N'Entrega de prueba',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Pedido para recoger en una sucursal activa, sin dirección (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, IDSucursal, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-S2', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            NULL, NULL, 1, @IDMetodoRetiro, NULL, N'Entrega de prueba',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Retiro en sucursal sin sucursal ni dirección', 547, N'CK_Pedido_Entrega', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, IDSucursal, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-S3', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            @IDDireccionA, @IDSucursalA, 1, @IDMetodoRetiro, NULL, N'Entrega de prueba',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Retiro en sucursal con dirección y sucursal', 547, N'CK_Pedido_Entrega', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, IDSucursal, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-S4', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            NULL, NULL, 0, @IDMetodoEnvio, NULL, N'Entrega de prueba',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Pedido a domicilio sin dirección', 547, N'CK_Pedido_Entrega', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, IDSucursal, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-S5', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            @IDDireccionA, @IDSucursalA, 0, @IDMetodoEnvio, NULL, N'Entrega de prueba',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Pedido a domicilio con dirección y sucursal', 547, N'CK_Pedido_Entrega', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, IDSucursal, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-S6', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            NULL, @IDSucursalA, 1, @IDMetodoEnvio, NULL, N'Entrega de prueba',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Retiro en sucursal con un método a domicilio', 547, N'FK_Pedido_MetodoEnvio', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, IDSucursal, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-S7', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            @IDDireccionA, NULL, 0, @IDMetodoRetiro, NULL, N'Entrega de prueba',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Pedido a domicilio con el método de retiro en sucursal', 547, N'FK_Pedido_MetodoEnvio', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, IDSucursal, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-S8', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            NULL, 2147483647, 1, @IDMetodoRetiro, NULL, N'Entrega de prueba',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Retiro en una sucursal que no existe', 547, N'FK_Pedido_Sucursal', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Municipio, Departamento)
    VALUES (N'sucursal DE PRUEBA', N'55550004', N'Calle T', N'Guatemala', N'Guatemala');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Sucursal con el nombre de otra (sin distinguir mayúsculas)', 2627, N'UQ_Sucursal_Nombre', @Error, @Mensaje);

-- Valores por defecto: la sucursal nace activa y el método de envío no requiere sucursal.
BEGIN TRY
    INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Municipio, Departamento)
    VALUES (N'Sucursal con valores por defecto', N'55550005', N'Calle U', N'Guatemala', N'Guatemala');

    IF NOT EXISTS (SELECT 1 FROM dbo.Sucursal WHERE Nombre = N'Sucursal con valores por defecto' AND Activo = 1)
        THROW 50098, N'DF_Sucursal_Activo no dejó la sucursal activa.', 1;

    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimados) VALUES (N'Método de prueba', 0.00, 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.MetodoEnvio WHERE Nombre = N'Método de prueba' AND RequiereSucursal = 0)
        THROW 50098, N'DF_MetodoEnvio_RequiereSucursal no dejó el método a domicilio.', 1;

    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Sucursal activa y método a domicilio por defecto (válido)', 0, NULL, @Error, @Mensaje);

/* Atributos de la variante */

BEGIN TRY
    INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo) VALUES (@IDVariante1, @IDTalla, @IDTallaS);
    INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo) VALUES (@IDVariante1, @IDColor, @IDColorRojo);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Variante con una talla y un color (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo) VALUES (@IDVariante1, @IDTalla, @IDTallaM);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Variante con dos valores del mismo atributo', 2627, N'UQ_VarianteValorAtributo_IDVariante_IDAtributo', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo) VALUES (@IDVariante2, @IDColor, @IDTallaS);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Valor de atributo con el atributo equivocado', 547, N'FK_VarianteValorAtributo_ValorAtributo', @Error, @Mensaje);

/* Líneas de la devolución */

BEGIN TRY
    INSERT INTO dbo.DevolucionDetalle (IDDevolucion, IDPedido, IDPedidoDetalle, Cantidad, MontoReembolso)
    VALUES (@IDDevolucionA, @IDPedidoA, @IDLineaA, 1, 90.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Devolución de una línea del mismo pedido (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.DevolucionDetalle (IDDevolucion, IDPedido, IDPedidoDetalle, Cantidad, MontoReembolso)
    VALUES (@IDDevolucionA, @IDPedidoA, @IDLineaB, 1, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Devolución con una línea de otro pedido', 547, N'FK_DevolucionDetalle_PedidoDetalle', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.DevolucionDetalle (IDDevolucion, IDPedido, IDPedidoDetalle, Cantidad, MontoReembolso)
    VALUES (@IDDevolucionA, @IDPedidoB, @IDLineaB, 1, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Línea devuelta con un pedido distinto al de la devolución', 547, N'FK_DevolucionDetalle_Devolucion', @Error, @Mensaje);

/* Kardex */

BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario, IDPedido, IDDevolucion,
                                          Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
    VALUES (@IDVariante1, @IDTipoDevolucion, 1, @IDUsuarioA, @IDPedidoA, @IDDevolucionA, 1, 10, 11, N'Prueba de integridad');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Movimiento de una devolución con su pedido (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario, IDPedido, IDDevolucion,
                                          Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
    VALUES (@IDVariante1, @IDTipoDevolucion, 1, @IDUsuarioA, @IDPedidoB, @IDDevolucionA, 1, 10, 11, N'Prueba de integridad');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Movimiento con la devolución de otro pedido', 547, N'FK_MovimientoInventario_Devolucion', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario, IDPedido, IDDevolucion,
                                          Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
    VALUES (@IDVariante1, @IDTipoDevolucion, 1, @IDUsuarioA, NULL, @IDDevolucionA, 1, 10, 11, N'Prueba de integridad');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Movimiento con devolución y sin pedido', 547, N'CK_MovimientoInventario_Devolucion', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                          Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
    VALUES (@IDVariante1, @IDTipoInicial, 1, @IDUsuarioA, 1, 10, 15, N'Prueba de integridad');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Movimiento cuyo saldo no cambia en la cantidad', 547, N'CK_MovimientoInventario_Existencias', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                          Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
    VALUES (@IDVariante1, @IDTipoSalida, -1, @IDUsuarioA, 2, 10, 8, N'Prueba de integridad');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Salida que resta existencia (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                          Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
    VALUES (@IDVariante1, @IDTipoSalida, -1, @IDUsuarioA, 2, 10, 12, N'Prueba de integridad');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Salida que suma existencia', 547, N'CK_MovimientoInventario_Existencias', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                          Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
    VALUES (@IDVariante1, @IDTipoSalida, 1, @IDUsuarioA, 2, 10, 12, N'Prueba de integridad');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Movimiento con un signo distinto al de su tipo', 547, N'FK_MovimientoInventario_TipoMovimientoInventario', @Error, @Mensaje);

/* Uso del cupón: los casos inválidos van antes del válido para que no choquen con el UNIQUE */

BEGIN TRY
    INSERT INTO dbo.UsoCupon (IDCupon, IDUsuario, IDPedido) VALUES (@IDCupon2, @IDUsuarioA, @IDPedidoA);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Uso con un cupón distinto al del pedido', 547, N'FK_UsoCupon_Pedido', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.UsoCupon (IDCupon, IDUsuario, IDPedido) VALUES (@IDCupon1, @IDUsuarioB, @IDPedidoA);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Uso con un cliente distinto al del pedido', 547, N'FK_UsoCupon_Pedido', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.UsoCupon (IDCupon, IDUsuario, IDPedido) VALUES (@IDCupon1, @IDUsuarioB, @IDPedidoB);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Uso de cupón en un pedido sin cupón', 547, N'FK_UsoCupon_Pedido', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.UsoCupon (IDCupon, IDUsuario, IDPedido) VALUES (@IDCupon1, @IDUsuarioA, @IDPedidoA);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Uso del cupón del pedido (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.UsoCupon (IDCupon, IDUsuario, IDPedido) VALUES (@IDCupon1, @IDUsuarioA, @IDPedidoA);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Segundo uso de cupón en el mismo pedido', 2627, N'UQ_UsoCupon_IDPedido', @Error, @Mensaje);

UPDATE dbo.Cupon SET UsosActuales = 10 WHERE IDCupon = @IDCupon1;
BEGIN TRY
    UPDATE dbo.Cupon SET UsosActuales = UsosActuales + 1 WHERE IDCupon = @IDCupon1;
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Cupón por encima de su límite total de usos', 547, N'CK_Cupon_UsosActuales', @Error, @Mensaje);

/* Carrito */

BEGIN TRY
    INSERT INTO dbo.Carrito (IDUsuario, IDCupon) VALUES (@IDUsuarioA, @IDCupon1);
    SET @IDCarritoA = SCOPE_IDENTITY();
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Carrito de cliente con cupón (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Carrito (TokenInvitado, IDCupon) VALUES (NEWID(), @IDCupon1);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Carrito de invitado con cupón', 547, N'CK_Carrito_Cupon', @Error, @Mensaje);

/* Reservas de existencia */

BEGIN TRY
    INSERT INTO dbo.ReservaExistencia (IDCarrito, IDVariante, Cantidad, FechaExpiracion)
    VALUES (@IDCarritoA, @IDVariante1, 1, DATEADD(MINUTE, 15, SYSUTCDATETIME()));
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Reserva activa de una línea (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.ReservaExistencia (IDCarrito, IDVariante, Cantidad, FechaExpiracion)
    VALUES (@IDCarritoA, @IDVariante1, 1, DATEADD(MINUTE, 15, SYSUTCDATETIME()));
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Segunda reserva activa de la misma línea', 2601, N'UX_ReservaExistencia_IDCarrito_IDVariante', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.ReservaExistencia (IDCarrito, IDVariante, Cantidad, Estado, FechaExpiracion)
    VALUES (@IDCarritoA, @IDVariante1, 1, N'LIBERADA', DATEADD(MINUTE, 15, SYSUTCDATETIME()));
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Reserva liberada de la misma línea (válido)', 0, NULL, @Error, @Mensaje);

/* Existencias */

BEGIN TRY
    UPDATE dbo.Variante SET ExistenciaReservada = 11 WHERE IDVariante = @IDVariante1;
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Reservar más que la existencia física', 547, N'CK_Variante_ExistenciaReservada', @Error, @Mensaje);

BEGIN TRY
    UPDATE dbo.PedidoDetalle SET CantidadDevuelta = 3 WHERE IDPedidoDetalle = @IDLineaA;
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Devolver más de lo vendido en la línea', 547, N'CK_PedidoDetalle_CantidadDevuelta', @Error, @Mensaje);

/* Montos y estados del pedido */

BEGIN TRY
    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-D', NEWID(), REPLICATE('0', 64), @IDUsuarioB, @IDPagado,
            @IDDireccionB, 0, @IDMetodoEnvio, NULL, N'Calle B, Guatemala',
            100.00, 10.00, 0.00, 9.64, 90.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Pedido con descuento y sin cupón', 547, N'CK_Pedido_DescuentoSinCupon', @Error, @Mensaje);

BEGIN TRY
    UPDATE dbo.Pedido SET Total = 999.00 WHERE IDPedido = @IDPedidoA;
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Total del pedido que no cuadra con sus montos', 547, N'CK_Pedido_Total', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Pago (IDPedido, MetodoPago, Monto, ReferenciaTransaccion) VALUES (@IDPedidoA, N'TARJETA', 180.00, N'PRUEBA-1');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Pago con tarjeta (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.Pago (IDPedido, MetodoPago, Monto, ReferenciaTransaccion) VALUES (@IDPedidoB, N'EFECTIVO', 100.00, N'PRUEBA-2');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Pago con un método no aceptado', 547, N'CK_Pago_MetodoPago', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TransicionEstadoPedido (IDEstadoOrigen, IDEstadoDestino, IDRol) VALUES (@IDPagado, @IDPagado, @IDRolCliente);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Transición de un estado a sí mismo', 547, N'CK_TransicionEstadoPedido_Estados', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.HistorialEstadoPedido (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario) VALUES (@IDPedidoA, NULL, @IDPagado, @IDUsuarioA);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Historial de la creación del pedido (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.HistorialEstadoPedido (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario) VALUES (@IDPedidoA, @IDPagado, @IDPagado, @IDUsuarioA);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Historial sin cambio de estado', 547, N'CK_HistorialEstadoPedido_Estados', @Error, @Mensaje);

/* Tarjetas guardadas */

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca, Predeterminada) VALUES (@IDUsuarioA, N'Prueba A', '4242', N'CREDITO', N'VISA', 1);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Tarjeta guardada (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca) VALUES (-1, N'Nadie', '4242', N'CREDITO', N'VISA');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Tarjeta de un usuario inexistente', 547, N'FK_TarjetaGuardada_Usuario', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca) VALUES (@IDUsuarioA, N'Prueba A', '4242', N'CREDITO', N'VISA');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Misma tarjeta repetida del cliente', 2627, N'UQ_TarjetaGuardada_Tarjeta', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca) VALUES (@IDUsuarioB, N'Prueba B', '4242', N'CREDITO', N'VISA');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Misma tarjeta de otro cliente (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca, Predeterminada) VALUES (@IDUsuarioA, N'Prueba A', '5454', N'DEBITO', N'MASTERCARD', 1);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Segunda tarjeta predeterminada del cliente', 2601, N'UX_TarjetaGuardada_Predeterminada', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca, Predeterminada) VALUES (@IDUsuarioA, N'Prueba A', '5454', N'DEBITO', N'MASTERCARD', 0);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Segunda tarjeta no predeterminada (válido)', 0, NULL, @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca) VALUES (@IDUsuarioA, N'   ', '1111', N'CREDITO', N'AMEX');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Tarjeta con titular vacío', 547, N'CK_TarjetaGuardada_Titular', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca) VALUES (@IDUsuarioA, N'Prueba A', 'AB12', N'CREDITO', N'AMEX');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Tarjeta con últimos 4 no numéricos', 547, N'CK_TarjetaGuardada_Ultimos4', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca) VALUES (@IDUsuarioA, N'Prueba A', '1111', N'PREPAGO', N'AMEX');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Tarjeta con tipo desconocido', 547, N'CK_TarjetaGuardada_Tipo', @Error, @Mensaje);

BEGIN TRY
    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca) VALUES (@IDUsuarioA, N'Prueba A', '1111', N'CREDITO', N'DINERS');
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Tarjeta con marca desconocida', 547, N'CK_TarjetaGuardada_Marca', @Error, @Mensaje);

ROLLBACK TRANSACTION;

/* =========================================================
   2. Triggers: cada caso en su propia transacción
   ========================================================= */

BEGIN TRANSACTION;
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRolCliente, N'prueba.a@integridad.test', N'sin-hash', N'Prueba', N'A');
    SET @IDUsuarioA = SCOPE_IDENTITY();

    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, Municipio, Departamento)
    VALUES (@IDUsuarioA, N'Casa', N'Prueba A', N'55550001', N'Calle A', N'Guatemala', N'Guatemala');
    SET @IDDireccionA = SCOPE_IDENTITY();

    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-E', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDEntregado,
            @IDDireccionA, 0, @IDMetodoEnvio, NULL, N'Calle A, Guatemala',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Pedido que nace en ENTREGADO', 50040, NULL, @Error, @Mensaje);

BEGIN TRANSACTION;
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRolCliente, N'prueba.a@integridad.test', N'sin-hash', N'Prueba', N'A');
    SET @IDUsuarioA = SCOPE_IDENTITY();

    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, Municipio, Departamento)
    VALUES (@IDUsuarioA, N'Casa', N'Prueba A', N'55550001', N'Calle A', N'Guatemala', N'Guatemala');
    SET @IDDireccionA = SCOPE_IDENTITY();

    INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                            IDDireccion, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                            Subtotal, Descuento, CostoEnvio, MontoIVA, Total)
    VALUES (N'PRUEBA-F', NEWID(), REPLICATE('0', 64), @IDUsuarioA, @IDPagado,
            @IDDireccionA, 0, @IDMetodoEnvio, NULL, N'Calle A, Guatemala',
            100.00, 0.00, 0.00, 10.71, 100.00);
    SET @IDPedidoA = SCOPE_IDENTITY();

    UPDATE dbo.Pedido SET IDEstadoPedido = @IDEntregado WHERE IDPedido = @IDPedidoA;
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Cambio de estado no permitido (PAGADO a ENTREGADO)', 50040, NULL, @Error, @Mensaje);

BEGIN TRANSACTION;
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRolCliente, N'prueba.a@integridad.test', N'sin-hash', N'Prueba', N'A');
    SET @IDUsuarioA = SCOPE_IDENTITY();

    INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion)
    VALUES (@IDUsuarioA, N'Pruebas', N'Usuario', @IDUsuarioA, N'CREAR');
    SET @IDBitacora = SCOPE_IDENTITY();

    UPDATE dbo.Bitacora SET Accion = N'MODIFICAR' WHERE IDBitacora = @IDBitacora;
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Modificar la bitácora', 50070, NULL, @Error, @Mensaje);

BEGIN TRANSACTION;
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRolCliente, N'prueba.a@integridad.test', N'sin-hash', N'Prueba', N'A');
    SET @IDUsuarioA = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre) VALUES (N'Prueba de integridad');
    SET @IDCategoria = SCOPE_IDENTITY();

    INSERT INTO dbo.Producto (IDCategoria, Nombre) VALUES (@IDCategoria, N'Producto de prueba');
    SET @IDProducto = SCOPE_IDENTITY();

    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica)
    VALUES (@IDProducto, N'PRUEBA-INTEGRIDAD-1', 100.00, 10);
    SET @IDVariante1 = SCOPE_IDENTITY();

    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                          Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
    VALUES (@IDVariante1, @IDTipoInicial, 1, @IDUsuarioA, 10, 0, 10, N'Prueba de integridad');

    DELETE FROM dbo.MovimientoInventario WHERE IDVariante = @IDVariante1;
    SELECT @Error = 0, @Mensaje = NULL;
END TRY BEGIN CATCH SELECT @Error = ERROR_NUMBER(), @Mensaje = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
INSERT INTO @Resultado (Caso, Esperado, Restriccion, Obtenido, Mensaje) VALUES (N'Borrar un movimiento del kardex', 50071, NULL, @Error, @Mensaje);

/* =========================================================
   Resultado
   ========================================================= */

-- Un caso pasa si dio el error esperado y, cuando se indica, lo rechazó la restricción esperada.
UPDATE @Resultado
SET Correcto = CASE
        WHEN Obtenido = Esperado
         AND (Restriccion IS NULL OR CHARINDEX(Restriccion, ISNULL(Mensaje, N'')) > 0) THEN 1
        ELSE 0
    END;

SELECT
    Caso,
    ISNULL(Restriccion, N'') AS Restriccion,
    Esperado,
    Obtenido,
    CASE WHEN Correcto = 1 THEN N'OK' ELSE N'FALLA' END AS Resultado
FROM @Resultado
ORDER BY IDResultado;

IF EXISTS (SELECT 1 FROM @Resultado WHERE Correcto = 0)
BEGIN
    SELECT Caso, Mensaje FROM @Resultado WHERE Correcto = 0 ORDER BY IDResultado;

    THROW 50099, N'Hay reglas de integridad que la base no protege como se espera; revisa los casos con FALLA.', 1;
END;

PRINT N'Pruebas de integridad: todos los casos dieron el resultado esperado.';
GO
