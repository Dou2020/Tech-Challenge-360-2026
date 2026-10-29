/*
    002_tablas.sql
    Tablas con llaves primarias, foráneas, UNIQUE, NOT NULL, CHECK y DEFAULT.

    Convenciones:
      - PK autoincrementable: ID + nombre de la tabla (IDPedido).
      - FK: mismo nombre que la PK referenciada.
      - Montos DECIMAL(12,2), cantidades INT, fechas DATETIME2(3) en UTC.
      - Constraints con nombre: PK_, FK_, UQ_, CK_, DF_.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Seguridad
   ========================================================= */

CREATE TABLE dbo.Rol (
    IDRol   INT IDENTITY(1,1) NOT NULL,
    Nombre  NVARCHAR(30)      NOT NULL,
    CONSTRAINT PK_Rol PRIMARY KEY (IDRol),
    CONSTRAINT UQ_Rol_Nombre UNIQUE (Nombre)
);
GO

CREATE TABLE dbo.Usuario (
    IDUsuario         INT IDENTITY(1,1) NOT NULL,
    IDRol             INT               NOT NULL,
    Correo            NVARCHAR(150)     NOT NULL,
    HashContrasena    NVARCHAR(255)     NOT NULL,
    Nombre            NVARCHAR(100)     NOT NULL,
    Apellido          NVARCHAR(100)     NOT NULL,
    Telefono          NVARCHAR(20)      NULL,
    Activo            BIT               NOT NULL CONSTRAINT DF_Usuario_Activo DEFAULT (1),
    FechaCreacion     DATETIME2(3)      NOT NULL CONSTRAINT DF_Usuario_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaModificacion DATETIME2(3)      NULL,
    CONSTRAINT PK_Usuario PRIMARY KEY (IDUsuario),
    CONSTRAINT FK_Usuario_Rol FOREIGN KEY (IDRol) REFERENCES dbo.Rol (IDRol),
    CONSTRAINT UQ_Usuario_Correo UNIQUE (Correo),
    CONSTRAINT CK_Usuario_Correo CHECK (Correo LIKE N'%_@_%._%')
);
GO

-- Las sesiones (refresh tokens) viven en Redis, no en la base: ver la sección Redis del README.

CREATE TABLE dbo.Direccion (
    IDDireccion        INT IDENTITY(1,1) NOT NULL,
    IDUsuario          INT               NOT NULL,
    Alias              NVARCHAR(50)      NOT NULL,
    NombreDestinatario NVARCHAR(150)     NOT NULL,
    Telefono           NVARCHAR(20)      NOT NULL,
    Linea1             NVARCHAR(200)     NOT NULL,
    Linea2             NVARCHAR(200)     NULL,
    Municipio          NVARCHAR(100)     NOT NULL,
    Departamento       NVARCHAR(100)     NOT NULL,
    CodigoPostal       NVARCHAR(10)      NULL,
    Referencias        NVARCHAR(300)     NULL,
    Activo             BIT               NOT NULL CONSTRAINT DF_Direccion_Activo DEFAULT (1),
    CONSTRAINT PK_Direccion PRIMARY KEY (IDDireccion),
    CONSTRAINT FK_Direccion_Usuario FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuario (IDUsuario),
    -- Destino de la FK compuesta de Pedido: la dirección del pedido es del mismo cliente.
    CONSTRAINT UQ_Direccion_IDDireccion_IDUsuario UNIQUE (IDDireccion, IDUsuario)
);
GO

/* =========================================================
   Catálogo
   ========================================================= */

CREATE TABLE dbo.Categoria (
    IDCategoria INT IDENTITY(1,1) NOT NULL,
    Nombre      NVARCHAR(100)     NOT NULL,
    Descripcion NVARCHAR(500)     NULL,
    Activo      BIT               NOT NULL CONSTRAINT DF_Categoria_Activo DEFAULT (1),
    CONSTRAINT PK_Categoria PRIMARY KEY (IDCategoria),
    CONSTRAINT UQ_Categoria_Nombre UNIQUE (Nombre)
);
GO

CREATE TABLE dbo.Producto (
    IDProducto        INT IDENTITY(1,1) NOT NULL,
    IDCategoria       INT               NOT NULL,
    Nombre            NVARCHAR(150)     NOT NULL,
    Descripcion       NVARCHAR(MAX)     NULL,
    Activo            BIT               NOT NULL CONSTRAINT DF_Producto_Activo DEFAULT (1),
    FechaCreacion     DATETIME2(3)      NOT NULL CONSTRAINT DF_Producto_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaModificacion DATETIME2(3)      NULL,
    CONSTRAINT PK_Producto PRIMARY KEY (IDProducto),
    CONSTRAINT FK_Producto_Categoria FOREIGN KEY (IDCategoria) REFERENCES dbo.Categoria (IDCategoria)
);
GO

CREATE TABLE dbo.ProductoImagen (
    IDProductoImagen INT IDENTITY(1,1) NOT NULL,
    IDProducto       INT               NOT NULL,
    Url              NVARCHAR(500)     NOT NULL,
    Orden            TINYINT           NOT NULL CONSTRAINT DF_ProductoImagen_Orden DEFAULT (0),
    EsPrincipal      BIT               NOT NULL CONSTRAINT DF_ProductoImagen_EsPrincipal DEFAULT (0),
    CONSTRAINT PK_ProductoImagen PRIMARY KEY (IDProductoImagen),
    CONSTRAINT FK_ProductoImagen_Producto FOREIGN KEY (IDProducto) REFERENCES dbo.Producto (IDProducto)
);
GO

CREATE TABLE dbo.Atributo (
    IDAtributo INT IDENTITY(1,1) NOT NULL,
    Nombre     NVARCHAR(50)      NOT NULL,
    CONSTRAINT PK_Atributo PRIMARY KEY (IDAtributo),
    CONSTRAINT UQ_Atributo_Nombre UNIQUE (Nombre)
);
GO

CREATE TABLE dbo.ValorAtributo (
    IDValorAtributo INT IDENTITY(1,1) NOT NULL,
    IDAtributo      INT               NOT NULL,
    Valor           NVARCHAR(50)      NOT NULL,
    CONSTRAINT PK_ValorAtributo PRIMARY KEY (IDValorAtributo),
    CONSTRAINT FK_ValorAtributo_Atributo FOREIGN KEY (IDAtributo) REFERENCES dbo.Atributo (IDAtributo),
    CONSTRAINT UQ_ValorAtributo_IDAtributo_Valor UNIQUE (IDAtributo, Valor),
    -- Destino de la FK compuesta de VarianteValorAtributo.
    CONSTRAINT UQ_ValorAtributo_IDAtributo_IDValorAtributo UNIQUE (IDAtributo, IDValorAtributo)
);
GO

CREATE TABLE dbo.Variante (
    IDVariante          INT IDENTITY(1,1) NOT NULL,
    IDProducto          INT               NOT NULL,
    SKU                 NVARCHAR(50)      NOT NULL,
    Precio              DECIMAL(12,2)     NOT NULL,
    ExistenciaFisica    INT               NOT NULL CONSTRAINT DF_Variante_ExistenciaFisica DEFAULT (0),
    ExistenciaReservada INT               NOT NULL CONSTRAINT DF_Variante_ExistenciaReservada DEFAULT (0),
    Activo              BIT               NOT NULL CONSTRAINT DF_Variante_Activo DEFAULT (1),
    RowVersion          ROWVERSION        NOT NULL,
    CONSTRAINT PK_Variante PRIMARY KEY (IDVariante),
    CONSTRAINT FK_Variante_Producto FOREIGN KEY (IDProducto) REFERENCES dbo.Producto (IDProducto),
    CONSTRAINT UQ_Variante_SKU UNIQUE (SKU),
    CONSTRAINT CK_Variante_Precio CHECK (Precio > 0),
    CONSTRAINT CK_Variante_ExistenciaFisica CHECK (ExistenciaFisica >= 0),
    -- Disponible = física - reservada; nunca se reserva más de lo que hay.
    CONSTRAINT CK_Variante_ExistenciaReservada CHECK (ExistenciaReservada BETWEEN 0 AND ExistenciaFisica)
);
GO

CREATE TABLE dbo.VarianteValorAtributo (
    IDVarianteValorAtributo INT IDENTITY(1,1) NOT NULL,
    IDVariante              INT               NOT NULL,
    IDAtributo              INT               NOT NULL,  -- repetido del valor para limitar la variante a un valor por atributo
    IDValorAtributo         INT               NOT NULL,
    CONSTRAINT PK_VarianteValorAtributo PRIMARY KEY (IDVarianteValorAtributo),
    CONSTRAINT FK_VarianteValorAtributo_Variante FOREIGN KEY (IDVariante) REFERENCES dbo.Variante (IDVariante),
    -- La FK compuesta garantiza que IDAtributo sea el atributo del valor.
    CONSTRAINT FK_VarianteValorAtributo_ValorAtributo FOREIGN KEY (IDAtributo, IDValorAtributo) REFERENCES dbo.ValorAtributo (IDAtributo, IDValorAtributo),
    -- Una talla y un color por variante, nunca dos tallas.
    CONSTRAINT UQ_VarianteValorAtributo_IDVariante_IDAtributo UNIQUE (IDVariante, IDAtributo)
);
GO

/* =========================================================
   Cupones
   ========================================================= */

CREATE TABLE dbo.Cupon (
    IDCupon              INT IDENTITY(1,1) NOT NULL,
    Codigo               NVARCHAR(30)      NOT NULL,
    Descripcion          NVARCHAR(300)     NULL,
    TipoDescuento        NVARCHAR(20)      NOT NULL,
    Valor                DECIMAL(12,2)     NOT NULL,
    IDCategoria          INT               NULL,      -- NULL: aplica a todo el carrito
    MontoMinimo          DECIMAL(12,2)     NOT NULL CONSTRAINT DF_Cupon_MontoMinimo DEFAULT (0),
    FechaInicio          DATETIME2(3)      NOT NULL,
    FechaFin             DATETIME2(3)      NOT NULL,
    LimiteUsosTotal      INT               NOT NULL,
    LimiteUsosPorCliente INT               NOT NULL CONSTRAINT DF_Cupon_LimiteUsosPorCliente DEFAULT (1),
    UsosActuales         INT               NOT NULL CONSTRAINT DF_Cupon_UsosActuales DEFAULT (0),
    Activo               BIT               NOT NULL CONSTRAINT DF_Cupon_Activo DEFAULT (1),
    CONSTRAINT PK_Cupon PRIMARY KEY (IDCupon),
    CONSTRAINT FK_Cupon_Categoria FOREIGN KEY (IDCategoria) REFERENCES dbo.Categoria (IDCategoria),
    CONSTRAINT UQ_Cupon_Codigo UNIQUE (Codigo),
    CONSTRAINT CK_Cupon_TipoDescuento CHECK (TipoDescuento IN (N'PORCENTAJE', N'MONTO_FIJO')),
    CONSTRAINT CK_Cupon_Valor CHECK (Valor > 0 AND (TipoDescuento <> N'PORCENTAJE' OR Valor <= 100)),
    CONSTRAINT CK_Cupon_MontoMinimo CHECK (MontoMinimo >= 0),
    CONSTRAINT CK_Cupon_Vigencia CHECK (FechaFin > FechaInicio),
    CONSTRAINT CK_Cupon_LimiteUsosTotal CHECK (LimiteUsosTotal > 0),
    CONSTRAINT CK_Cupon_LimiteUsosPorCliente CHECK (LimiteUsosPorCliente BETWEEN 1 AND LimiteUsosTotal),
    -- El límite total se respeta aun con usos concurrentes (además del UPDATE condicional en el SP).
    CONSTRAINT CK_Cupon_UsosActuales CHECK (UsosActuales BETWEEN 0 AND LimiteUsosTotal)
);
GO

/* =========================================================
   Carrito
   ========================================================= */

CREATE TABLE dbo.Carrito (
    IDCarrito            INT IDENTITY(1,1) NOT NULL,
    IDUsuario            INT               NULL,
    TokenInvitado        UNIQUEIDENTIFIER  NULL,
    IDCupon              INT               NULL,
    Estado               NVARCHAR(20)      NOT NULL CONSTRAINT DF_Carrito_Estado DEFAULT (N'ACTIVO'),
    FechaCreacion        DATETIME2(3)      NOT NULL CONSTRAINT DF_Carrito_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaUltimaActividad DATETIME2(3)      NOT NULL CONSTRAINT DF_Carrito_FechaUltimaActividad DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Carrito PRIMARY KEY (IDCarrito),
    CONSTRAINT FK_Carrito_Usuario FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuario (IDUsuario),
    CONSTRAINT FK_Carrito_Cupon FOREIGN KEY (IDCupon) REFERENCES dbo.Cupon (IDCupon),
    CONSTRAINT CK_Carrito_Estado CHECK (Estado IN (N'ACTIVO', N'CONVERTIDO', N'FUSIONADO')),
    CONSTRAINT CK_Carrito_Duenio CHECK (IDUsuario IS NOT NULL OR TokenInvitado IS NOT NULL),
    -- El límite de usos por cliente necesita saber quién es: un invitado no aplica cupones.
    CONSTRAINT CK_Carrito_Cupon CHECK (IDCupon IS NULL OR IDUsuario IS NOT NULL)
);
GO

CREATE TABLE dbo.CarritoDetalle (
    IDCarritoDetalle INT IDENTITY(1,1) NOT NULL,
    IDCarrito        INT               NOT NULL,
    IDVariante       INT               NOT NULL,
    Cantidad         INT               NOT NULL,
    FechaAgregado    DATETIME2(3)      NOT NULL CONSTRAINT DF_CarritoDetalle_FechaAgregado DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_CarritoDetalle PRIMARY KEY (IDCarritoDetalle),
    CONSTRAINT FK_CarritoDetalle_Carrito FOREIGN KEY (IDCarrito) REFERENCES dbo.Carrito (IDCarrito),
    CONSTRAINT FK_CarritoDetalle_Variante FOREIGN KEY (IDVariante) REFERENCES dbo.Variante (IDVariante),
    CONSTRAINT UQ_CarritoDetalle_IDCarrito_IDVariante UNIQUE (IDCarrito, IDVariante),
    CONSTRAINT CK_CarritoDetalle_Cantidad CHECK (Cantidad > 0)
);
GO

/* =========================================================
   Pedidos
   ========================================================= */

CREATE TABLE dbo.MetodoEnvio (
    IDMetodoEnvio INT IDENTITY(1,1) NOT NULL,
    Nombre        NVARCHAR(100)     NOT NULL,
    Costo         DECIMAL(12,2)     NOT NULL,
    DiasEstimados TINYINT           NOT NULL,
    Activo        BIT               NOT NULL CONSTRAINT DF_MetodoEnvio_Activo DEFAULT (1),
    CONSTRAINT PK_MetodoEnvio PRIMARY KEY (IDMetodoEnvio),
    CONSTRAINT UQ_MetodoEnvio_Nombre UNIQUE (Nombre),
    CONSTRAINT CK_MetodoEnvio_Costo CHECK (Costo >= 0)
);
GO

CREATE TABLE dbo.EstadoPedido (
    IDEstadoPedido INT IDENTITY(1,1) NOT NULL,
    Codigo         NVARCHAR(30)      NOT NULL,
    Nombre         NVARCHAR(100)     NOT NULL,
    EsFinal        BIT               NOT NULL CONSTRAINT DF_EstadoPedido_EsFinal DEFAULT (0),
    CONSTRAINT PK_EstadoPedido PRIMARY KEY (IDEstadoPedido),
    CONSTRAINT UQ_EstadoPedido_Codigo UNIQUE (Codigo)
);
GO

-- Transiciones permitidas del ciclo de vida del pedido y qué rol puede ejecutarlas.
CREATE TABLE dbo.TransicionEstadoPedido (
    IDTransicionEstadoPedido INT IDENTITY(1,1) NOT NULL,
    IDEstadoOrigen           INT               NOT NULL,
    IDEstadoDestino          INT               NOT NULL,
    IDRol                    INT               NOT NULL,
    CONSTRAINT PK_TransicionEstadoPedido PRIMARY KEY (IDTransicionEstadoPedido),
    CONSTRAINT FK_TransicionEstadoPedido_EstadoOrigen FOREIGN KEY (IDEstadoOrigen) REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    CONSTRAINT FK_TransicionEstadoPedido_EstadoDestino FOREIGN KEY (IDEstadoDestino) REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    CONSTRAINT FK_TransicionEstadoPedido_Rol FOREIGN KEY (IDRol) REFERENCES dbo.Rol (IDRol),
    CONSTRAINT UQ_TransicionEstadoPedido_IDEstadoOrigen_IDEstadoDestino_IDRol UNIQUE (IDEstadoOrigen, IDEstadoDestino, IDRol),
    CONSTRAINT CK_TransicionEstadoPedido_Estados CHECK (IDEstadoOrigen <> IDEstadoDestino)
);
GO

CREATE TABLE dbo.Pedido (
    IDPedido          INT IDENTITY(1,1) NOT NULL,
    NumeroPedido      NVARCHAR(20)      NOT NULL,
    ClaveIdempotencia UNIQUEIDENTIFIER  NOT NULL,
    HuellaSolicitud   CHAR(64)          NOT NULL,  -- SHA-256 del contenido del carrito; detecta misma clave con otro carrito
    IDUsuario         INT               NOT NULL,
    IDEstadoPedido    INT               NOT NULL,
    IDDireccion       INT               NOT NULL,
    IDMetodoEnvio     INT               NOT NULL,
    IDCupon           INT               NULL,
    DireccionEntrega  NVARCHAR(800)     NOT NULL,  -- copia de la dirección al momento de la compra
    Subtotal          DECIMAL(12,2)     NOT NULL,
    Descuento         DECIMAL(12,2)     NOT NULL CONSTRAINT DF_Pedido_Descuento DEFAULT (0),
    CostoEnvio        DECIMAL(12,2)     NOT NULL CONSTRAINT DF_Pedido_CostoEnvio DEFAULT (0),
    MontoIVA          DECIMAL(12,2)     NOT NULL,  -- desglose; el IVA ya está incluido en los precios
    Total             DECIMAL(12,2)     NOT NULL,
    FechaCreacion     DATETIME2(3)      NOT NULL CONSTRAINT DF_Pedido_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Pedido PRIMARY KEY (IDPedido),
    CONSTRAINT FK_Pedido_Usuario FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuario (IDUsuario),
    CONSTRAINT FK_Pedido_EstadoPedido FOREIGN KEY (IDEstadoPedido) REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    -- La dirección de entrega es del mismo cliente del pedido.
    CONSTRAINT FK_Pedido_Direccion FOREIGN KEY (IDDireccion, IDUsuario) REFERENCES dbo.Direccion (IDDireccion, IDUsuario),
    CONSTRAINT FK_Pedido_MetodoEnvio FOREIGN KEY (IDMetodoEnvio) REFERENCES dbo.MetodoEnvio (IDMetodoEnvio),
    CONSTRAINT FK_Pedido_Cupon FOREIGN KEY (IDCupon) REFERENCES dbo.Cupon (IDCupon),
    CONSTRAINT UQ_Pedido_NumeroPedido UNIQUE (NumeroPedido),
    CONSTRAINT UQ_Pedido_ClaveIdempotencia UNIQUE (ClaveIdempotencia),
    -- Destino de la FK compuesta de UsoCupon: el uso es del mismo cliente y cupón del pedido.
    CONSTRAINT UQ_Pedido_IDPedido_IDUsuario_IDCupon UNIQUE (IDPedido, IDUsuario, IDCupon),
    CONSTRAINT CK_Pedido_Montos CHECK (Subtotal >= 0 AND Descuento >= 0 AND CostoEnvio >= 0 AND MontoIVA >= 0),
    CONSTRAINT CK_Pedido_Descuento CHECK (Descuento <= Subtotal),
    -- El único descuento del pedido es el del cupón.
    CONSTRAINT CK_Pedido_DescuentoSinCupon CHECK (IDCupon IS NOT NULL OR Descuento = 0),
    CONSTRAINT CK_Pedido_Total CHECK (Total >= 0 AND Total = Subtotal - Descuento + CostoEnvio),
    CONSTRAINT CK_Pedido_MontoIVA CHECK (MontoIVA <= Total)
);
GO

CREATE TABLE dbo.PedidoDetalle (
    IDPedidoDetalle     INT IDENTITY(1,1) NOT NULL,
    IDPedido            INT               NOT NULL,
    IDVariante          INT               NOT NULL,
    -- Copia de los datos al momento de la compra: un cambio posterior de precio no altera el pedido.
    SKU                 NVARCHAR(50)      NOT NULL,
    NombreProducto      NVARCHAR(150)     NOT NULL,
    DescripcionVariante NVARCHAR(200)     NOT NULL,
    Cantidad            INT               NOT NULL,
    PrecioUnitario      DECIMAL(12,2)     NOT NULL,
    DescuentoLinea      DECIMAL(12,2)     NOT NULL CONSTRAINT DF_PedidoDetalle_DescuentoLinea DEFAULT (0),
    Subtotal            DECIMAL(12,2)     NOT NULL,
    CantidadDevuelta    INT               NOT NULL CONSTRAINT DF_PedidoDetalle_CantidadDevuelta DEFAULT (0),
    CONSTRAINT PK_PedidoDetalle PRIMARY KEY (IDPedidoDetalle),
    CONSTRAINT FK_PedidoDetalle_Pedido FOREIGN KEY (IDPedido) REFERENCES dbo.Pedido (IDPedido),
    CONSTRAINT FK_PedidoDetalle_Variante FOREIGN KEY (IDVariante) REFERENCES dbo.Variante (IDVariante),
    CONSTRAINT UQ_PedidoDetalle_IDPedido_IDVariante UNIQUE (IDPedido, IDVariante),
    -- Destino de la FK compuesta de DevolucionDetalle: la línea devuelta es del mismo pedido.
    CONSTRAINT UQ_PedidoDetalle_IDPedidoDetalle_IDPedido UNIQUE (IDPedidoDetalle, IDPedido),
    CONSTRAINT CK_PedidoDetalle_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_PedidoDetalle_PrecioUnitario CHECK (PrecioUnitario > 0),
    CONSTRAINT CK_PedidoDetalle_DescuentoLinea CHECK (DescuentoLinea BETWEEN 0 AND PrecioUnitario * Cantidad),
    CONSTRAINT CK_PedidoDetalle_Subtotal CHECK (Subtotal = PrecioUnitario * Cantidad - DescuentoLinea),
    CONSTRAINT CK_PedidoDetalle_CantidadDevuelta CHECK (CantidadDevuelta BETWEEN 0 AND Cantidad)
);
GO

CREATE TABLE dbo.Pago (
    IDPago                INT IDENTITY(1,1) NOT NULL,
    IDPedido              INT               NOT NULL,
    MetodoPago            NVARCHAR(20)      NOT NULL,
    Monto                 DECIMAL(12,2)     NOT NULL,
    Estado                NVARCHAR(20)      NOT NULL CONSTRAINT DF_Pago_Estado DEFAULT (N'APROBADO'),
    ReferenciaTransaccion NVARCHAR(100)     NOT NULL,
    Fecha                 DATETIME2(3)      NOT NULL CONSTRAINT DF_Pago_Fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Pago PRIMARY KEY (IDPago),
    CONSTRAINT FK_Pago_Pedido FOREIGN KEY (IDPedido) REFERENCES dbo.Pedido (IDPedido),
    CONSTRAINT UQ_Pago_IDPedido UNIQUE (IDPedido),
    CONSTRAINT CK_Pago_Monto CHECK (Monto >= 0),
    -- Pago simulado con tarjeta (ver Backend/API.md).
    CONSTRAINT CK_Pago_MetodoPago CHECK (MetodoPago IN (N'TARJETA')),
    CONSTRAINT CK_Pago_Estado CHECK (Estado IN (N'APROBADO', N'REEMBOLSADO_PARCIAL', N'REEMBOLSADO'))
);
GO

CREATE TABLE dbo.HistorialEstadoPedido (
    IDHistorialEstadoPedido INT IDENTITY(1,1) NOT NULL,
    IDPedido                INT               NOT NULL,
    IDEstadoAnterior        INT               NULL,      -- NULL en la creación del pedido
    IDEstadoNuevo           INT               NOT NULL,
    IDUsuario               INT               NOT NULL,
    Comentario              NVARCHAR(300)     NULL,
    Fecha                   DATETIME2(3)      NOT NULL CONSTRAINT DF_HistorialEstadoPedido_Fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_HistorialEstadoPedido PRIMARY KEY (IDHistorialEstadoPedido),
    CONSTRAINT FK_HistorialEstadoPedido_Pedido FOREIGN KEY (IDPedido) REFERENCES dbo.Pedido (IDPedido),
    CONSTRAINT FK_HistorialEstadoPedido_EstadoAnterior FOREIGN KEY (IDEstadoAnterior) REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    CONSTRAINT FK_HistorialEstadoPedido_EstadoNuevo FOREIGN KEY (IDEstadoNuevo) REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    CONSTRAINT FK_HistorialEstadoPedido_Usuario FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuario (IDUsuario),
    CONSTRAINT CK_HistorialEstadoPedido_Estados CHECK (IDEstadoAnterior IS NULL OR IDEstadoAnterior <> IDEstadoNuevo)
);
GO

CREATE TABLE dbo.Devolucion (
    IDDevolucion   INT IDENTITY(1,1) NOT NULL,
    IDPedido       INT               NOT NULL,
    IDUsuario      INT               NOT NULL,  -- quien registró la devolución
    Tipo           NVARCHAR(10)      NOT NULL,
    Motivo         NVARCHAR(300)     NOT NULL,
    MontoReembolso DECIMAL(12,2)     NOT NULL,
    Fecha          DATETIME2(3)      NOT NULL CONSTRAINT DF_Devolucion_Fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Devolucion PRIMARY KEY (IDDevolucion),
    CONSTRAINT FK_Devolucion_Pedido FOREIGN KEY (IDPedido) REFERENCES dbo.Pedido (IDPedido),
    CONSTRAINT FK_Devolucion_Usuario FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuario (IDUsuario),
    -- Destino de las FK compuestas de DevolucionDetalle y MovimientoInventario.
    CONSTRAINT UQ_Devolucion_IDDevolucion_IDPedido UNIQUE (IDDevolucion, IDPedido),
    CONSTRAINT CK_Devolucion_Tipo CHECK (Tipo IN (N'TOTAL', N'PARCIAL')),
    CONSTRAINT CK_Devolucion_Motivo CHECK (LEN(TRIM(Motivo)) > 0),
    CONSTRAINT CK_Devolucion_MontoReembolso CHECK (MontoReembolso >= 0)
);
GO

CREATE TABLE dbo.DevolucionDetalle (
    IDDevolucionDetalle INT IDENTITY(1,1) NOT NULL,
    IDDevolucion        INT               NOT NULL,
    IDPedido            INT               NOT NULL,  -- repetido de la devolución para exigir que la línea sea del mismo pedido
    IDPedidoDetalle     INT               NOT NULL,
    Cantidad            INT               NOT NULL,
    MontoReembolso      DECIMAL(12,2)     NOT NULL,
    CONSTRAINT PK_DevolucionDetalle PRIMARY KEY (IDDevolucionDetalle),
    CONSTRAINT FK_DevolucionDetalle_Devolucion FOREIGN KEY (IDDevolucion, IDPedido) REFERENCES dbo.Devolucion (IDDevolucion, IDPedido),
    CONSTRAINT FK_DevolucionDetalle_PedidoDetalle FOREIGN KEY (IDPedidoDetalle, IDPedido) REFERENCES dbo.PedidoDetalle (IDPedidoDetalle, IDPedido),
    CONSTRAINT UQ_DevolucionDetalle_IDDevolucion_IDPedidoDetalle UNIQUE (IDDevolucion, IDPedidoDetalle),
    CONSTRAINT CK_DevolucionDetalle_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_DevolucionDetalle_MontoReembolso CHECK (MontoReembolso >= 0)
);
GO

-- Usos que cuentan contra los límites del cupón; cancelar el pedido borra su uso.
-- El cupón aplicado y el monto descontado quedan en Pedido (IDCupon, Descuento).
CREATE TABLE dbo.UsoCupon (
    IDUsoCupon INT IDENTITY(1,1) NOT NULL,
    IDCupon    INT               NOT NULL,
    IDUsuario  INT               NOT NULL,  -- repetido del pedido para contar los usos por cliente sin unir con Pedido
    IDPedido   INT               NOT NULL,
    Fecha      DATETIME2(3)      NOT NULL CONSTRAINT DF_UsoCupon_Fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_UsoCupon PRIMARY KEY (IDUsoCupon),
    CONSTRAINT FK_UsoCupon_Cupon FOREIGN KEY (IDCupon) REFERENCES dbo.Cupon (IDCupon),
    CONSTRAINT FK_UsoCupon_Usuario FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuario (IDUsuario),
    -- El uso coincide con el cliente y el cupón del pedido.
    CONSTRAINT FK_UsoCupon_Pedido FOREIGN KEY (IDPedido, IDUsuario, IDCupon) REFERENCES dbo.Pedido (IDPedido, IDUsuario, IDCupon),
    CONSTRAINT UQ_UsoCupon_IDPedido UNIQUE (IDPedido)  -- solo un cupón por pedido
);
GO

/* =========================================================
   Inventario
   ========================================================= */

CREATE TABLE dbo.TipoMovimientoInventario (
    IDTipoMovimientoInventario INT IDENTITY(1,1) NOT NULL,
    Codigo                     NVARCHAR(30)      NOT NULL,
    Nombre                     NVARCHAR(100)     NOT NULL,
    Signo                      SMALLINT          NOT NULL,  -- +1 entrada, -1 salida
    CONSTRAINT PK_TipoMovimientoInventario PRIMARY KEY (IDTipoMovimientoInventario),
    CONSTRAINT UQ_TipoMovimientoInventario_Codigo UNIQUE (Codigo),
    -- Destino de la FK compuesta de MovimientoInventario.
    CONSTRAINT UQ_TipoMovimientoInventario_IDTipoMovimientoInventario_Signo UNIQUE (IDTipoMovimientoInventario, Signo),
    CONSTRAINT CK_TipoMovimientoInventario_Signo CHECK (Signo IN (-1, 1))
);
GO

-- Kardex: historial inmutable de cada cambio de existencia física.
CREATE TABLE dbo.MovimientoInventario (
    IDMovimientoInventario     BIGINT IDENTITY(1,1) NOT NULL,
    IDVariante                 INT                  NOT NULL,
    IDTipoMovimientoInventario INT                  NOT NULL,
    Signo                      SMALLINT             NOT NULL,  -- repetido del tipo para que el CHECK valide la dirección del cambio
    IDUsuario                  INT                  NOT NULL,
    IDPedido                   INT                  NULL,
    IDDevolucion               INT                  NULL,
    Cantidad                   INT                  NOT NULL,
    ExistenciaAnterior         INT                  NOT NULL,
    ExistenciaNueva            INT                  NOT NULL,
    Motivo                     NVARCHAR(300)        NOT NULL,
    Fecha                      DATETIME2(3)         NOT NULL CONSTRAINT DF_MovimientoInventario_Fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_MovimientoInventario PRIMARY KEY (IDMovimientoInventario),
    CONSTRAINT FK_MovimientoInventario_Variante FOREIGN KEY (IDVariante) REFERENCES dbo.Variante (IDVariante),
    -- La FK compuesta garantiza que Signo sea el del tipo.
    CONSTRAINT FK_MovimientoInventario_TipoMovimientoInventario FOREIGN KEY (IDTipoMovimientoInventario, Signo) REFERENCES dbo.TipoMovimientoInventario (IDTipoMovimientoInventario, Signo),
    CONSTRAINT FK_MovimientoInventario_Usuario FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuario (IDUsuario),
    CONSTRAINT FK_MovimientoInventario_Pedido FOREIGN KEY (IDPedido) REFERENCES dbo.Pedido (IDPedido),
    -- Un movimiento por devolución lleva también el pedido de esa devolución.
    CONSTRAINT FK_MovimientoInventario_Devolucion FOREIGN KEY (IDDevolucion, IDPedido) REFERENCES dbo.Devolucion (IDDevolucion, IDPedido),
    CONSTRAINT CK_MovimientoInventario_Devolucion CHECK (IDDevolucion IS NULL OR IDPedido IS NOT NULL),
    CONSTRAINT CK_MovimientoInventario_Cantidad CHECK (Cantidad > 0),
    -- La existencia cambia exactamente en la cantidad del movimiento y en la dirección de su tipo.
    CONSTRAINT CK_MovimientoInventario_Existencias CHECK (ExistenciaAnterior >= 0 AND ExistenciaNueva >= 0 AND ExistenciaNueva = ExistenciaAnterior + Signo * Cantidad),
    CONSTRAINT CK_MovimientoInventario_Motivo CHECK (LEN(TRIM(Motivo)) > 0)
);
GO

-- Apartado temporal de unidades durante el checkout.
CREATE TABLE dbo.ReservaExistencia (
    IDReservaExistencia INT IDENTITY(1,1) NOT NULL,
    IDCarrito           INT               NOT NULL,
    IDVariante          INT               NOT NULL,
    Cantidad            INT               NOT NULL,
    Estado              NVARCHAR(20)      NOT NULL CONSTRAINT DF_ReservaExistencia_Estado DEFAULT (N'ACTIVA'),
    FechaExpiracion     DATETIME2(3)      NOT NULL,
    FechaCreacion       DATETIME2(3)      NOT NULL CONSTRAINT DF_ReservaExistencia_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_ReservaExistencia PRIMARY KEY (IDReservaExistencia),
    CONSTRAINT FK_ReservaExistencia_Carrito FOREIGN KEY (IDCarrito) REFERENCES dbo.Carrito (IDCarrito),
    CONSTRAINT FK_ReservaExistencia_Variante FOREIGN KEY (IDVariante) REFERENCES dbo.Variante (IDVariante),
    CONSTRAINT CK_ReservaExistencia_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_ReservaExistencia_Estado CHECK (Estado IN (N'ACTIVA', N'CONFIRMADA', N'LIBERADA')),
    CONSTRAINT CK_ReservaExistencia_Expiracion CHECK (FechaExpiracion > FechaCreacion)
);
GO

/* =========================================================
   Auditoría y configuración
   ========================================================= */

-- Bitácora inmutable (ver TR_Bitacora_ImpedirCambios en 004_triggers.sql).
CREATE TABLE dbo.Bitacora (
    IDBitacora    BIGINT IDENTITY(1,1) NOT NULL,
    IDUsuario     INT                  NOT NULL,
    Modulo        NVARCHAR(50)         NOT NULL,
    Entidad       NVARCHAR(50)         NOT NULL,
    IDRegistro    INT                  NOT NULL,
    Accion        NVARCHAR(20)         NOT NULL,
    ValorAnterior NVARCHAR(MAX)        NULL,  -- JSON
    ValorNuevo    NVARCHAR(MAX)        NULL,  -- JSON
    Fecha         DATETIME2(3)         NOT NULL CONSTRAINT DF_Bitacora_Fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Bitacora PRIMARY KEY (IDBitacora),
    CONSTRAINT FK_Bitacora_Usuario FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuario (IDUsuario),
    CONSTRAINT CK_Bitacora_Accion CHECK (Accion IN (N'CREAR', N'MODIFICAR', N'ACTIVAR', N'DESACTIVAR', N'ELIMINAR')),
    CONSTRAINT CK_Bitacora_ValorAnterior CHECK (ValorAnterior IS NULL OR ISJSON(ValorAnterior) = 1),
    CONSTRAINT CK_Bitacora_ValorNuevo CHECK (ValorNuevo IS NULL OR ISJSON(ValorNuevo) = 1)
);
GO

CREATE TABLE dbo.Configuracion (
    IDConfiguracion INT IDENTITY(1,1) NOT NULL,
    Clave           NVARCHAR(50)      NOT NULL,
    Valor           NVARCHAR(200)     NOT NULL,
    Descripcion     NVARCHAR(300)     NULL,
    CONSTRAINT PK_Configuracion PRIMARY KEY (IDConfiguracion),
    CONSTRAINT UQ_Configuracion_Clave UNIQUE (Clave)
);
GO
