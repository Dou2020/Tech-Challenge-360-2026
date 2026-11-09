/*
    script.sql
    Base de datos completa de ShopCart en un solo archivo: crea la base, las tablas, los índices,
    los triggers, las funciones, las vistas, los stored procedures, el login de la aplicación
    (solo permiso EXECUTE), los catálogos y los datos semilla.

    Se generó copiando, en orden y sin cambios, los 20 scripts de Database/scripts/ (001 a 015, 080, 085, 090,
    100 y 101) en el commit COMMIT_PENDIENTE. Los scripts numerados son la fuente de verdad: si alguno cambia, este
    archivo queda desactualizado. docker-init.sh y las pruebas usan los scripts numerados, no este.
    No incluye Database/pruebas/integridad.sql.

    ADVERTENCIA: si ya existe una base con el mismo nombre, se ELIMINA y se vuelve a crear con los
    datos semilla (lo hace 001_crear_base_datos.sql).

    Requisitos:
      - SQL Server 2019 o superior y un login con rol sysadmin (crea la base y el login, y la
        semilla deshabilita triggers dentro de su transacción).
      - Ejecutarlo en MODO SQLCMD: usa las variables DbName, AppLogin y AppPassword y se detiene
        en el primer error. Sin modo SQLCMD se detiene al inicio con un aviso, sin crear nada.

    Cómo ejecutarlo:
      - sqlcmd:  sqlcmd -S localhost,1433 -U sa -P '<contraseña>' -C -I -f 65001 -i Database/script.sql
      - SSMS:    menú Consulta > Modo SQLCMD y luego F5.
      - Azure Data Studio: botón "Enable SQLCMD" y luego Run.

    Variables (cámbialas en las líneas :setvar de abajo):
      DbName       nombre de la base (ShopCart)
      AppLogin     login que usa el backend (shopcart_app)
      AppPassword  contraseña de ese login; debe coincidir con DB_PASSWORD de Backend/.env y
                   cumplir la política de contraseñas del servidor (CHECK_POLICY = ON)

    Credenciales de prueba de la aplicación: ver "Credenciales de prueba" en el README.
*/
:on error exit
:setvar DbName      "ShopCart"
:setvar AppLogin    "shopcart_app"
:setvar AppPassword "ShopCartApp#2026"
GO

-- Sin modo SQLCMD las variables no se sustituyen: se crearía una base llamada literalmente "$" + "(DbName)".
-- En ese caso se avisa y SET NOEXEC ON evita que se ejecuten los lotes siguientes. Va en su propio lote:
-- sin modo SQLCMD, las líneas :setvar de arriba fallan y SQL Server descarta todo el lote donde están.
IF N'$(DbName)' = N'$' + N'(DbName)'
BEGIN
    RAISERROR(N'Activa el modo SQLCMD (SSMS: Consulta > Modo SQLCMD) y vuelve a ejecutar.', 16, 1);
    SET NOEXEC ON;
END;
GO

-- Igual que la opción -I con la que docker-init.sh ejecuta los scripts (índices filtrados, SPs).
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ===== 001_crear_base_datos.sql =====
/*
    001_crear_base_datos.sql
    Elimina y vuelve a crear la base de datos.

    Variables de sqlcmd:
      $(DbName)  nombre de la base (ShopCart; las pruebas usan ShopCart_Test)
*/
USE master;
GO

IF DB_ID(N'$(DbName)') IS NOT NULL
BEGIN
    ALTER DATABASE [$(DbName)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$(DbName)];
END;
GO

-- CI_AI: las búsquedas y los UNIQUE no distinguen mayúsculas ni tildes.
CREATE DATABASE [$(DbName)] COLLATE Modern_Spanish_100_CI_AI;
GO

-- Las lecturas no bloquean a las escrituras; las escrituras críticas usan UPDLOCK en los SPs.
ALTER DATABASE [$(DbName)] SET READ_COMMITTED_SNAPSHOT ON;
GO

-- ===== 002_tablas.sql =====
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
    HashContrasena    NVARCHAR(255)     NULL,  -- NULL: contraseña pendiente de crear (enlace de un solo uso por correo)
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

-- Tarjeta de crédito o débito guardada por el cliente para el checkout. Solo guarda lo que muestra un
-- recibo (titular, marca, tipo y últimos 4 dígitos): el número completo, el vencimiento y el CVV
-- nunca se piden ni se guardan. Borrado físico: Pago no la referencia y la auditoría queda en Bitacora.
CREATE TABLE dbo.TarjetaGuardada (
    IDTarjetaGuardada INT IDENTITY(1,1) NOT NULL,
    IDUsuario         INT               NOT NULL,
    Titular           NVARCHAR(150)     NOT NULL,
    Ultimos4          CHAR(4)           NOT NULL,
    Tipo              NVARCHAR(10)      NOT NULL,
    Marca             NVARCHAR(20)      NOT NULL,
    Predeterminada    BIT               NOT NULL CONSTRAINT DF_TarjetaGuardada_Predeterminada DEFAULT (0),
    FechaCreacion     DATETIME2(3)      NOT NULL CONSTRAINT DF_TarjetaGuardada_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_TarjetaGuardada PRIMARY KEY (IDTarjetaGuardada),
    CONSTRAINT FK_TarjetaGuardada_Usuario FOREIGN KEY (IDUsuario) REFERENCES dbo.Usuario (IDUsuario),
    -- No se duplica la misma tarjeta de un cliente.
    CONSTRAINT UQ_TarjetaGuardada_Tarjeta UNIQUE (IDUsuario, Marca, Tipo, Ultimos4),
    CONSTRAINT CK_TarjetaGuardada_Titular CHECK (LEN(LTRIM(RTRIM(Titular))) > 0),
    CONSTRAINT CK_TarjetaGuardada_Ultimos4 CHECK (Ultimos4 LIKE '[0-9][0-9][0-9][0-9]'),
    CONSTRAINT CK_TarjetaGuardada_Tipo CHECK (Tipo IN (N'CREDITO', N'DEBITO')),
    CONSTRAINT CK_TarjetaGuardada_Marca CHECK (Marca IN (N'VISA', N'MASTERCARD', N'AMEX', N'OTRA'))
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

-- ===== 003_indices.sql =====
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
-- A lo sumo una tarjeta predeterminada por cliente.
CREATE UNIQUE INDEX UX_TarjetaGuardada_Predeterminada ON dbo.TarjetaGuardada (IDUsuario) WHERE Predeterminada = 1;
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
-- Carritos con un cupón aplicado (SP_Cupones_Eliminar y los conteos de SP_Cupones_*).
CREATE INDEX IX_Carrito_IDCupon ON dbo.Carrito (IDCupon) WHERE IDCupon IS NOT NULL;
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

-- ===== 004_triggers.sql =====
/*
    004_triggers.sql
    Reglas críticas que la base protege aunque alguien salte los stored procedures.

    Errores (ver Backend/API.md, catálogo de códigos):
      50040  TRANSICION_NO_PERMITIDA
      50070  BITACORA_INMUTABLE
      50071  KARDEX_INMUTABLE
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

-- La bitácora no puede modificarse ni eliminarse.
CREATE OR ALTER TRIGGER dbo.TR_Bitacora_ImpedirCambios
ON dbo.Bitacora
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50070, N'La bitácora no puede modificarse ni eliminarse.', 1;
END;
GO

-- El kardex es la fuente de verdad de la existencia: los movimientos no se editan ni se borran.
-- Para corregir un error se registra un ajuste.
CREATE OR ALTER TRIGGER dbo.TR_Inventario_ImpedirCambiosKardex
ON dbo.MovimientoInventario
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50071, N'Los movimientos de inventario no pueden modificarse ni eliminarse; registra un ajuste.', 1;
END;
GO

-- Un pedido nace en PAGADO y solo cambia a un estado definido en TransicionEstadoPedido.
-- La validación por rol la hace el SP; aquí se valida el par (anterior, nuevo).
CREATE OR ALTER TRIGGER dbo.TR_Pedidos_ValidarTransicion
ON dbo.Pedido
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT UPDATE(IDEstadoPedido)
        RETURN;

    -- Inserción: deleted viene vacía.
    IF NOT EXISTS (SELECT 1 FROM deleted)
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM inserted AS i
            INNER JOIN dbo.EstadoPedido AS e ON e.IDEstadoPedido = i.IDEstadoPedido
            WHERE e.Codigo <> N'PAGADO'
        )
        BEGIN
            THROW 50040, N'Un pedido nuevo debe crearse en estado PAGADO.', 1;
        END;

        RETURN;
    END;

    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        INNER JOIN deleted AS d ON d.IDPedido = i.IDPedido
        WHERE i.IDEstadoPedido <> d.IDEstadoPedido
          AND NOT EXISTS (
                SELECT 1
                FROM dbo.TransicionEstadoPedido AS t
                WHERE t.IDEstadoOrigen = d.IDEstadoPedido
                  AND t.IDEstadoDestino = i.IDEstadoPedido
          )
    )
    BEGIN
        THROW 50040, N'Transición de estado del pedido no permitida.', 1;
    END;
END;
GO

-- ===== 005_funciones.sql =====
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

-- ===== 006_vistas.sql =====
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

-- ===== 007_sp_auth.sql =====
/*
    007_sp_auth.sql
    Stored procedures de autenticación, perfil, usuarios y direcciones de entrega.

    Las sesiones (refresh tokens, revocación, bloqueo de login) viven en Redis: aquí solo se
    leen y escriben los datos del usuario. El hash de la contraseña (argon2id) lo calcula y lo
    verifica el backend; la base nunca recibe la contraseña en claro.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (SP_Usuarios_ValidarSolicitante)
      50051  EN_USO (administrador que se desactiva o se quita el rol, o el último administrador activo)
      2627   DUPLICADO (violación de UQ_Usuario_Correo; no tiene número de THROW propio)

    Sin objetos pendientes en este archivo.
    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Autenticación
   ========================================================= */

-- POST /api/auth/registro: crea un usuario con rol Cliente, activo.
-- El correo se guarda sin espacios y en minúsculas; la collation CI_AI ya hace que la
-- comparación y UQ_Usuario_Correo no distingan mayúsculas ni tildes.
--
-- Correo repetido: no se comprueba antes con IF EXISTS ni se lanza un THROW propio.
-- DUPLICADO no tiene número de THROW en el catálogo: sqlErrorMapper lo reconoce por el
-- error 2627/2601 de una UNIQUE. Una comprobación previa (aun con UPDLOCK, HOLDLOCK) solo
-- podría terminar en ese mismo INSERT fallido, así que no aporta nada. UQ_Usuario_Correo es
-- atómica: si dos registros con el mismo correo llegan a la vez, el segundo espera el bloqueo
-- de la llave del primero y recibe 2627 cuando este confirma. Es la vía normal y documentada
-- para DUPLICADO (Backend/API.md §4), no una validación omitida.
CREATE OR ALTER PROCEDURE dbo.SP_Auth_RegistrarCliente
    @Correo         NVARCHAR(150),
    @Nombre         NVARCHAR(100),
    @Apellido       NVARCHAR(100),
    @Telefono       NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDUsuario INT;
    DECLARE @IDRolCliente INT;

    SET @Correo   = LOWER(TRIM(@Correo));
    SET @Nombre   = TRIM(@Nombre);
    SET @Apellido = TRIM(@Apellido);
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar: las mismas reglas que CK_Usuario_Correo y los NOT NULL, con código de negocio.
        IF @Correo IS NULL OR @Correo NOT LIKE N'%_@_%._%'
            THROW 50001, N'El correo no tiene un formato válido.', 1;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre es obligatorio.', 1;

        IF @Apellido IS NULL OR LEN(@Apellido) = 0
            THROW 50001, N'El apellido es obligatorio.', 1;

        -- El rol se busca por nombre, nunca por ID fijo.
        SELECT @IDRolCliente = IDRol
        FROM dbo.Rol
        WHERE Nombre = N'Cliente';

        -- Sin el rol la instalación está incompleta: número fuera del catálogo, el backend responde 500.
        IF @IDRolCliente IS NULL
            THROW 50000, N'No existe el rol Cliente; ejecuta 085_datos_catalogos.sql.', 1;

        -- 2-3. Escribir. Un correo repetido termina aquí con 2627 (UQ_Usuario_Correo) → DUPLICADO.
        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono, Activo)
        --    HashContrasena queda NULL: el cliente crea su contraseña con el enlace enviado por correo.
        VALUES (@IDRolCliente, @Correo, NULL, @Nombre, @Apellido, @Telefono, 1);

        SET @IDUsuario = SCOPE_IDENTITY();

        -- 4. El registro de un cliente no va a la bitácora: el enunciado la exige para productos,
        --    precios, existencias, cupones y estados de pedido.

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT
            u.IDUsuario,
            u.Correo,
            u.Nombre,
            u.Apellido,
            u.Telefono,
            r.Nombre AS Rol,
            u.Activo,
            u.FechaCreacion
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/auth/login: datos para verificar la contraseña en el backend.
-- Devuelve 0 o 1 fila e incluye usuarios inactivos. No lanza errores: el backend responde
-- CREDENCIALES_INVALIDAS o USUARIO_INACTIVO sin revelar si el correo existe.
CREATE OR ALTER PROCEDURE dbo.SP_Auth_ObtenerUsuarioPorCorreo
    @Correo NVARCHAR(150)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.IDUsuario,
        u.Correo,
        u.HashContrasena,
        u.Nombre,
        u.Apellido,
        r.Nombre AS Rol,
        u.Activo,
        CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.Correo = TRIM(@Correo);  -- CI_AI: no distingue mayúsculas ni tildes
END;
GO

/* =========================================================
   Usuarios
   ========================================================= */

-- GET /api/auth/me, POST /api/auth/refresh, GET /api/perfil y GET /api/usuarios/:id.
-- Nunca devuelve el hash de la contraseña. Incluye usuarios inactivos: el refresh necesita
-- saber que el usuario se desactivó para revocar la sesión.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ObtenerPorId
    @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Usuario WHERE IDUsuario = @IDUsuario)
        THROW 50004, N'El usuario no existe.', 1;

    SELECT
        u.IDUsuario,
        u.Correo,
        u.Nombre,
        u.Apellido,
        u.Telefono,
        r.Nombre AS Rol,
        u.Activo,
        u.FechaCreacion,
        CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuario;
END;
GO

-- Uso interno de los SPs que escriben (no tiene endpoint). El solicitante sale del JWT, pero la
-- base no lo da por bueno: sin esta validación, un ID inexistente terminaría en un 547 de
-- FK_Bitacora_Usuario, y un usuario recién desactivado podría seguir escribiendo mientras su
-- access token no venza. Se llama dentro de la transacción del SP que escribe.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ValidarSolicitante
    @IDUsuarioSolicitante INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Activo BIT;

    SELECT @Activo = Activo
    FROM dbo.Usuario
    WHERE IDUsuario = @IDUsuarioSolicitante;

    IF @Activo IS NULL
        THROW 50004, N'El usuario solicitante no existe.', 1;

    IF @Activo = 0
        THROW 50012, N'El usuario solicitante está desactivado.', 1;
END;
GO

/* =========================================================
   Perfil y administración de usuarios
   ========================================================= */
-- Reglas de la administración de usuarios:
--   * Nadie, ni un Administrador, puede desactivarse a sí mismo ni quitarse el rol de
--     Administrador (50051 EN_USO: el backend lo responde 409).
--   * El sistema nunca se queda sin un Administrador activo: desactivar o cambiar de rol al
--     último (50051). Se bloquean (UPDLOCK) todos los administradores activos antes de contar,
--     así dos desactivaciones simultáneas no pueden dejar el sistema sin ninguno.
--   * La bitácora (Modulo 'Usuarios', Entidad 'Usuario') guarda la foto del usuario con
--     FU_Usuarios_UsuarioJson, que nunca incluye el hash de la contraseña.
-- Los SPs que modifican a otro usuario devuelven las columnas de SP_Usuarios_ObtenerPorId y dos
-- más, RolCambio y ActivoCambio (BIT), para que el backend sepa si debe revocar las sesiones
-- del usuario (cambió de rol o se desactivó) o invalidar su caché.

-- Uso de PUT /api/perfil/contrasena: el backend verifica la contraseña actual contra este hash.
-- Devuelve IDUsuario, HashContrasena (NULL si la contraseña está pendiente) y Activo (nunca va a la bitácora ni a una respuesta HTTP).
-- Usuario inexistente → 50004.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ObtenerCredencialPorId
    @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Usuario WHERE IDUsuario = @IDUsuario)
        THROW 50004, N'El usuario no existe.', 1;

    SELECT IDUsuario, HashContrasena, Activo
    FROM dbo.Usuario
    WHERE IDUsuario = @IDUsuario;
END;
GO

-- PUT /api/perfil: el usuario actualiza su nombre, apellido y teléfono (NULL o vacío lo borra).
-- El correo y el rol no se cambian aquí. No va a la bitácora (datos personales, no del negocio).
-- Resultado: SP_Usuarios_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ActualizarPerfil
    @IDUsuarioSolicitante INT,
    @Nombre               NVARCHAR(100),
    @Apellido             NVARCHAR(100),
    @Telefono             NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bloqueo INT;
    SET @Nombre   = NULLIF(TRIM(@Nombre), N'');
    SET @Apellido = NULLIF(TRIM(@Apellido), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @Nombre IS NULL
            THROW 50001, N'El nombre es obligatorio.', 1;

        IF @Apellido IS NULL
            THROW 50001, N'El apellido es obligatorio.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear
        SELECT @Bloqueo = IDUsuario FROM dbo.Usuario WITH (UPDLOCK, ROWLOCK) WHERE IDUsuario = @IDUsuarioSolicitante;

        -- 3. Escribir
        UPDATE dbo.Usuario
        SET Nombre = @Nombre,
            Apellido = @Apellido,
            Telefono = @Telefono,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDUsuario = @IDUsuarioSolicitante;

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Usuarios_ObtenerPorId @IDUsuario = @IDUsuarioSolicitante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/perfil/contrasena y establecer contraseña por token (el solicitante es el dueño del token;
-- funciona también si el hash actual es NULL): guarda el hash nuevo (argon2id, calculado por el backend).
-- Deja en la bitácora que la contraseña cambió, sin ningún valor de la contraseña ni del hash.
-- Sin result set.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_CambiarContrasena
    @IDUsuarioSolicitante INT,
    @HashContrasena       NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bloqueo INT;
    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @HashContrasena IS NULL OR LEN(TRIM(@HashContrasena)) = 0
            THROW 50001, N'La contraseña es obligatoria.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear
        SELECT @Bloqueo = IDUsuario FROM dbo.Usuario WITH (UPDLOCK, ROWLOCK) WHERE IDUsuario = @IDUsuarioSolicitante;

        -- 3. Escribir
        UPDATE dbo.Usuario
        SET HashContrasena = @HashContrasena,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDUsuario = @IDUsuarioSolicitante;

        -- 4. Bitácora: solo el hecho, nunca el hash.
        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Usuarios', N'Usuario', @IDUsuarioSolicitante, N'MODIFICAR',
                NULL, N'{"ContrasenaCambiada":true}');

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- GET /api/usuarios: lista paginada (Admin). Mismas columnas que SP_Usuarios_ObtenerPorId.
--   @Texto   busca en "nombre apellido" y en el correo (literal, sin comodines)
--   @Rol     nombre del rol (Cliente, Operador, Administrador)
--   @Activo  1 o 0
--   @Orden   nombre | correo | rol | fechaCreacion, con :asc o :desc (por defecto nombre:asc)
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Listar
    @Texto        NVARCHAR(100) = NULL,
    @Rol          NVARCHAR(50)  = NULL,
    @Activo       BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Rol   = NULLIF(TRIM(@Rol), N'');
    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'nombre:asc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'nombre:asc', N'nombre:desc', N'correo:asc', N'correo:desc',
                      N'rol:asc', N'rol:desc', N'fechaCreacion:asc', N'fechaCreacion:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa nombre, correo, rol o fechaCreacion con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDUsuario      INT           NOT NULL PRIMARY KEY,
        NombreCompleto NVARCHAR(201) NOT NULL,
        Correo         NVARCHAR(150) NOT NULL,
        Rol            NVARCHAR(50)  NOT NULL,
        FechaCreacion  DATETIME2(3)  NOT NULL
    );

    INSERT INTO @Fila (IDUsuario, NombreCompleto, Correo, Rol, FechaCreacion)
    SELECT u.IDUsuario, CONCAT(u.Nombre, N' ', u.Apellido), u.Correo, r.Nombre, u.FechaCreacion
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE (@Activo IS NULL OR u.Activo = @Activo)
      AND (@Rol IS NULL OR r.Nombre = @Rol)
      AND (@Patron IS NULL OR CONCAT(u.Nombre, N' ', u.Apellido) LIKE @Patron OR u.Correo LIKE @Patron)
    OPTION (RECOMPILE);

    SELECT
        u.IDUsuario,
        u.Correo,
        u.Nombre,
        u.Apellido,
        u.Telefono,
        f.Rol,
        u.Activo,
        u.FechaCreacion,
        CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente
    FROM @Fila AS f
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = f.IDUsuario
    ORDER BY
        CASE WHEN @Orden = N'nombre:asc'         THEN f.NombreCompleto END ASC,
        CASE WHEN @Orden = N'nombre:desc'        THEN f.NombreCompleto END DESC,
        CASE WHEN @Orden = N'correo:asc'         THEN f.Correo         END ASC,
        CASE WHEN @Orden = N'correo:desc'        THEN f.Correo         END DESC,
        CASE WHEN @Orden = N'rol:asc'            THEN f.Rol            END ASC,
        CASE WHEN @Orden = N'rol:desc'           THEN f.Rol            END DESC,
        CASE WHEN @Orden = N'fechaCreacion:asc'  THEN f.FechaCreacion  END ASC,
        CASE WHEN @Orden = N'fechaCreacion:desc' THEN f.FechaCreacion  END DESC,
        f.IDUsuario ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- POST /api/usuarios: crea un Operador o un Administrador activo (un Cliente se registra solo
-- con SP_Auth_RegistrarCliente). @Rol: 'Operador' o 'Administrador'; otro valor → 50001.
-- Un correo repetido termina en 2627 (UQ_Usuario_Correo) → DUPLICADO, igual que el registro.
-- Resultado: SP_Usuarios_ObtenerPorId del usuario creado.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Crear
    @IDUsuarioSolicitante INT,
    @Correo               NVARCHAR(150),
    @Nombre               NVARCHAR(100),
    @Apellido             NVARCHAR(100),
    @Telefono             NVARCHAR(20) = NULL,
    @Rol                  NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDUsuario INT;
    DECLARE @IDRol INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Correo   = LOWER(TRIM(@Correo));
    SET @Nombre   = NULLIF(TRIM(@Nombre), N'');
    SET @Apellido = NULLIF(TRIM(@Apellido), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');
    SET @Rol      = NULLIF(TRIM(@Rol), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @Correo IS NULL OR @Correo NOT LIKE N'%_@_%._%'
            THROW 50001, N'El correo no tiene un formato válido.', 1;

        IF @Nombre IS NULL
            THROW 50001, N'El nombre es obligatorio.', 1;

        IF @Apellido IS NULL
            THROW 50001, N'El apellido es obligatorio.', 1;

        IF @Rol IS NULL OR @Rol NOT IN (N'Operador', N'Administrador')
            THROW 50001, N'El rol debe ser Operador o Administrador.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SELECT @IDRol = IDRol FROM dbo.Rol WHERE Nombre = @Rol;

        IF @IDRol IS NULL
            THROW 50001, N'El rol no existe.', 1;

        -- 3. Escribir (correo repetido: 2627)
        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono, Activo)
        --    HashContrasena queda NULL: el usuario crea su contraseña con el enlace enviado por correo.
        VALUES (@IDRol, @Correo, NULL, @Nombre, @Apellido, @Telefono, 1);

        SET @IDUsuario = SCOPE_IDENTITY();

        -- 4. Bitácora
        SELECT @Nuevo = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Usuarios', N'Usuario', @IDUsuario, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Usuarios_ObtenerPorId @IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/usuarios/:id: actualiza nombre, apellido, teléfono (NULL o vacío lo borra) y rol.
-- @Rol NULL conserva el rol actual; el correo no se cambia. Cambiar el rol de un Cliente a
-- Operador o Administrador (y al revés) está permitido.
--   50004  el usuario no existe
--   50051  el solicitante intenta quitarse el rol de Administrador, o se quitaría el último
--          Administrador activo
-- Sin cambios reales no escribe ni registra bitácora. Si algo cambia, la bitácora es MODIFICAR
-- con la foto anterior y la nueva.
-- Resultado: columnas de SP_Usuarios_ObtenerPorId + RolCambio BIT + ActivoCambio BIT (siempre 0).
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Actualizar
    @IDUsuarioSolicitante INT,
    @IDUsuario            INT,
    @Nombre               NVARCHAR(100),
    @Apellido             NVARCHAR(100),
    @Telefono             NVARCHAR(20) = NULL,
    @Rol                  NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bloqueo INT;
    DECLARE @IDRolActual INT;
    DECLARE @IDRolNuevo INT;
    DECLARE @IDRolAdmin INT;
    DECLARE @ActivoActual BIT;
    DECLARE @RolCambio BIT = 0;
    DECLARE @Anterior NVARCHAR(MAX);
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Nombre   = NULLIF(TRIM(@Nombre), N'');
    SET @Apellido = NULLIF(TRIM(@Apellido), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');
    SET @Rol      = NULLIF(TRIM(@Rol), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @Nombre IS NULL
            THROW 50001, N'El nombre es obligatorio.', 1;

        IF @Apellido IS NULL
            THROW 50001, N'El apellido es obligatorio.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SELECT @IDRolAdmin = IDRol FROM dbo.Rol WHERE Nombre = N'Administrador';

        -- 2. Bloquear a los administradores activos y al usuario
        SELECT @Bloqueo = IDUsuario FROM dbo.Usuario WITH (UPDLOCK, ROWLOCK)
        WHERE (IDRol = @IDRolAdmin AND Activo = 1) OR IDUsuario = @IDUsuario;

        SELECT @IDRolActual = IDRol, @ActivoActual = Activo
        FROM dbo.Usuario
        WHERE IDUsuario = @IDUsuario;

        IF @IDRolActual IS NULL
            THROW 50004, N'El usuario no existe.', 1;

        IF @Rol IS NULL
            SET @IDRolNuevo = @IDRolActual;
        ELSE
        BEGIN
            SELECT @IDRolNuevo = IDRol FROM dbo.Rol WHERE Nombre = @Rol;

            IF @IDRolNuevo IS NULL
                THROW 50001, N'El rol no existe.', 1;
        END;

        IF @IDRolActual = @IDRolAdmin AND @IDRolNuevo <> @IDRolAdmin AND @ActivoActual = 1
        BEGIN
            IF @IDUsuario = @IDUsuarioSolicitante
                THROW 50051, N'Un administrador no puede quitarse a sí mismo el rol de Administrador.', 1;

            IF NOT EXISTS (SELECT 1 FROM dbo.Usuario
                           WHERE IDRol = @IDRolAdmin AND Activo = 1 AND IDUsuario <> @IDUsuario)
                THROW 50051, N'No se puede quitar el rol al último administrador activo.', 1;
        END;

        SELECT @Anterior = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

        -- 3. Escribir y 4. Bitácora (solo si algo cambia)
        IF EXISTS (SELECT 1 FROM dbo.Usuario
                   WHERE IDUsuario = @IDUsuario
                     AND (Nombre COLLATE Latin1_General_BIN2 <> @Nombre COLLATE Latin1_General_BIN2
                          OR Apellido COLLATE Latin1_General_BIN2 <> @Apellido COLLATE Latin1_General_BIN2
                          OR ISNULL(Telefono, N'') COLLATE Latin1_General_BIN2 <> ISNULL(@Telefono, N'') COLLATE Latin1_General_BIN2
                          OR IDRol <> @IDRolNuevo))
        BEGIN
            UPDATE dbo.Usuario
            SET Nombre = @Nombre,
                Apellido = @Apellido,
                Telefono = @Telefono,
                IDRol = @IDRolNuevo,
                FechaModificacion = SYSUTCDATETIME()
            WHERE IDUsuario = @IDUsuario;

            SET @RolCambio = CASE WHEN @IDRolNuevo <> @IDRolActual THEN 1 ELSE 0 END;

            SELECT @Nuevo = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Usuarios', N'Usuario', @IDUsuario, N'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT
            u.IDUsuario,
            u.Correo,
            u.Nombre,
            u.Apellido,
            u.Telefono,
            r.Nombre AS Rol,
            u.Activo,
            u.FechaCreacion,
            CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente,
            @RolCambio AS RolCambio,
            CONVERT(BIT, 0) AS ActivoCambio
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/usuarios/:id/estado: activa o desactiva un usuario.
--   50004  el usuario no existe
--   50051  el solicitante intenta desactivarse a sí mismo, o se desactivaría al último
--          Administrador activo
-- Activar o desactivar a quien ya está en ese estado no escribe ni registra nada (ActivoCambio = 0).
-- Bitácora: ACTIVAR o DESACTIVAR con la foto anterior y la nueva.
-- Resultado: columnas de SP_Usuarios_ObtenerPorId + RolCambio BIT (siempre 0) + ActivoCambio BIT.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDUsuario            INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bloqueo INT;
    DECLARE @IDRolActual INT;
    DECLARE @IDRolAdmin INT;
    DECLARE @ActivoActual BIT;
    DECLARE @ActivoCambio BIT = 0;
    DECLARE @Anterior NVARCHAR(MAX);
    DECLARE @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SELECT @IDRolAdmin = IDRol FROM dbo.Rol WHERE Nombre = N'Administrador';

        -- 2. Bloquear a los administradores activos y al usuario
        SELECT @Bloqueo = IDUsuario FROM dbo.Usuario WITH (UPDLOCK, ROWLOCK)
        WHERE (IDRol = @IDRolAdmin AND Activo = 1) OR IDUsuario = @IDUsuario;

        SELECT @IDRolActual = IDRol, @ActivoActual = Activo
        FROM dbo.Usuario
        WHERE IDUsuario = @IDUsuario;

        IF @IDRolActual IS NULL
            THROW 50004, N'El usuario no existe.', 1;

        IF @Activo = 0 AND @ActivoActual = 1
        BEGIN
            IF @IDUsuario = @IDUsuarioSolicitante
                THROW 50051, N'No puedes desactivar tu propia cuenta.', 1;

            IF @IDRolActual = @IDRolAdmin
               AND NOT EXISTS (SELECT 1 FROM dbo.Usuario
                               WHERE IDRol = @IDRolAdmin AND Activo = 1 AND IDUsuario <> @IDUsuario)
                THROW 50051, N'No se puede desactivar al último administrador activo.', 1;
        END;

        -- 3. Escribir y 4. Bitácora (solo si el estado cambia)
        IF @ActivoActual <> @Activo
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

            UPDATE dbo.Usuario
            SET Activo = @Activo,
                FechaModificacion = SYSUTCDATETIME()
            WHERE IDUsuario = @IDUsuario;

            SELECT @Nuevo = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Usuarios', N'Usuario', @IDUsuario,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);

            SET @ActivoCambio = 1;
        END;

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT
            u.IDUsuario,
            u.Correo,
            u.Nombre,
            u.Apellido,
            u.Telefono,
            r.Nombre AS Rol,
            u.Activo,
            u.FechaCreacion,
            CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente,
            CONVERT(BIT, 0) AS RolCambio,
            @ActivoCambio AS ActivoCambio
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Direcciones
   ========================================================= */
-- Direcciones de entrega del cliente. Todas reciben @IDUsuarioSolicitante (sale del JWT) y solo
-- ven sus direcciones activas: la de otro usuario, la inexistente y la dada de baja responden
-- igual, 50004, sin revelar cuál de los tres casos es. La baja es lógica (Activo = 0) porque
-- Pedido apunta a la dirección (FK_Pedido_Direccion); el pedido conserva su copia en
-- DireccionEntrega, así que editar o dar de baja una dirección no altera pedidos ya hechos.
-- No van a la bitácora: el enunciado la exige para productos, precios, existencias, cupones y
-- estados de pedido.
-- Los textos se guardan sin espacios al inicio ni al final; los opcionales vacíos quedan en NULL.

-- Dirección activa del solicitante (GET /api/direcciones/:id si el backend la expone). También
-- es el resultado de SP_Direcciones_Crear y SP_Direcciones_Actualizar. Mismas columnas que
-- SP_Direcciones_ListarPorUsuario.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_ObtenerPorId
    @IDUsuarioSolicitante INT,
    @IDDireccion          INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Direccion
                   WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuarioSolicitante AND Activo = 1)
        THROW 50004, N'La dirección no existe.', 1;

    SELECT
        IDDireccion,
        Alias,
        NombreDestinatario,
        Telefono,
        Linea1,
        Linea2,
        Municipio,
        Departamento,
        CodigoPostal,
        Referencias
    FROM dbo.Direccion
    WHERE IDDireccion = @IDDireccion
      AND IDUsuario = @IDUsuarioSolicitante
      AND Activo = 1;
END;
GO

-- GET /api/direcciones: direcciones activas del solicitante, en el orden en que las creó.
-- Sin paginar: un cliente tiene pocas. Un usuario sin direcciones devuelve 0 filas.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_ListarPorUsuario
    @IDUsuarioSolicitante INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        IDDireccion,
        Alias,
        NombreDestinatario,
        Telefono,
        Linea1,
        Linea2,
        Municipio,
        Departamento,
        CodigoPostal,
        Referencias
    FROM dbo.Direccion
    WHERE IDUsuario = @IDUsuarioSolicitante
      AND Activo = 1
    ORDER BY IDDireccion;
END;
GO

-- POST /api/direcciones: crea una dirección activa del solicitante.
-- Obligatorios: alias, destinatario, teléfono, línea 1, municipio y departamento.
-- Resultado: SP_Direcciones_ObtenerPorId de la dirección creada.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Crear
    @IDUsuarioSolicitante INT,
    @Alias                NVARCHAR(50),
    @NombreDestinatario   NVARCHAR(150),
    @Telefono             NVARCHAR(20),
    @Linea1               NVARCHAR(200),
    @Linea2               NVARCHAR(200) = NULL,
    @Municipio            NVARCHAR(100),
    @Departamento         NVARCHAR(100),
    @CodigoPostal         NVARCHAR(10)  = NULL,
    @Referencias          NVARCHAR(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDDireccion INT;

    SET @Alias              = NULLIF(TRIM(@Alias), N'');
    SET @NombreDestinatario = NULLIF(TRIM(@NombreDestinatario), N'');
    SET @Telefono           = NULLIF(TRIM(@Telefono), N'');
    SET @Linea1             = NULLIF(TRIM(@Linea1), N'');
    SET @Linea2             = NULLIF(TRIM(@Linea2), N'');
    SET @Municipio          = NULLIF(TRIM(@Municipio), N'');
    SET @Departamento       = NULLIF(TRIM(@Departamento), N'');
    SET @CodigoPostal       = NULLIF(TRIM(@CodigoPostal), N'');
    SET @Referencias        = NULLIF(TRIM(@Referencias), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Alias IS NULL
            THROW 50001, N'El alias de la dirección es obligatorio.', 1;

        IF @NombreDestinatario IS NULL
            THROW 50001, N'El nombre del destinatario es obligatorio.', 1;

        IF @Telefono IS NULL
            THROW 50001, N'El teléfono es obligatorio.', 1;

        IF @Linea1 IS NULL
            THROW 50001, N'La dirección (línea 1) es obligatoria.', 1;

        IF @Municipio IS NULL
            THROW 50001, N'El municipio es obligatorio.', 1;

        IF @Departamento IS NULL
            THROW 50001, N'El departamento es obligatorio.', 1;

        -- 2-3. Escribir
        INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, Linea2,
                                   Municipio, Departamento, CodigoPostal, Referencias, Activo)
        VALUES (@IDUsuarioSolicitante, @Alias, @NombreDestinatario, @Telefono, @Linea1, @Linea2,
                @Municipio, @Departamento, @CodigoPostal, @Referencias, 1);

        SET @IDDireccion = SCOPE_IDENTITY();

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Direcciones_ObtenerPorId @IDUsuarioSolicitante = @IDUsuarioSolicitante, @IDDireccion = @IDDireccion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/direcciones/:id: reemplaza todos los campos de una dirección activa del solicitante
-- (los opcionales en NULL se borran). Mismas reglas que SP_Direcciones_Crear.
-- Resultado: SP_Direcciones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Actualizar
    @IDUsuarioSolicitante INT,
    @IDDireccion          INT,
    @Alias                NVARCHAR(50),
    @NombreDestinatario   NVARCHAR(150),
    @Telefono             NVARCHAR(20),
    @Linea1               NVARCHAR(200),
    @Linea2               NVARCHAR(200) = NULL,
    @Municipio            NVARCHAR(100),
    @Departamento         NVARCHAR(100),
    @CodigoPostal         NVARCHAR(10)  = NULL,
    @Referencias          NVARCHAR(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Alias              = NULLIF(TRIM(@Alias), N'');
    SET @NombreDestinatario = NULLIF(TRIM(@NombreDestinatario), N'');
    SET @Telefono           = NULLIF(TRIM(@Telefono), N'');
    SET @Linea1             = NULLIF(TRIM(@Linea1), N'');
    SET @Linea2             = NULLIF(TRIM(@Linea2), N'');
    SET @Municipio          = NULLIF(TRIM(@Municipio), N'');
    SET @Departamento       = NULLIF(TRIM(@Departamento), N'');
    SET @CodigoPostal       = NULLIF(TRIM(@CodigoPostal), N'');
    SET @Referencias        = NULLIF(TRIM(@Referencias), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Alias IS NULL
            THROW 50001, N'El alias de la dirección es obligatorio.', 1;

        IF @NombreDestinatario IS NULL
            THROW 50001, N'El nombre del destinatario es obligatorio.', 1;

        IF @Telefono IS NULL
            THROW 50001, N'El teléfono es obligatorio.', 1;

        IF @Linea1 IS NULL
            THROW 50001, N'La dirección (línea 1) es obligatoria.', 1;

        IF @Municipio IS NULL
            THROW 50001, N'El municipio es obligatorio.', 1;

        IF @Departamento IS NULL
            THROW 50001, N'El departamento es obligatorio.', 1;

        -- 2. Bloquear la dirección; la de otro usuario o dada de baja no existe para el solicitante.
        IF NOT EXISTS (SELECT 1 FROM dbo.Direccion WITH (UPDLOCK, ROWLOCK)
                       WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuarioSolicitante AND Activo = 1)
            THROW 50004, N'La dirección no existe.', 1;

        -- 3. Escribir
        UPDATE dbo.Direccion
        SET Alias              = @Alias,
            NombreDestinatario = @NombreDestinatario,
            Telefono           = @Telefono,
            Linea1             = @Linea1,
            Linea2             = @Linea2,
            Municipio          = @Municipio,
            Departamento       = @Departamento,
            CodigoPostal       = @CodigoPostal,
            Referencias        = @Referencias
        WHERE IDDireccion = @IDDireccion
          AND IDUsuario = @IDUsuarioSolicitante;

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Direcciones_ObtenerPorId @IDUsuarioSolicitante = @IDUsuarioSolicitante, @IDDireccion = @IDDireccion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/direcciones/:id: baja lógica (Activo = 0). Deja de listarse y de poder usarse en el
-- checkout; los pedidos que la usaron conservan su copia. Una dirección ya dada de baja → 50004.
-- Sin result set (204).
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Desactivar
    @IDUsuarioSolicitante INT,
    @IDDireccion          INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear
        IF NOT EXISTS (SELECT 1 FROM dbo.Direccion WITH (UPDLOCK, ROWLOCK)
                       WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuarioSolicitante AND Activo = 1)
            THROW 50004, N'La dirección no existe.', 1;

        -- 3. Escribir
        UPDATE dbo.Direccion
        SET Activo = 0
        WHERE IDDireccion = @IDDireccion
          AND IDUsuario = @IDUsuarioSolicitante;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ===== 008_sp_catalogo.sql =====
/*
    008_sp_catalogo.sql
    Stored procedures del catálogo público y de la gestión de categorías, productos,
    variantes y atributos.

    Catálogo público (SP_Catalogo_*): solo categorías, productos y variantes activos. Un producto
    es visible si está activo, su categoría está activa y tiene al menos una variante activa.
    La existencia disponible (física menos reservas vigentes, FU_Inventario_ExistenciaDisponible)
    nunca se expone para variantes inactivas.

    Gestión (SP_Categorias_*, SP_Productos_*, SP_Variantes_*, SP_Atributos_*): incluye lo inactivo.
    Los SPs que escriben reciben @IDUsuarioSolicitante (sale del JWT), validan antes de escribir,
    bloquean con UPDLOCK, ROWLOCK y registran la Bitacora (Modulo 'Catalogo') en la misma
    transacción. La existencia no se edita aquí: la inicial entra al kardex como
    INVENTARIO_INICIAL; después solo la mueven los SPs de inventario y pedidos.

    Orden de bloqueo: Categoria → Producto → Variante. La categoría se bloquea con UPDLOCK
    al crear o mover un producto y al eliminarla, así un producto no puede quedar en una
    categoría que se está eliminando.

    Listados: @Pagina (desde 1), @TamanoPagina (1 a 100) y @Orden 'campo:asc|desc', elegido con
    CASE sobre una lista blanca (nunca concatenado). Devuelven las filas y luego un result set
    con Total.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (solicitante desactivado, SP_Usuarios_ValidarSolicitante)
      50050  PRODUCTO_CON_VENTAS
      50051  EN_USO
      2627   DUPLICADO (UQ_Categoria_Nombre, UQ_Variante_SKU, UQ_Atributo_Nombre,
                        UQ_ValorAtributo_IDAtributo_Valor; sin número de THROW propio)
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Catálogo público
   ========================================================= */

-- GET /api/catalogo/categorias: categorías activas con cuántos productos visibles tienen.
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarCategorias
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        c.IDCategoria,
        c.Nombre,
        c.Descripcion,
        (
            SELECT COUNT(*)
            FROM dbo.Producto AS p
            WHERE p.IDCategoria = c.IDCategoria
              AND p.Activo = 1
              AND EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDProducto = p.IDProducto AND v.Activo = 1)
        ) AS CantidadProductos
    FROM dbo.Categoria AS c
    WHERE c.Activo = 1
    ORDER BY c.Nombre, c.IDCategoria;
END;
GO

-- GET /api/catalogo/productos: búsqueda paginada de productos visibles.
--   @Texto        busca en nombre y descripción del producto, nombre de la categoría y SKU
--                 de sus variantes activas (CI_AI: sin distinguir mayúsculas ni tildes)
--   @PrecioMin/Max  sobre PrecioMinimo, el menor precio de sus variantes activas
--   @Disponible   1: con existencia disponible en alguna variante activa; 0: agotados; NULL: todos
--   @Orden        precio | nombre | fechaCreacion, con :asc o :desc. Default fechaCreacion:desc.
--                 "precio" ordena por PrecioMinimo.
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_BuscarProductos
    @Texto        NVARCHAR(150) = NULL,
    @IDCategoria  INT           = NULL,
    @PrecioMin    DECIMAL(12,2) = NULL,
    @PrecioMax    DECIMAL(12,2) = NULL,
    @Disponible   BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'fechaCreacion:desc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'precio:asc', N'precio:desc', N'nombre:asc', N'nombre:desc',
                      N'fechaCreacion:asc', N'fechaCreacion:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden, N'. Usa precio, nombre o fechaCreacion con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    IF @PrecioMin < 0 OR @PrecioMax < 0
        THROW 50001, N'El rango de precio no puede ser negativo.', 1;

    IF @PrecioMin > @PrecioMax
        THROW 50001, N'El precio mínimo no puede ser mayor que el precio máximo.', 1;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    -- Una variable de tabla toma la collation de la base (una #temporal tomaría la de tempdb).
    DECLARE @Fila TABLE (
        IDProducto      INT            NOT NULL PRIMARY KEY,
        Nombre          NVARCHAR(150)  NOT NULL,
        Descripcion     NVARCHAR(MAX)  NULL,
        IDCategoria     INT            NOT NULL,
        Categoria       NVARCHAR(100)  NOT NULL,
        PrecioMinimo    DECIMAL(12,2)  NOT NULL,
        PrecioMaximo    DECIMAL(12,2)  NOT NULL,
        Disponible      BIT            NOT NULL,
        ImagenPrincipal NVARCHAR(500)  NULL,
        FechaCreacion   DATETIME2(3)   NOT NULL
    );

    INSERT INTO @Fila (IDProducto, Nombre, Descripcion, IDCategoria, Categoria, PrecioMinimo,
                       PrecioMaximo, Disponible, ImagenPrincipal, FechaCreacion)
    SELECT
        p.IDProducto,
        p.Nombre,
        p.Descripcion,
        c.IDCategoria,
        c.Nombre,
        v.PrecioMinimo,
        v.PrecioMaximo,
        CASE WHEN v.Disponible > 0 THEN 1 ELSE 0 END,
        img.Url,
        p.FechaCreacion
    FROM dbo.Producto AS p
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT
            COUNT(*)                          AS Variantes,
            MIN(va.Precio)                    AS PrecioMinimo,
            MAX(va.Precio)                    AS PrecioMaximo,
            ISNULL(SUM(d.ExistenciaDisponible), 0) AS Disponible
        FROM dbo.Variante AS va
        CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(va.IDVariante, NULL) AS d
        WHERE va.IDProducto = p.IDProducto
          AND va.Activo = 1
    ) AS v
    OUTER APPLY (
        SELECT TOP (1) pi.Url
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProducto = p.IDProducto
        ORDER BY pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen
    ) AS img
    WHERE p.Activo = 1
      AND c.Activo = 1
      AND v.Variantes > 0
      AND (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@PrecioMin IS NULL OR v.PrecioMinimo >= @PrecioMin)
      AND (@PrecioMax IS NULL OR v.PrecioMinimo <= @PrecioMax)
      AND (@Disponible IS NULL
           OR (@Disponible = 1 AND v.Disponible > 0)
           OR (@Disponible = 0 AND v.Disponible = 0))
      AND (@Patron IS NULL
           OR p.Nombre LIKE @Patron
           OR p.Descripcion LIKE @Patron
           OR c.Nombre LIKE @Patron
           OR EXISTS (SELECT 1 FROM dbo.Variante AS vs
                      WHERE vs.IDProducto = p.IDProducto AND vs.Activo = 1 AND vs.SKU LIKE @Patron))
    OPTION (RECOMPILE);

    SELECT
        IDProducto, Nombre, Descripcion, IDCategoria, Categoria,
        PrecioMinimo, PrecioMaximo, Disponible, ImagenPrincipal, FechaCreacion
    FROM @Fila
    ORDER BY
        CASE WHEN @Orden = N'precio:asc'         THEN PrecioMinimo  END ASC,
        CASE WHEN @Orden = N'precio:desc'        THEN PrecioMinimo  END DESC,
        CASE WHEN @Orden = N'nombre:asc'         THEN Nombre        END ASC,
        CASE WHEN @Orden = N'nombre:desc'        THEN Nombre        END DESC,
        CASE WHEN @Orden = N'fechaCreacion:asc'  THEN FechaCreacion END ASC,
        CASE WHEN @Orden = N'fechaCreacion:desc' THEN FechaCreacion END DESC,
        IDProducto ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/catalogo/productos/:id: detalle de un producto visible.
-- Producto inexistente, inactivo, de una categoría inactiva o sin variantes activas → 50004.
-- Result sets, en orden:
--   1. Producto (una fila)
--   2. Variantes activas, con su existencia disponible
--   3. Valores de atributo de cada variante activa
--   4. Imágenes (la principal primero)
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ObtenerProducto
    @IDProducto INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Producto AS p
        INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
        WHERE p.IDProducto = @IDProducto
          AND p.Activo = 1
          AND c.Activo = 1
          AND EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDProducto = p.IDProducto AND v.Activo = 1)
    )
        THROW 50004, N'El producto no existe o no está disponible.', 1;

    -- 1. Producto
    SELECT
        p.IDProducto,
        p.Nombre,
        p.Descripcion,
        c.IDCategoria,
        c.Nombre AS Categoria,
        v.PrecioMinimo,
        v.PrecioMaximo,
        CONVERT(BIT, CASE WHEN v.Disponible > 0 THEN 1 ELSE 0 END) AS Disponible,
        p.FechaCreacion
    FROM dbo.Producto AS p
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT
            MIN(va.Precio) AS PrecioMinimo,
            MAX(va.Precio) AS PrecioMaximo,
            ISNULL(SUM(d.ExistenciaDisponible), 0) AS Disponible
        FROM dbo.Variante AS va
        CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(va.IDVariante, NULL) AS d
        WHERE va.IDProducto = p.IDProducto
          AND va.Activo = 1
    ) AS v
    WHERE p.IDProducto = @IDProducto;

    -- 2. Variantes activas
    SELECT
        v.IDVariante,
        v.SKU,
        v.Precio,
        d.ExistenciaDisponible,
        dv.Descripcion
    FROM dbo.Variante AS v
    CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(v.IDVariante, NULL) AS d
    OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(v.IDVariante) AS dv
    WHERE v.IDProducto = @IDProducto
      AND v.Activo = 1
    ORDER BY v.IDVariante;

    -- 3. Valores de atributo de las variantes activas
    SELECT
        vva.IDVariante,
        vva.IDAtributo,
        a.Nombre AS Atributo,
        vva.IDValorAtributo,
        va.Valor
    FROM dbo.VarianteValorAtributo AS vva
    INNER JOIN dbo.Variante AS v ON v.IDVariante = vva.IDVariante
    INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vva.IDAtributo
    INNER JOIN dbo.ValorAtributo AS va ON va.IDValorAtributo = vva.IDValorAtributo
    WHERE v.IDProducto = @IDProducto
      AND v.Activo = 1
    ORDER BY vva.IDVariante, vva.IDAtributo;

    -- 4. Imágenes
    SELECT
        pi.IDProductoImagen,
        pi.Url,
        pi.Orden,
        pi.EsPrincipal
    FROM dbo.ProductoImagen AS pi
    WHERE pi.IDProducto = @IDProducto
    ORDER BY pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen;
END;
GO

/* =========================================================
   Categorías
   ========================================================= */

-- GET /api/categorias: lista paginada, incluye inactivas.
--   @Texto   busca en nombre y descripción
--   @Orden   nombre | activo | cantidadProductos, con :asc o :desc. Default nombre:asc.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_Listar
    @Texto        NVARCHAR(100) = NULL,
    @Activo       BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'nombre:asc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'nombre:asc', N'nombre:desc', N'activo:asc', N'activo:desc',
                      N'cantidadProductos:asc', N'cantidadProductos:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden, N'. Usa nombre, activo o cantidadProductos con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDCategoria       INT           NOT NULL PRIMARY KEY,
        Nombre            NVARCHAR(100) NOT NULL,
        Descripcion       NVARCHAR(500) NULL,
        Activo            BIT           NOT NULL,
        CantidadProductos INT           NOT NULL,
        CantidadCupones   INT           NOT NULL
    );

    INSERT INTO @Fila (IDCategoria, Nombre, Descripcion, Activo, CantidadProductos, CantidadCupones)
    SELECT
        c.IDCategoria,
        c.Nombre,
        c.Descripcion,
        c.Activo,
        (SELECT COUNT(*) FROM dbo.Producto AS p WHERE p.IDCategoria = c.IDCategoria),
        (SELECT COUNT(*) FROM dbo.Cupon AS cu WHERE cu.IDCategoria = c.IDCategoria)
    FROM dbo.Categoria AS c
    WHERE (@Activo IS NULL OR c.Activo = @Activo)
      AND (@Patron IS NULL OR c.Nombre LIKE @Patron OR c.Descripcion LIKE @Patron)
    OPTION (RECOMPILE);

    SELECT IDCategoria, Nombre, Descripcion, Activo, CantidadProductos, CantidadCupones
    FROM @Fila
    ORDER BY
        CASE WHEN @Orden = N'nombre:asc'             THEN Nombre            END ASC,
        CASE WHEN @Orden = N'nombre:desc'            THEN Nombre            END DESC,
        CASE WHEN @Orden = N'activo:asc'             THEN Activo            END ASC,
        CASE WHEN @Orden = N'activo:desc'            THEN Activo            END DESC,
        CASE WHEN @Orden = N'cantidadProductos:asc'  THEN CantidadProductos END ASC,
        CASE WHEN @Orden = N'cantidadProductos:desc' THEN CantidadProductos END DESC,
        Nombre ASC,
        IDCategoria ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/categorias/:id. También es el resultado de los SPs que crean o modifican categorías.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_ObtenerPorId
    @IDCategoria INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Categoria WHERE IDCategoria = @IDCategoria)
        THROW 50004, N'La categoría no existe.', 1;

    SELECT
        c.IDCategoria,
        c.Nombre,
        c.Descripcion,
        c.Activo,
        (SELECT COUNT(*) FROM dbo.Producto AS p WHERE p.IDCategoria = c.IDCategoria) AS CantidadProductos,
        (SELECT COUNT(*) FROM dbo.Cupon AS cu WHERE cu.IDCategoria = c.IDCategoria) AS CantidadCupones
    FROM dbo.Categoria AS c
    WHERE c.IDCategoria = @IDCategoria;
END;
GO

-- POST /api/categorias. Nombre repetido → 2627 (UQ_Categoria_Nombre) → DUPLICADO.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_Crear
    @IDUsuarioSolicitante INT,
    @Nombre               NVARCHAR(100),
    @Descripcion          NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCategoria INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Nombre = TRIM(@Nombre);
    SET @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre de la categoría es obligatorio.', 1;

        -- 3. Escribir
        INSERT INTO dbo.Categoria (Nombre, Descripcion, Activo)
        VALUES (@Nombre, @Descripcion, 1);

        SET @IDCategoria = SCOPE_IDENTITY();

        -- 4. Bitácora
        SET @Nuevo = (SELECT IDCategoria, Nombre, Descripcion, Activo
                      FROM dbo.Categoria WHERE IDCategoria = @IDCategoria
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Categoria', @IDCategoria, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Categorias_ObtenerPorId @IDCategoria = @IDCategoria;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/categorias/:id: reemplaza nombre y descripción (NULL la borra).
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_Actualizar
    @IDUsuarioSolicitante INT,
    @IDCategoria          INT,
    @Nombre               NVARCHAR(100),
    @Descripcion          NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    SET @Nombre = TRIM(@Nombre);
    SET @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre de la categoría es obligatorio.', 1;

        -- 2. Bloquear y leer el valor anterior
        SET @Anterior = (SELECT IDCategoria, Nombre, Descripcion, Activo
                         FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK)
                         WHERE IDCategoria = @IDCategoria
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior IS NULL
            THROW 50004, N'La categoría no existe.', 1;

        -- 3. Escribir. Nombre repetido → 2627 → DUPLICADO.
        UPDATE dbo.Categoria
        SET Nombre = @Nombre,
            Descripcion = @Descripcion
        WHERE IDCategoria = @IDCategoria;

        -- 4. Bitácora
        SET @Nuevo = (SELECT IDCategoria, Nombre, Descripcion, Activo
                      FROM dbo.Categoria WHERE IDCategoria = @IDCategoria
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Categoria', @IDCategoria, N'MODIFICAR', @Anterior, @Nuevo);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Categorias_ObtenerPorId @IDCategoria = @IDCategoria;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/categorias/:id/estado. Desactivar oculta del catálogo público todos sus productos,
-- sin cambiar el estado de cada producto. Si ya está en ese estado no escribe ni registra nada.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDCategoria          INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        SELECT @ActivoActual = Activo
        FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK)
        WHERE IDCategoria = @IDCategoria;

        IF @ActivoActual IS NULL
            THROW 50004, N'La categoría no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SET @Anterior = (SELECT IDCategoria, Nombre, Activo FROM dbo.Categoria
                             WHERE IDCategoria = @IDCategoria
                             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            UPDATE dbo.Categoria SET Activo = @Activo WHERE IDCategoria = @IDCategoria;

            SET @Nuevo = (SELECT IDCategoria, Nombre, Activo FROM dbo.Categoria
                          WHERE IDCategoria = @IDCategoria
                          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Categoria', @IDCategoria,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Categorias_ObtenerPorId @IDCategoria = @IDCategoria;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/categorias/:id: solo si no tiene productos (aunque estén inactivos) ni cupones → 50051.
-- La categoría queda bloqueada con UPDLOCK y SP_Productos_Crear/Actualizar bloquean la suya igual,
-- así un producto no puede entrar a la categoría entre la comprobación y el DELETE.
-- La comprobación lee con READCOMMITTEDLOCK: con READ_COMMITTED_SNAPSHOT una lectura normal no
-- vería un producto insertado por otra transacción aún sin confirmar.
CREATE OR ALTER PROCEDURE dbo.SP_Categorias_Eliminar
    @IDUsuarioSolicitante INT,
    @IDCategoria          INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SET @Anterior = (SELECT IDCategoria, Nombre, Descripcion, Activo
                         FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK)
                         WHERE IDCategoria = @IDCategoria
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior IS NULL
            THROW 50004, N'La categoría no existe.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Producto WITH (READCOMMITTEDLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50051, N'La categoría tiene productos; muévelos a otra categoría o desactívala en lugar de eliminarla.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Cupon WITH (READCOMMITTEDLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50051, N'La categoría tiene cupones asociados; desactívala en lugar de eliminarla.', 1;

        DELETE FROM dbo.Categoria WHERE IDCategoria = @IDCategoria;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Categoria', @IDCategoria, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Productos
   ========================================================= */

-- GET /api/productos: lista paginada, incluye inactivos.
--   @Texto   busca en nombre del producto y SKU de cualquiera de sus variantes
--   @Orden   nombre | categoria | precio | existencia | fechaCreacion, con :asc o :desc.
--            Default fechaCreacion:desc. "precio" ordena por PrecioMinimo (de todas sus variantes)
--            y "existencia" por ExistenciaFisica (suma de sus variantes).
CREATE OR ALTER PROCEDURE dbo.SP_Productos_Listar
    @Texto        NVARCHAR(150) = NULL,
    @IDCategoria  INT           = NULL,
    @Activo       BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'fechaCreacion:desc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'nombre:asc', N'nombre:desc', N'categoria:asc', N'categoria:desc',
                      N'precio:asc', N'precio:desc', N'existencia:asc', N'existencia:desc',
                      N'fechaCreacion:asc', N'fechaCreacion:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa nombre, categoria, precio, existencia o fechaCreacion con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDProducto               INT           NOT NULL PRIMARY KEY,
        Nombre                   NVARCHAR(150) NOT NULL,
        IDCategoria              INT           NOT NULL,
        Categoria                NVARCHAR(100) NOT NULL,
        Activo                   BIT           NOT NULL,
        CantidadVariantes        INT           NOT NULL,
        CantidadVariantesActivas INT           NOT NULL,
        PrecioMinimo             DECIMAL(12,2) NULL,
        PrecioMaximo             DECIMAL(12,2) NULL,
        ExistenciaFisica         INT           NOT NULL,
        ExistenciaReservada      INT           NOT NULL,
        ExistenciaDisponible     INT           NOT NULL,
        ImagenPrincipal          NVARCHAR(500) NULL,
        FechaCreacion            DATETIME2(3)  NOT NULL,
        FechaModificacion        DATETIME2(3)  NULL
    );

    INSERT INTO @Fila (IDProducto, Nombre, IDCategoria, Categoria, Activo, CantidadVariantes,
                       CantidadVariantesActivas, PrecioMinimo, PrecioMaximo, ExistenciaFisica,
                       ExistenciaReservada, ExistenciaDisponible, ImagenPrincipal, FechaCreacion,
                       FechaModificacion)
    SELECT
        p.IDProducto,
        p.Nombre,
        c.IDCategoria,
        c.Nombre,
        p.Activo,
        v.CantidadVariantes,
        v.CantidadVariantesActivas,
        v.PrecioMinimo,
        v.PrecioMaximo,
        v.ExistenciaFisica,
        v.ExistenciaReservada,
        v.ExistenciaDisponible,
        img.Url,
        p.FechaCreacion,
        p.FechaModificacion
    FROM dbo.Producto AS p
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT
            COUNT(*)                                          AS CantidadVariantes,
            ISNULL(SUM(CASE WHEN va.Activo = 1 THEN 1 ELSE 0 END), 0) AS CantidadVariantesActivas,
            MIN(va.Precio)                                    AS PrecioMinimo,
            MAX(va.Precio)                                    AS PrecioMaximo,
            ISNULL(SUM(d.ExistenciaFisica), 0)                AS ExistenciaFisica,
            ISNULL(SUM(d.ExistenciaReservada), 0)             AS ExistenciaReservada,
            ISNULL(SUM(d.ExistenciaDisponible), 0)            AS ExistenciaDisponible
        FROM dbo.Variante AS va
        CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(va.IDVariante, NULL) AS d
        WHERE va.IDProducto = p.IDProducto
    ) AS v
    OUTER APPLY (
        SELECT TOP (1) pi.Url
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProducto = p.IDProducto
        ORDER BY pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen
    ) AS img
    WHERE (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@Activo IS NULL OR p.Activo = @Activo)
      AND (@Patron IS NULL
           OR p.Nombre LIKE @Patron
           OR EXISTS (SELECT 1 FROM dbo.Variante AS vs WHERE vs.IDProducto = p.IDProducto AND vs.SKU LIKE @Patron))
    OPTION (RECOMPILE);

    SELECT
        IDProducto, Nombre, IDCategoria, Categoria, Activo, CantidadVariantes, CantidadVariantesActivas,
        PrecioMinimo, PrecioMaximo, ExistenciaFisica, ExistenciaReservada, ExistenciaDisponible,
        ImagenPrincipal, FechaCreacion, FechaModificacion
    FROM @Fila
    ORDER BY
        CASE WHEN @Orden = N'nombre:asc'         THEN Nombre           END ASC,
        CASE WHEN @Orden = N'nombre:desc'        THEN Nombre           END DESC,
        CASE WHEN @Orden = N'categoria:asc'      THEN Categoria        END ASC,
        CASE WHEN @Orden = N'categoria:desc'     THEN Categoria        END DESC,
        CASE WHEN @Orden = N'precio:asc'         THEN PrecioMinimo     END ASC,
        CASE WHEN @Orden = N'precio:desc'        THEN PrecioMinimo     END DESC,
        CASE WHEN @Orden = N'existencia:asc'     THEN ExistenciaFisica END ASC,
        CASE WHEN @Orden = N'existencia:desc'    THEN ExistenciaFisica END DESC,
        CASE WHEN @Orden = N'fechaCreacion:asc'  THEN FechaCreacion    END ASC,
        CASE WHEN @Orden = N'fechaCreacion:desc' THEN FechaCreacion    END DESC,
        IDProducto ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/productos/:id: detalle de gestión, incluye variantes inactivas.
-- También es el resultado de los SPs que crean o modifican productos e imágenes.
-- Result sets, en orden:
--   1. Producto (una fila), con TieneVentas y PuedeEliminarse
--   2. Variantes (todas), con existencia física, reservada vigente y disponible
--   3. Valores de atributo de cada variante
--   4. Imágenes (la principal primero)
CREATE OR ALTER PROCEDURE dbo.SP_Productos_ObtenerPorId
    @IDProducto INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Producto WHERE IDProducto = @IDProducto)
        THROW 50004, N'El producto no existe.', 1;

    -- 1. Producto
    SELECT
        p.IDProducto,
        p.Nombre,
        p.Descripcion,
        c.IDCategoria,
        c.Nombre AS Categoria,
        c.Activo AS CategoriaActiva,
        p.Activo,
        p.FechaCreacion,
        p.FechaModificacion,
        CONVERT(BIT, CASE WHEN h.Ventas = 1 THEN 1 ELSE 0 END) AS TieneVentas,
        CONVERT(BIT, CASE WHEN h.Ventas = 0 AND h.Movimientos = 0 THEN 1 ELSE 0 END) AS PuedeEliminarse
    FROM dbo.Producto AS p
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT
            CASE WHEN EXISTS (SELECT 1 FROM dbo.PedidoDetalle AS pd
                              INNER JOIN dbo.Variante AS v ON v.IDVariante = pd.IDVariante
                              WHERE v.IDProducto = p.IDProducto) THEN 1 ELSE 0 END AS Ventas,
            CASE WHEN EXISTS (SELECT 1 FROM dbo.MovimientoInventario AS mi
                              INNER JOIN dbo.Variante AS v ON v.IDVariante = mi.IDVariante
                              WHERE v.IDProducto = p.IDProducto) THEN 1 ELSE 0 END AS Movimientos
    ) AS h
    WHERE p.IDProducto = @IDProducto;

    -- 2. Variantes
    SELECT
        v.IDVariante,
        v.IDProducto,
        v.SKU,
        v.Precio,
        d.ExistenciaFisica,
        d.ExistenciaReservada,
        d.ExistenciaDisponible,
        v.Activo,
        dv.Descripcion
    FROM dbo.Variante AS v
    CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(v.IDVariante, NULL) AS d
    OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(v.IDVariante) AS dv
    WHERE v.IDProducto = @IDProducto
    ORDER BY v.IDVariante;

    -- 3. Valores de atributo
    SELECT
        vva.IDVariante,
        vva.IDAtributo,
        a.Nombre AS Atributo,
        vva.IDValorAtributo,
        va.Valor
    FROM dbo.VarianteValorAtributo AS vva
    INNER JOIN dbo.Variante AS v ON v.IDVariante = vva.IDVariante
    INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vva.IDAtributo
    INNER JOIN dbo.ValorAtributo AS va ON va.IDValorAtributo = vva.IDValorAtributo
    WHERE v.IDProducto = @IDProducto
    ORDER BY vva.IDVariante, vva.IDAtributo;

    -- 4. Imágenes
    SELECT
        pi.IDProductoImagen,
        pi.Url,
        pi.Orden,
        pi.EsPrincipal
    FROM dbo.ProductoImagen AS pi
    WHERE pi.IDProducto = @IDProducto
    ORDER BY pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen;
END;
GO

-- POST /api/productos: crea el producto y sus variantes en una sola transacción.
-- @Variantes es un arreglo JSON (las claves distinguen mayúsculas):
--   [{ "sku": "CAM-001-M", "precio": 149.00, "existenciaInicial": 10, "valores": [2, 12] }, …]
--   sku                obligatorio, hasta 50 caracteres; repetido → 2627 (UQ_Variante_SKU) → DUPLICADO
--   precio             obligatorio, mayor que 0 y con 2 decimales como máximo (número o texto "149.00")
--   existenciaInicial  opcional (0 si falta), entero >= 0; entra al kardex como INVENTARIO_INICIAL
--   valores            opcional, arreglo de IDValorAtributo; como máximo uno por atributo
-- Dentro del producto cada variante debe tener una combinación de valores distinta.
-- Bitácora: CREAR del Producto (con sus variantes) y CREAR de cada Variante.
-- Resultado: los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_Crear
    @IDUsuarioSolicitante INT,
    @IDCategoria          INT,
    @Nombre               NVARCHAR(150),
    @Descripcion          NVARCHAR(MAX) = NULL,
    @Variantes            NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT;
    DECLARE @IDTipoInicial INT, @SignoInicial SMALLINT;
    DECLARE @Indice INT;
    DECLARE @Mensaje NVARCHAR(2048);

    DECLARE @Variante TABLE (
        Indice          INT           NOT NULL PRIMARY KEY,  -- posición en el arreglo, desde 0
        SKU             NVARCHAR(MAX) NULL,
        PrecioTexto     NVARCHAR(100) NULL,
        ExistenciaTexto NVARCHAR(100) NULL,
        ValoresJson     NVARCHAR(MAX) NULL,
        TipoValores     TINYINT       NULL,                  -- tipo JSON de "valores": NULL falta, 0 null, 4 arreglo
        Precio          DECIMAL(12,2) NULL,
        Existencia      INT           NULL
    );

    DECLARE @VarianteValor TABLE (
        Indice          INT NOT NULL,
        Posicion        INT NULL,
        IDValorAtributo INT NULL,
        IDAtributo      INT NULL
    );

    SET @Nombre = TRIM(@Nombre);
    SET @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre del producto es obligatorio.', 1;

        -- La categoría se bloquea: SP_Categorias_Eliminar no puede borrarla mientras tanto.
        IF NOT EXISTS (SELECT 1 FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50004, N'La categoría no existe.', 1;

        -- @Variantes debe ser un arreglo JSON de objetos. Se envuelve en [ ] para leer el tipo
        -- del valor completo: 4 = arreglo (ISJSON también acepta un objeto).
        IF @Variantes IS NULL OR ISJSON(@Variantes) = 0
           OR (SELECT [type] FROM OPENJSON(N'[' + @Variantes + N']') WHERE [key] = N'0') <> 4
            THROW 50001, N'Las variantes deben enviarse como un arreglo JSON.', 1;

        IF NOT EXISTS (SELECT 1 FROM OPENJSON(@Variantes))
            THROW 50001, N'El producto debe tener al menos una variante.', 1;

        SELECT TOP (1) @Indice = CONVERT(INT, [key])
        FROM OPENJSON(@Variantes)
        WHERE [type] <> 5
        ORDER BY CONVERT(INT, [key]);

        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'La variante ', @Indice + 1, N' no es un objeto JSON.');
            THROW 50001, @Mensaje, 1;
        END;

        INSERT INTO @Variante (Indice, SKU, PrecioTexto, ExistenciaTexto, ValoresJson, TipoValores)
        SELECT
            CONVERT(INT, e.[key]),
            NULLIF(TRIM(w.sku), N''),
            w.precio,
            w.existenciaInicial,
            w.valores,
            (SELECT x.[type] FROM OPENJSON(e.[value]) AS x WHERE x.[key] = N'valores')
        FROM OPENJSON(@Variantes) AS e
        CROSS APPLY OPENJSON(e.[value]) WITH (
            sku               NVARCHAR(MAX) N'$.sku',
            precio            NVARCHAR(100) N'$.precio',
            existenciaInicial NVARCHAR(100) N'$.existenciaInicial',
            valores           NVARCHAR(MAX) N'$.valores' AS JSON
        ) AS w;

        UPDATE @Variante
        SET Precio = CASE
                         WHEN TRY_CONVERT(DECIMAL(12,2), PrecioTexto) > 0
                          AND TRY_CONVERT(DECIMAL(38,10), PrecioTexto) = TRY_CONVERT(DECIMAL(12,2), PrecioTexto)
                         THEN TRY_CONVERT(DECIMAL(12,2), PrecioTexto)
                     END,
            Existencia = CASE
                             WHEN ExistenciaTexto IS NULL THEN 0
                             WHEN TRY_CONVERT(INT, ExistenciaTexto) >= 0 THEN TRY_CONVERT(INT, ExistenciaTexto)
                         END;

        SET @Indice = (SELECT MIN(Indice) FROM @Variante WHERE SKU IS NULL OR LEN(SKU) > 50);
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'La variante ', @Indice + 1, N' necesita un SKU de hasta 50 caracteres.');
            THROW 50001, @Mensaje, 1;
        END;

        SET @Indice = (SELECT MIN(Indice) FROM @Variante WHERE Precio IS NULL);
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'La variante ', @Indice + 1, N' necesita un precio mayor que 0 con 2 decimales como máximo.');
            THROW 50001, @Mensaje, 1;
        END;

        SET @Indice = (SELECT MIN(Indice) FROM @Variante WHERE Existencia IS NULL);
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'La existencia inicial de la variante ', @Indice + 1, N' debe ser un entero mayor o igual a 0.');
            THROW 50001, @Mensaje, 1;
        END;

        SET @Indice = (SELECT MIN(Indice) FROM @Variante WHERE TipoValores NOT IN (0, 4));
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'Los valores de la variante ', @Indice + 1, N' deben ser un arreglo de IDs de valor de atributo.');
            THROW 50001, @Mensaje, 1;
        END;

        INSERT INTO @VarianteValor (Indice, Posicion, IDValorAtributo, IDAtributo)
        SELECT v.Indice, l.Posicion, l.IDValorAtributo, l.IDAtributo
        FROM @Variante AS v
        CROSS APPLY dbo.FU_Catalogo_LeerValoresAtributo(v.ValoresJson) AS l
        WHERE v.TipoValores = 4;

        SET @Indice = (SELECT MIN(Indice) FROM @VarianteValor WHERE IDValorAtributo IS NULL);
        IF @Indice IS NOT NULL
        BEGIN
            SET @Mensaje = CONCAT(N'Los valores de la variante ', @Indice + 1, N' deben ser IDs enteros de valor de atributo.');
            THROW 50001, @Mensaje, 1;
        END;

        SELECT TOP (1) @Mensaje = CONCAT(N'El valor de atributo ', IDValorAtributo, N' de la variante ', Indice + 1, N' no existe.')
        FROM @VarianteValor
        WHERE IDAtributo IS NULL
        ORDER BY Indice, Posicion;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        SELECT TOP (1) @Mensaje = CONCAT(N'La variante ', vv.Indice + 1, N' repite el atributo ', a.Nombre,
                                         N'; cada variante lleva como máximo un valor por atributo.')
        FROM @VarianteValor AS vv
        INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vv.IDAtributo
        GROUP BY vv.Indice, a.IDAtributo, a.Nombre
        HAVING COUNT(*) > 1
        ORDER BY vv.Indice;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        -- Dos variantes del mismo producto no pueden tener la misma combinación de valores.
        SELECT TOP (1) @Mensaje = CONCAT(N'Las variantes ', MIN(c.Indice) + 1, N' y ', MAX(c.Indice) + 1,
                                         N' tienen la misma combinación de valores de atributo.')
        FROM (
            SELECT
                v.Indice,
                ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), vv.IDValorAtributo), N',')
                                  WITHIN GROUP (ORDER BY vv.IDValorAtributo)
                        FROM @VarianteValor AS vv WHERE vv.Indice = v.Indice), N'') AS Combinacion
            FROM @Variante AS v
        ) AS c
        GROUP BY c.Combinacion
        HAVING COUNT(*) > 1
        ORDER BY MIN(c.Indice);

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        -- El tipo de movimiento se busca por código, nunca por ID fijo.
        SELECT @IDTipoInicial = IDTipoMovimientoInventario, @SignoInicial = Signo
        FROM dbo.TipoMovimientoInventario
        WHERE Codigo = N'INVENTARIO_INICIAL';

        IF @IDTipoInicial IS NULL
            THROW 50000, N'No existe el tipo de movimiento INVENTARIO_INICIAL; ejecuta 085_datos_catalogos.sql.', 1;

        -- 3. Escribir
        INSERT INTO dbo.Producto (IDCategoria, Nombre, Descripcion, Activo)
        VALUES (@IDCategoria, @Nombre, @Descripcion, 1);

        SET @IDProducto = SCOPE_IDENTITY();

        -- La existencia nace en 0 y solo la mueve el kardex. SKU repetido → 2627 → DUPLICADO.
        INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ExistenciaReservada, Activo)
        SELECT @IDProducto, CONVERT(NVARCHAR(50), SKU), Precio, 0, 0, 1
        FROM @Variante
        ORDER BY Indice;

        INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo)
        SELECT v.IDVariante, vv.IDAtributo, vv.IDValorAtributo
        FROM @VarianteValor AS vv
        INNER JOIN @Variante AS s ON s.Indice = vv.Indice
        INNER JOIN dbo.Variante AS v ON v.SKU = CONVERT(NVARCHAR(50), s.SKU);

        -- 4. Kardex: un INVENTARIO_INICIAL por variante con existencia; el Signo sale del tipo.
        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                              Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
        SELECT v.IDVariante, @IDTipoInicial, @SignoInicial, @IDUsuarioSolicitante,
               s.Existencia, v.ExistenciaFisica, v.ExistenciaFisica + @SignoInicial * s.Existencia,
               N'Inventario inicial al crear el producto'
        FROM @Variante AS s
        INNER JOIN dbo.Variante AS v ON v.SKU = CONVERT(NVARCHAR(50), s.SKU)
        WHERE s.Existencia > 0
        ORDER BY s.Indice;

        UPDATE v
        SET ExistenciaFisica = v.ExistenciaFisica + @SignoInicial * s.Existencia
        FROM dbo.Variante AS v
        INNER JOIN @Variante AS s ON CONVERT(NVARCHAR(50), s.SKU) = v.SKU
        WHERE v.IDProducto = @IDProducto
          AND s.Existencia > 0;

        -- 4. Bitácora
        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        SELECT @IDUsuarioSolicitante, N'Catalogo', N'Producto', @IDProducto, N'CREAR', NULL, pj.Json
        FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 1) AS pj;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        SELECT @IDUsuarioSolicitante, N'Catalogo', N'Variante', v.IDVariante, N'CREAR', NULL, vj.Json
        FROM dbo.Variante AS v
        CROSS APPLY dbo.FU_Catalogo_VarianteJson(v.IDVariante) AS vj
        WHERE v.IDProducto = @IDProducto
        ORDER BY v.IDVariante;

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Productos_ObtenerPorId @IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/productos/:id: reemplaza nombre, descripción (NULL la borra) y categoría.
-- Resultado: los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_Actualizar
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @IDCategoria          INT,
    @Nombre               NVARCHAR(150),
    @Descripcion          NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCategoriaActual INT;
    DECLARE @Anterior NVARCHAR(MAX);

    SET @Nombre = TRIM(@Nombre);
    SET @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre del producto es obligatorio.', 1;

        -- Orden de bloqueo: categoría y luego producto.
        IF NOT EXISTS (SELECT 1 FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50004, N'La categoría no existe.', 1;

        SELECT @IDCategoriaActual = IDCategoria
        FROM dbo.Producto WITH (UPDLOCK, ROWLOCK)
        WHERE IDProducto = @IDProducto;

        IF @IDCategoriaActual IS NULL
            THROW 50004, N'El producto no existe.', 1;

        SELECT @Anterior = Json FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 0);

        UPDATE dbo.Producto
        SET IDCategoria = @IDCategoria,
            Nombre = @Nombre,
            Descripcion = @Descripcion,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDProducto = @IDProducto;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        SELECT @IDUsuarioSolicitante, N'Catalogo', N'Producto', @IDProducto, N'MODIFICAR', @Anterior, pj.Json
        FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 0) AS pj;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Productos_ObtenerPorId @IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/productos/:id/estado. Un producto inactivo deja de verse en la tienda; sus variantes
-- conservan su propio estado. Si ya está en ese estado no escribe ni registra nada.
-- Resultado: los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT;
    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        SELECT @ActivoActual = Activo
        FROM dbo.Producto WITH (UPDLOCK, ROWLOCK)
        WHERE IDProducto = @IDProducto;

        IF @ActivoActual IS NULL
            THROW 50004, N'El producto no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 0);

            UPDATE dbo.Producto
            SET Activo = @Activo,
                FechaModificacion = SYSUTCDATETIME()
            WHERE IDProducto = @IDProducto;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            SELECT @IDUsuarioSolicitante, N'Catalogo', N'Producto', @IDProducto,
                   CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, pj.Json
            FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 0) AS pj;
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Productos_ObtenerPorId @IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/productos/:id: borrado físico solo si el producto nunca se vendió ni tuvo existencia.
--   Con ventas (PedidoDetalle)                        → 50050 PRODUCTO_CON_VENTAS: se desactiva
--   Sin ventas pero con movimientos de kardex o reservas → 50051 EN_USO: el kardex es inmutable
--     (TR_Inventario_ImpedirCambiosKardex) y sus movimientos no pueden quedar sin variante
-- Borra también sus imágenes, sus variantes con sus valores y las líneas de carrito que las tengan.
-- Bloquea el producto y sus variantes antes de comprobar: un pedido en curso sobre una de ellas
-- (que bloquea la variante con UPDLOCK) termina primero y entonces se ve su venta.
-- Bitácora: ELIMINAR del Producto con la foto de sus variantes en ValorAnterior.
-- Result set único (tras el commit): Url de cada imagen borrada (0..n filas) para que el backend borre los archivos.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_Eliminar
    @IDUsuarioSolicitante INT,
    @IDProducto           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX);
    DECLARE @Urls TABLE (Url NVARCHAR(500) NOT NULL);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

        -- Bloquear las variantes (sin devolver filas).
        DECLARE @Bloqueadas INT = (SELECT COUNT(*) FROM dbo.Variante WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto);

        IF EXISTS (SELECT 1
                   FROM dbo.PedidoDetalle AS pd WITH (READCOMMITTEDLOCK)
                   INNER JOIN dbo.Variante AS v ON v.IDVariante = pd.IDVariante
                   WHERE v.IDProducto = @IDProducto)
            THROW 50050, N'El producto tiene ventas y no puede eliminarse; desactívalo para que deje de mostrarse en la tienda.', 1;

        IF EXISTS (SELECT 1
                   FROM dbo.MovimientoInventario AS mi WITH (READCOMMITTEDLOCK)
                   INNER JOIN dbo.Variante AS v ON v.IDVariante = mi.IDVariante
                   WHERE v.IDProducto = @IDProducto)
           OR EXISTS (SELECT 1
                      FROM dbo.ReservaExistencia AS re WITH (READCOMMITTEDLOCK)
                      INNER JOIN dbo.Variante AS v ON v.IDVariante = re.IDVariante
                      WHERE v.IDProducto = @IDProducto)
            THROW 50051, N'El producto tiene movimientos de inventario y no puede eliminarse; desactívalo en lugar de eliminarlo.', 1;

        SELECT @Anterior = Json FROM dbo.FU_Catalogo_ProductoJson(@IDProducto, 1);

        DELETE cd
        FROM dbo.CarritoDetalle AS cd
        INNER JOIN dbo.Variante AS v ON v.IDVariante = cd.IDVariante
        WHERE v.IDProducto = @IDProducto;

        DELETE vva
        FROM dbo.VarianteValorAtributo AS vva
        INNER JOIN dbo.Variante AS v ON v.IDVariante = vva.IDVariante
        WHERE v.IDProducto = @IDProducto;

        DELETE FROM dbo.Variante WHERE IDProducto = @IDProducto;
        DELETE FROM dbo.ProductoImagen
        OUTPUT deleted.Url INTO @Urls (Url)
        WHERE IDProducto = @IDProducto;
        DELETE FROM dbo.Producto WHERE IDProducto = @IDProducto;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Producto', @IDProducto, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;

        SELECT Url FROM @Urls;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/productos/:id/imagenes: agrega una imagen por URL (http:// o https://) o por la URL relativa
-- que genera el backend: /api/imagenes/productos/<uuid>.(jpg|png|webp), uuid en hex con guiones (8-4-4-4-12).
-- @EsPrincipal = 1 quita la marca a la principal anterior (UX_ProductoImagen_Principal permite una).
-- Si el producto no tenía imagen principal, la nueva lo es aunque @EsPrincipal = 0.
-- Bitácora: CREAR de ProductoImagen. Resultado: los 4 result sets de SP_Productos_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_AgregarImagen
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @Url                  NVARCHAR(500),
    @Orden                INT = 0,
    @EsPrincipal          BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProductoImagen INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Url = TRIM(@Url);
    SET @Orden = ISNULL(@Orden, 0);
    SET @EsPrincipal = ISNULL(@EsPrincipal, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Url IS NULL OR NOT (
               @Url LIKE N'http://_%' OR @Url LIKE N'https://_%'
               OR @Url COLLATE Latin1_General_100_CI_AI LIKE
                  N'/api/imagenes/productos/[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].jpg'
               OR @Url COLLATE Latin1_General_100_CI_AI LIKE
                  N'/api/imagenes/productos/[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].png'
               OR @Url COLLATE Latin1_General_100_CI_AI LIKE
                  N'/api/imagenes/productos/[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].webp'
           )
            THROW 50001, N'La URL de la imagen debe empezar con http:// o https://, o ser una imagen subida (/api/imagenes/productos/<uuid>.jpg|png|webp).', 1;

        IF @Orden NOT BETWEEN 0 AND 255
            THROW 50001, N'El orden de la imagen debe estar entre 0 y 255.', 1;

        -- El bloqueo del producto serializa los cambios de imagen principal.
        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.ProductoImagen WHERE IDProducto = @IDProducto AND EsPrincipal = 1)
            SET @EsPrincipal = 1;
        ELSE IF @EsPrincipal = 1
            UPDATE dbo.ProductoImagen
            SET EsPrincipal = 0
            WHERE IDProducto = @IDProducto AND EsPrincipal = 1;

        INSERT INTO dbo.ProductoImagen (IDProducto, Url, Orden, EsPrincipal)
        VALUES (@IDProducto, @Url, CONVERT(TINYINT, @Orden), @EsPrincipal);

        SET @IDProductoImagen = SCOPE_IDENTITY();

        UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

        SET @Nuevo = (SELECT IDProductoImagen, IDProducto, Url, Orden, EsPrincipal
                      FROM dbo.ProductoImagen WHERE IDProductoImagen = @IDProductoImagen
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'ProductoImagen', @IDProductoImagen, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Productos_ObtenerPorId @IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/productos/:id/imagenes/:idImagen. Una imagen de otro producto → 50004.
-- Si era la principal, la siguiente por Orden pasa a serlo.
-- Bitácora: ELIMINAR de ProductoImagen.
-- Result set único (tras el commit): una fila con Url de la imagen borrada.
CREATE OR ALTER PROCEDURE dbo.SP_Productos_EliminarImagen
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @IDProductoImagen     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @EraPrincipal BIT;
    DECLARE @Anterior NVARCHAR(MAX);
    DECLARE @UrlEliminada NVARCHAR(500);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

        SELECT @EraPrincipal = EsPrincipal
        FROM dbo.ProductoImagen WITH (UPDLOCK, ROWLOCK)
        WHERE IDProductoImagen = @IDProductoImagen
          AND IDProducto = @IDProducto;

        IF @EraPrincipal IS NULL
            THROW 50004, N'La imagen no existe en este producto.', 1;

        SET @Anterior = (SELECT IDProductoImagen, IDProducto, Url, Orden, EsPrincipal
                         FROM dbo.ProductoImagen WHERE IDProductoImagen = @IDProductoImagen
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        SELECT @UrlEliminada = Url FROM dbo.ProductoImagen WHERE IDProductoImagen = @IDProductoImagen;

        DELETE FROM dbo.ProductoImagen WHERE IDProductoImagen = @IDProductoImagen;

        IF @EraPrincipal = 1
            UPDATE dbo.ProductoImagen
            SET EsPrincipal = 1
            WHERE IDProductoImagen = (SELECT TOP (1) IDProductoImagen
                                      FROM dbo.ProductoImagen
                                      WHERE IDProducto = @IDProducto
                                      ORDER BY Orden, IDProductoImagen);

        UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'ProductoImagen', @IDProductoImagen, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;

        SELECT @UrlEliminada AS Url;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Variantes
   ========================================================= */

-- Variante de gestión (sin endpoint propio): es el resultado de los SPs SP_Variantes_*.
-- Result sets, en orden:
--   1. Variante (una fila), mismas columnas que el result set 2 de SP_Productos_ObtenerPorId
--   2. Sus valores de atributo
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_ObtenerPorId
    @IDVariante INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Variante WHERE IDVariante = @IDVariante)
        THROW 50004, N'La variante no existe.', 1;

    SELECT
        v.IDVariante,
        v.IDProducto,
        v.SKU,
        v.Precio,
        d.ExistenciaFisica,
        d.ExistenciaReservada,
        d.ExistenciaDisponible,
        v.Activo,
        dv.Descripcion
    FROM dbo.Variante AS v
    CROSS APPLY dbo.FU_Inventario_ExistenciaDisponible(v.IDVariante, NULL) AS d
    OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(v.IDVariante) AS dv
    WHERE v.IDVariante = @IDVariante;

    SELECT
        vva.IDVariante,
        vva.IDAtributo,
        a.Nombre AS Atributo,
        vva.IDValorAtributo,
        va.Valor
    FROM dbo.VarianteValorAtributo AS vva
    INNER JOIN dbo.Atributo AS a ON a.IDAtributo = vva.IDAtributo
    INNER JOIN dbo.ValorAtributo AS va ON va.IDValorAtributo = vva.IDValorAtributo
    WHERE vva.IDVariante = @IDVariante
    ORDER BY vva.IDAtributo;
END;
GO

-- POST /api/productos/:id/variantes: agrega una variante activa a un producto.
--   @Valores           arreglo JSON de IDValorAtributo ("[2, 12]"); NULL o "[]" = sin valores.
--                      Como máximo uno por atributo; un valor inexistente o un atributo repetido → 50001.
--   @ExistenciaInicial entra al kardex como INVENTARIO_INICIAL si es mayor que 0.
-- La combinación de valores no puede repetir la de otra variante del producto (activa o no) → 50001.
-- Bitácora: CREAR de Variante. Resultado: los 2 result sets de SP_Variantes_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_Crear
    @IDUsuarioSolicitante INT,
    @IDProducto           INT,
    @SKU                  NVARCHAR(50),
    @Precio               DECIMAL(12,2),
    @ExistenciaInicial    INT           = 0,
    @Valores              NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDVariante INT;
    DECLARE @IDTipoInicial INT, @SignoInicial SMALLINT;
    DECLARE @Combinacion NVARCHAR(MAX);
    DECLARE @Mensaje NVARCHAR(2048);
    DECLARE @Valor TABLE (Posicion INT NULL, IDValorAtributo INT NULL, IDAtributo INT NULL);

    SET @SKU = NULLIF(TRIM(@SKU), N'');
    SET @ExistenciaInicial = ISNULL(@ExistenciaInicial, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @SKU IS NULL
            THROW 50001, N'El SKU es obligatorio.', 1;

        IF @Precio IS NULL OR @Precio <= 0
            THROW 50001, N'El precio debe ser mayor que 0.', 1;

        IF @ExistenciaInicial < 0
            THROW 50001, N'La existencia inicial no puede ser negativa.', 1;

        IF @Valores IS NOT NULL
           AND (ISJSON(@Valores) = 0
                OR (SELECT [type] FROM OPENJSON(N'[' + @Valores + N']') WHERE [key] = N'0') <> 4)
            THROW 50001, N'Los valores de atributo deben enviarse como un arreglo JSON de IDs.', 1;

        -- 2. Bloquear el producto: serializa las variantes nuevas del mismo producto.
        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'El producto no existe.', 1;

        INSERT INTO @Valor (Posicion, IDValorAtributo, IDAtributo)
        SELECT Posicion, IDValorAtributo, IDAtributo
        FROM dbo.FU_Catalogo_LeerValoresAtributo(@Valores);

        IF EXISTS (SELECT 1 FROM @Valor WHERE IDValorAtributo IS NULL)
            THROW 50001, N'Los valores de atributo deben ser IDs enteros.', 1;

        SELECT TOP (1) @Mensaje = CONCAT(N'El valor de atributo ', IDValorAtributo, N' no existe.')
        FROM @Valor WHERE IDAtributo IS NULL ORDER BY Posicion;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        SELECT TOP (1) @Mensaje = CONCAT(N'La variante repite el atributo ', a.Nombre,
                                         N'; lleva como máximo un valor por atributo.')
        FROM @Valor AS x
        INNER JOIN dbo.Atributo AS a ON a.IDAtributo = x.IDAtributo
        GROUP BY a.IDAtributo, a.Nombre
        HAVING COUNT(*) > 1;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        SET @Combinacion = ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), IDValorAtributo), N',')
                                          WITHIN GROUP (ORDER BY IDValorAtributo)
                                   FROM @Valor), N'');

        SELECT TOP (1) @Mensaje = CONCAT(N'La variante ', v.SKU, N' ya tiene esa combinación de valores de atributo.')
        FROM dbo.Variante AS v
        WHERE v.IDProducto = @IDProducto
          AND ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), vva.IDValorAtributo), N',')
                             WITHIN GROUP (ORDER BY vva.IDValorAtributo)
                      FROM dbo.VarianteValorAtributo AS vva
                      WHERE vva.IDVariante = v.IDVariante), N'') = @Combinacion;

        IF @@ROWCOUNT > 0
            THROW 50001, @Mensaje, 1;

        SELECT @IDTipoInicial = IDTipoMovimientoInventario, @SignoInicial = Signo
        FROM dbo.TipoMovimientoInventario
        WHERE Codigo = N'INVENTARIO_INICIAL';

        IF @IDTipoInicial IS NULL
            THROW 50000, N'No existe el tipo de movimiento INVENTARIO_INICIAL; ejecuta 085_datos_catalogos.sql.', 1;

        -- 3. Escribir. SKU repetido → 2627 → DUPLICADO.
        INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ExistenciaReservada, Activo)
        VALUES (@IDProducto, @SKU, @Precio, 0, 0, 1);

        SET @IDVariante = SCOPE_IDENTITY();

        INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo)
        SELECT @IDVariante, IDAtributo, IDValorAtributo
        FROM @Valor;

        -- 4. Kardex
        IF @ExistenciaInicial > 0
        BEGIN
            INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                                  Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
            SELECT IDVariante, @IDTipoInicial, @SignoInicial, @IDUsuarioSolicitante,
                   @ExistenciaInicial, ExistenciaFisica, ExistenciaFisica + @SignoInicial * @ExistenciaInicial,
                   N'Inventario inicial al crear la variante'
            FROM dbo.Variante
            WHERE IDVariante = @IDVariante;

            UPDATE dbo.Variante
            SET ExistenciaFisica = ExistenciaFisica + @SignoInicial * @ExistenciaInicial
            WHERE IDVariante = @IDVariante;
        END;

        UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

        -- 4. Bitácora
        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        SELECT @IDUsuarioSolicitante, N'Catalogo', N'Variante', @IDVariante, N'CREAR', NULL, vj.Json
        FROM dbo.FU_Catalogo_VarianteJson(@IDVariante) AS vj;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Variantes_ObtenerPorId @IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/variantes/:id: cambia el SKU y, si @Valores no es NULL, reemplaza sus valores de atributo
-- ("[]" los quita todos). Mismas reglas de valores que SP_Variantes_Crear. No toca precio, estado
-- ni existencia. Los pedidos conservan su copia del SKU y de la descripción.
-- Bitácora: MODIFICAR de Variante (solo si cambió algo). Resultado: SP_Variantes_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_Actualizar
    @IDUsuarioSolicitante INT,
    @IDVariante           INT,
    @SKU                  NVARCHAR(50),
    @Valores              NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT;
    DECLARE @SKUActual NVARCHAR(50);
    DECLARE @Combinacion NVARCHAR(MAX), @CombinacionActual NVARCHAR(MAX);
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);
    DECLARE @Mensaje NVARCHAR(2048);
    DECLARE @Valor TABLE (Posicion INT NULL, IDValorAtributo INT NULL, IDAtributo INT NULL);

    SET @SKU = NULLIF(TRIM(@SKU), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @SKU IS NULL
            THROW 50001, N'El SKU es obligatorio.', 1;

        IF @Valores IS NOT NULL
           AND (ISJSON(@Valores) = 0
                OR (SELECT [type] FROM OPENJSON(N'[' + @Valores + N']') WHERE [key] = N'0') <> 4)
            THROW 50001, N'Los valores de atributo deben enviarse como un arreglo JSON de IDs.', 1;

        -- 2. Bloquear: producto (serializa la regla de combinación única) y luego la variante.
        SELECT @IDProducto = IDProducto FROM dbo.Variante WHERE IDVariante = @IDVariante;

        IF @IDProducto IS NULL
            THROW 50004, N'La variante no existe.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto)
            THROW 50004, N'La variante no existe.', 1;

        SELECT @SKUActual = SKU
        FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
        WHERE IDVariante = @IDVariante;

        IF @SKUActual IS NULL
            THROW 50004, N'La variante no existe.', 1;

        SET @CombinacionActual = ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), IDValorAtributo), N',')
                                                WITHIN GROUP (ORDER BY IDValorAtributo)
                                         FROM dbo.VarianteValorAtributo
                                         WHERE IDVariante = @IDVariante), N'');

        IF @Valores IS NULL
            SET @Combinacion = @CombinacionActual;
        ELSE
        BEGIN
            INSERT INTO @Valor (Posicion, IDValorAtributo, IDAtributo)
            SELECT Posicion, IDValorAtributo, IDAtributo
            FROM dbo.FU_Catalogo_LeerValoresAtributo(@Valores);

            IF EXISTS (SELECT 1 FROM @Valor WHERE IDValorAtributo IS NULL)
                THROW 50001, N'Los valores de atributo deben ser IDs enteros.', 1;

            SELECT TOP (1) @Mensaje = CONCAT(N'El valor de atributo ', IDValorAtributo, N' no existe.')
            FROM @Valor WHERE IDAtributo IS NULL ORDER BY Posicion;

            IF @@ROWCOUNT > 0
                THROW 50001, @Mensaje, 1;

            SELECT TOP (1) @Mensaje = CONCAT(N'La variante repite el atributo ', a.Nombre,
                                             N'; lleva como máximo un valor por atributo.')
            FROM @Valor AS x
            INNER JOIN dbo.Atributo AS a ON a.IDAtributo = x.IDAtributo
            GROUP BY a.IDAtributo, a.Nombre
            HAVING COUNT(*) > 1;

            IF @@ROWCOUNT > 0
                THROW 50001, @Mensaje, 1;

            SET @Combinacion = ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), IDValorAtributo), N',')
                                              WITHIN GROUP (ORDER BY IDValorAtributo)
                                       FROM @Valor), N'');

            SELECT TOP (1) @Mensaje = CONCAT(N'La variante ', v.SKU, N' ya tiene esa combinación de valores de atributo.')
            FROM dbo.Variante AS v
            WHERE v.IDProducto = @IDProducto
              AND v.IDVariante <> @IDVariante
              AND ISNULL((SELECT STRING_AGG(CONVERT(NVARCHAR(12), vva.IDValorAtributo), N',')
                                 WITHIN GROUP (ORDER BY vva.IDValorAtributo)
                          FROM dbo.VarianteValorAtributo AS vva
                          WHERE vva.IDVariante = v.IDVariante), N'') = @Combinacion;

            IF @@ROWCOUNT > 0
                THROW 50001, @Mensaje, 1;
        END;

        -- Sin cambios: no escribe ni registra nada. El SKU se compara distinguiendo mayúsculas
        -- para que corregir "cam-01" a "CAM-01" sí cuente como cambio.
        IF @SKU COLLATE Modern_Spanish_100_CS_AS <> @SKUActual COLLATE Modern_Spanish_100_CS_AS
           OR @Combinacion <> @CombinacionActual
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Catalogo_VarianteJson(@IDVariante);

            -- SKU repetido → 2627 → DUPLICADO.
            UPDATE dbo.Variante SET SKU = @SKU WHERE IDVariante = @IDVariante;

            IF @Combinacion <> @CombinacionActual
            BEGIN
                DELETE FROM dbo.VarianteValorAtributo WHERE IDVariante = @IDVariante;

                INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo)
                SELECT @IDVariante, IDAtributo, IDValorAtributo
                FROM @Valor;
            END;

            UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

            SELECT @Nuevo = Json FROM dbo.FU_Catalogo_VarianteJson(@IDVariante);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Variante', @IDVariante, N'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Variantes_ObtenerPorId @IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/variantes/:id/precio. No altera pedidos ya realizados: PedidoDetalle guarda su precio.
-- Bitácora: MODIFICAR de Variante con ValorAnterior {"IDVariante","SKU","Precio"} y ValorNuevo igual
-- con el precio nuevo. Si el precio no cambia no escribe ni registra nada.
-- Resultado: los 2 result sets de SP_Variantes_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_CambiarPrecio
    @IDUsuarioSolicitante INT,
    @IDVariante           INT,
    @Precio               DECIMAL(12,2)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @PrecioActual DECIMAL(12,2);
    DECLARE @IDProducto INT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Precio IS NULL OR @Precio <= 0
            THROW 50001, N'El precio debe ser mayor que 0.', 1;

        SELECT @PrecioActual = Precio, @IDProducto = IDProducto
        FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
        WHERE IDVariante = @IDVariante;

        IF @PrecioActual IS NULL
            THROW 50004, N'La variante no existe.', 1;

        IF @PrecioActual <> @Precio
        BEGIN
            SET @Anterior = (SELECT IDVariante, SKU, Precio FROM dbo.Variante WHERE IDVariante = @IDVariante
                             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            UPDATE dbo.Variante SET Precio = @Precio WHERE IDVariante = @IDVariante;

            UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

            SET @Nuevo = (SELECT IDVariante, SKU, Precio FROM dbo.Variante WHERE IDVariante = @IDVariante
                          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Variante', @IDVariante, N'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Variantes_ObtenerPorId @IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/variantes/:id/estado. Una variante inactiva no se muestra ni se vende; conserva su
-- existencia. Si ya está en ese estado no escribe ni registra nada.
-- Bitácora: ACTIVAR o DESACTIVAR de Variante. Resultado: SP_Variantes_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Variantes_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDVariante           INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT;
    DECLARE @IDProducto INT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        SELECT @ActivoActual = Activo, @IDProducto = IDProducto
        FROM dbo.Variante WITH (UPDLOCK, ROWLOCK)
        WHERE IDVariante = @IDVariante;

        IF @ActivoActual IS NULL
            THROW 50004, N'La variante no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Catalogo_VarianteJson(@IDVariante);

            UPDATE dbo.Variante SET Activo = @Activo WHERE IDVariante = @IDVariante;

            UPDATE dbo.Producto SET FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

            SELECT @Nuevo = Json FROM dbo.FU_Catalogo_VarianteJson(@IDVariante);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Variante', @IDVariante,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Variantes_ObtenerPorId @IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Atributos
   ========================================================= */

-- GET /api/atributos: atributos con sus valores, en orden de creación (S, M, L, XL).
-- Result sets, en orden:
--   1. Atributos
--   2. Valores de todos los atributos, con cuántas variantes los usan
CREATE OR ALTER PROCEDURE dbo.SP_Atributos_Listar
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.IDAtributo,
        a.Nombre,
        (SELECT COUNT(*) FROM dbo.ValorAtributo AS va WHERE va.IDAtributo = a.IDAtributo) AS CantidadValores
    FROM dbo.Atributo AS a
    ORDER BY a.IDAtributo;

    SELECT
        va.IDValorAtributo,
        va.IDAtributo,
        va.Valor,
        (SELECT COUNT(*) FROM dbo.VarianteValorAtributo AS vva WHERE vva.IDValorAtributo = va.IDValorAtributo) AS CantidadVariantes
    FROM dbo.ValorAtributo AS va
    ORDER BY va.IDAtributo, va.IDValorAtributo;
END;
GO

-- POST /api/atributos. Nombre repetido → 2627 (UQ_Atributo_Nombre) → DUPLICADO.
-- Bitácora: CREAR de Atributo.
CREATE OR ALTER PROCEDURE dbo.SP_Atributos_Crear
    @IDUsuarioSolicitante INT,
    @Nombre               NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDAtributo INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Nombre = TRIM(@Nombre);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre del atributo es obligatorio.', 1;

        INSERT INTO dbo.Atributo (Nombre) VALUES (@Nombre);

        SET @IDAtributo = SCOPE_IDENTITY();

        SET @Nuevo = (SELECT IDAtributo, Nombre FROM dbo.Atributo WHERE IDAtributo = @IDAtributo
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'Atributo', @IDAtributo, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        SELECT IDAtributo, Nombre
        FROM dbo.Atributo
        WHERE IDAtributo = @IDAtributo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/atributos/:id/valores. Valor repetido en el mismo atributo → 2627
-- (UQ_ValorAtributo_IDAtributo_Valor) → DUPLICADO. Bitácora: CREAR de ValorAtributo.
CREATE OR ALTER PROCEDURE dbo.SP_Atributos_AgregarValor
    @IDUsuarioSolicitante INT,
    @IDAtributo           INT,
    @Valor                NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDValorAtributo INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Valor = TRIM(@Valor);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Valor IS NULL OR LEN(@Valor) = 0
            THROW 50001, N'El valor del atributo es obligatorio.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.Atributo WITH (UPDLOCK, ROWLOCK) WHERE IDAtributo = @IDAtributo)
            THROW 50004, N'El atributo no existe.', 1;

        INSERT INTO dbo.ValorAtributo (IDAtributo, Valor) VALUES (@IDAtributo, @Valor);

        SET @IDValorAtributo = SCOPE_IDENTITY();

        SET @Nuevo = (SELECT va.IDValorAtributo, va.IDAtributo, a.Nombre AS Atributo, va.Valor
                      FROM dbo.ValorAtributo AS va
                      INNER JOIN dbo.Atributo AS a ON a.IDAtributo = va.IDAtributo
                      WHERE va.IDValorAtributo = @IDValorAtributo
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Catalogo', N'ValorAtributo', @IDValorAtributo, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        SELECT va.IDValorAtributo, va.IDAtributo, a.Nombre AS Atributo, va.Valor
        FROM dbo.ValorAtributo AS va
        INNER JOIN dbo.Atributo AS a ON a.IDAtributo = va.IDAtributo
        WHERE va.IDValorAtributo = @IDValorAtributo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ===== 009_sp_inventario.sql =====
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

-- ===== 010_sp_carrito.sql =====
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

-- ===== 011_sp_cupones.sql =====
/*
    011_sp_cupones.sql
    Stored procedures de gestión de cupones (Administrador).

    Los SPs que escriben reciben @IDUsuarioSolicitante (sale del JWT), validan antes de escribir,
    bloquean con UPDLOCK, ROWLOCK y registran la Bitacora (Modulo 'Cupones', Entidad 'Cupon') en
    la misma transacción, con la foto de FU_Cupones_CuponJson en ValorAnterior / ValorNuevo.

    Reglas que se validan con 50001 antes de llegar a los CHECK de Cupon:
      - Codigo obligatorio, hasta 30 caracteres, solo letras A-Z, dígitos, '-' y '_'; se guarda en
        mayúsculas. Repetido → 2627 (UQ_Cupon_Codigo) → DUPLICADO.
      - TipoDescuento PORCENTAJE (Valor > 0 y <= 100) o MONTO_FIJO (Valor > 0).
      - MontoMinimo >= 0 (NULL = 0).
      - FechaFin > FechaInicio (instantes UTC). Se permite crear un cupón ya vencido o futuro.
      - LimiteUsosTotal > 0; LimiteUsosPorCliente entre 1 y LimiteUsosTotal.
      - Actualizar no puede bajar LimiteUsosTotal por debajo de UsosActuales.
    La categoría (opcional) debe existir → 50004; puede estar inactiva (sus productos no se ven,
    así que el cupón no aplicará mientras lo esté).

    UsosActuales no se edita aquí: lo mantienen SP_Pedidos_CrearPedido (+1) y SP_Pedidos_Cancelar (-1).

    Orden de bloqueo: Categoria → Cupon. Crear y Actualizar bloquean la categoría del cupón con
    UPDLOCK, igual que SP_Categorias_Eliminar, que comprueba los cupones con READCOMMITTEDLOCK:
    un cupón no puede quedar en una categoría que se está eliminando.

    Listados: @Pagina (desde 1), @TamanoPagina (1 a 100) y @Orden 'campo:asc|desc', elegido con
    CASE sobre una lista blanca (nunca concatenado). Devuelven las filas y luego Total.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (solicitante desactivado, SP_Usuarios_ValidarSolicitante)
      50051  EN_USO (eliminar un cupón que algún pedido o carrito tiene)
      2627   DUPLICADO (UQ_Cupon_Codigo; sin número de THROW propio)
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Uso interno
   ========================================================= */

-- Sin endpoint: valida los datos de un cupón para SP_Cupones_Crear y SP_Cupones_Actualizar.
-- Recibe los valores ya normalizados; lanza 50001 con el primer dato inválido.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ValidarDatos
    @Codigo               NVARCHAR(100),
    @TipoDescuento        NVARCHAR(20),
    @Valor                DECIMAL(12,2),
    @MontoMinimo          DECIMAL(12,2),
    @FechaInicio          DATETIME2(3),
    @FechaFin             DATETIME2(3),
    @LimiteUsosTotal      INT,
    @LimiteUsosPorCliente INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @Codigo IS NULL
        THROW 50001, N'El código del cupón es obligatorio.', 1;

    IF LEN(@Codigo) > 30
        THROW 50001, N'El código del cupón admite hasta 30 caracteres.', 1;

    -- Collation binaria: la de la base (CI_AI) haría que [A-Z] aceptara letras con tilde o Ñ.
    IF @Codigo COLLATE Latin1_General_BIN2 LIKE N'%[^-A-Z0-9_]%'
        THROW 50001, N'El código del cupón solo admite letras sin tilde, números, guion y guion bajo.', 1;

    IF @TipoDescuento IS NULL OR @TipoDescuento NOT IN (N'PORCENTAJE', N'MONTO_FIJO')
        THROW 50001, N'El tipo de descuento debe ser PORCENTAJE o MONTO_FIJO.', 1;

    IF @Valor IS NULL OR @Valor <= 0
        THROW 50001, N'El valor del descuento debe ser mayor que 0.', 1;

    IF @TipoDescuento = N'PORCENTAJE' AND @Valor > 100
        THROW 50001, N'Un descuento por porcentaje no puede ser mayor que 100.', 1;

    IF @MontoMinimo < 0
        THROW 50001, N'El monto mínimo no puede ser negativo.', 1;

    IF @FechaInicio IS NULL OR @FechaFin IS NULL
        THROW 50001, N'Las fechas de inicio y fin son obligatorias.', 1;

    IF @FechaFin <= @FechaInicio
        THROW 50001, N'La fecha de fin debe ser posterior a la fecha de inicio.', 1;

    IF @LimiteUsosTotal IS NULL OR @LimiteUsosTotal <= 0
        THROW 50001, N'El límite total de usos debe ser mayor que 0.', 1;

    IF @LimiteUsosPorCliente IS NULL OR @LimiteUsosPorCliente < 1
        THROW 50001, N'El límite de usos por cliente debe ser al menos 1.', 1;

    IF @LimiteUsosPorCliente > @LimiteUsosTotal
        THROW 50001, N'El límite de usos por cliente no puede ser mayor que el límite total.', 1;
END;
GO

/* =========================================================
   Consultas
   ========================================================= */

-- GET /api/cupones: lista paginada.
--   @Texto    busca en el código
--   @Activo   1 / 0 / NULL (todos)
--   @Vigente  1: FechaInicio <= ahora <= FechaFin; 0: fuera de vigencia (futuro o vencido);
--             NULL: todos. No mira Activo ni los usos.
--   @Orden    codigo | fechaInicio | fechaFin | usosActuales | valor, con :asc o :desc.
--             Default codigo:asc.
-- Mismas columnas que SP_Cupones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Listar
    @Texto        NVARCHAR(100) = NULL,
    @Activo       BIT           = NULL,
    @Vigente      BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'codigo:asc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'codigo:asc', N'codigo:desc', N'fechaInicio:asc', N'fechaInicio:desc',
                      N'fechaFin:asc', N'fechaFin:desc', N'usosActuales:asc', N'usosActuales:desc',
                      N'valor:asc', N'valor:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa codigo, fechaInicio, fechaFin, usosActuales o valor con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDCupon      INT           NOT NULL PRIMARY KEY,
        Codigo       NVARCHAR(30)  NOT NULL,
        FechaInicio  DATETIME2(3)  NOT NULL,
        FechaFin     DATETIME2(3)  NOT NULL,
        UsosActuales INT           NOT NULL,
        Valor        DECIMAL(12,2) NOT NULL
    );

    INSERT INTO @Fila (IDCupon, Codigo, FechaInicio, FechaFin, UsosActuales, Valor)
    SELECT cu.IDCupon, cu.Codigo, cu.FechaInicio, cu.FechaFin, cu.UsosActuales, cu.Valor
    FROM dbo.Cupon AS cu
    WHERE (@Activo IS NULL OR cu.Activo = @Activo)
      AND (@Vigente IS NULL
           OR (@Vigente = 1 AND cu.FechaInicio <= @Ahora AND cu.FechaFin >= @Ahora)
           OR (@Vigente = 0 AND (cu.FechaInicio > @Ahora OR cu.FechaFin < @Ahora)))
      AND (@Patron IS NULL OR cu.Codigo LIKE @Patron)
    OPTION (RECOMPILE);

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
        cu.LimiteUsosTotal - cu.UsosActuales AS UsosDisponibles,
        cu.Activo,
        CONVERT(BIT, CASE WHEN cu.FechaInicio <= @Ahora AND cu.FechaFin >= @Ahora THEN 1 ELSE 0 END) AS Vigente,
        CONVERT(BIT, CASE WHEN cu.UsosActuales >= cu.LimiteUsosTotal THEN 1 ELSE 0 END) AS Agotado,
        n.CantidadPedidos,
        n.CantidadCarritos,
        CONVERT(BIT, CASE WHEN n.CantidadPedidos = 0 AND n.CantidadCarritos = 0 THEN 1 ELSE 0 END) AS PuedeEliminarse
    FROM @Fila AS f
    INNER JOIN dbo.Cupon AS cu ON cu.IDCupon = f.IDCupon
    LEFT JOIN dbo.Categoria AS cat ON cat.IDCategoria = cu.IDCategoria
    CROSS APPLY (
        SELECT
            (SELECT COUNT(*) FROM dbo.Pedido AS p WHERE p.IDCupon = cu.IDCupon)   AS CantidadPedidos,
            (SELECT COUNT(*) FROM dbo.Carrito AS c WHERE c.IDCupon = cu.IDCupon)  AS CantidadCarritos
    ) AS n
    ORDER BY
        CASE WHEN @Orden = N'codigo:asc'        THEN f.Codigo       END ASC,
        CASE WHEN @Orden = N'codigo:desc'       THEN f.Codigo       END DESC,
        CASE WHEN @Orden = N'fechaInicio:asc'   THEN f.FechaInicio  END ASC,
        CASE WHEN @Orden = N'fechaInicio:desc'  THEN f.FechaInicio  END DESC,
        CASE WHEN @Orden = N'fechaFin:asc'      THEN f.FechaFin     END ASC,
        CASE WHEN @Orden = N'fechaFin:desc'     THEN f.FechaFin     END DESC,
        CASE WHEN @Orden = N'usosActuales:asc'  THEN f.UsosActuales END ASC,
        CASE WHEN @Orden = N'usosActuales:desc' THEN f.UsosActuales END DESC,
        CASE WHEN @Orden = N'valor:asc'         THEN f.Valor        END ASC,
        CASE WHEN @Orden = N'valor:desc'        THEN f.Valor        END DESC,
        f.IDCupon ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/cupones/:id. También es el resultado de los SPs que crean o modifican cupones.
--   UsosActuales     usos que cuentan contra el límite (pedidos no cancelados)
--   CantidadPedidos  pedidos con el cupón, incluidos los cancelados
--   CantidadCarritos carritos (en cualquier estado) que lo tienen aplicado
--   PuedeEliminarse  1 si las dos cantidades son 0 (SP_Cupones_Eliminar)
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ObtenerPorId
    @IDCupon INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();

    IF NOT EXISTS (SELECT 1 FROM dbo.Cupon WHERE IDCupon = @IDCupon)
        THROW 50004, N'El cupón no existe.', 1;

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
        cu.LimiteUsosTotal - cu.UsosActuales AS UsosDisponibles,
        cu.Activo,
        CONVERT(BIT, CASE WHEN cu.FechaInicio <= @Ahora AND cu.FechaFin >= @Ahora THEN 1 ELSE 0 END) AS Vigente,
        CONVERT(BIT, CASE WHEN cu.UsosActuales >= cu.LimiteUsosTotal THEN 1 ELSE 0 END) AS Agotado,
        n.CantidadPedidos,
        n.CantidadCarritos,
        CONVERT(BIT, CASE WHEN n.CantidadPedidos = 0 AND n.CantidadCarritos = 0 THEN 1 ELSE 0 END) AS PuedeEliminarse
    FROM dbo.Cupon AS cu
    LEFT JOIN dbo.Categoria AS cat ON cat.IDCategoria = cu.IDCategoria
    CROSS APPLY (
        SELECT
            (SELECT COUNT(*) FROM dbo.Pedido AS p WHERE p.IDCupon = cu.IDCupon)   AS CantidadPedidos,
            (SELECT COUNT(*) FROM dbo.Carrito AS c WHERE c.IDCupon = cu.IDCupon)  AS CantidadCarritos
    ) AS n
    WHERE cu.IDCupon = @IDCupon;
END;
GO

-- GET /api/cupones/:id/usos: usos que cuentan del cupón (UsoCupon), paginados. Al cancelar un
-- pedido se borra su uso, así que los cancelados no aparecen. Descuento es Pedido.Descuento.
--   @Orden  fecha | descuento, con :asc o :desc. Default fecha:desc.
-- Cupón inexistente → 50004.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ListarUsos
    @IDCupon      INT,
    @Pagina       INT          = 1,
    @TamanoPagina INT          = 20,
    @Orden        NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'fecha:desc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'fecha:asc', N'fecha:desc', N'descuento:asc', N'descuento:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden, N'. Usa fecha o descuento con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.Cupon WHERE IDCupon = @IDCupon)
        THROW 50004, N'El cupón no existe.', 1;

    DECLARE @Fila TABLE (
        IDUsoCupon INT           NOT NULL PRIMARY KEY,
        Fecha      DATETIME2(3)  NOT NULL,
        Descuento  DECIMAL(12,2) NOT NULL
    );

    INSERT INTO @Fila (IDUsoCupon, Fecha, Descuento)
    SELECT uc.IDUsoCupon, uc.Fecha, p.Descuento
    FROM dbo.UsoCupon AS uc
    INNER JOIN dbo.Pedido AS p ON p.IDPedido = uc.IDPedido
    INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
    WHERE uc.IDCupon = @IDCupon
      AND ep.Codigo <> N'CANCELADO';

    SELECT
        uc.IDUsoCupon,
        uc.IDPedido,
        p.NumeroPedido,
        uc.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Cliente,
        u.Correo,
        p.Descuento,
        p.Total AS TotalPedido,
        ep.Codigo AS EstadoPedido,
        uc.Fecha
    FROM @Fila AS f
    INNER JOIN dbo.UsoCupon AS uc ON uc.IDUsoCupon = f.IDUsoCupon
    INNER JOIN dbo.Pedido AS p ON p.IDPedido = uc.IDPedido
    INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = uc.IDUsuario
    ORDER BY
        CASE WHEN @Orden = N'fecha:asc'      THEN f.Fecha      END ASC,
        CASE WHEN @Orden = N'fecha:desc'     THEN f.Fecha      END DESC,
        CASE WHEN @Orden = N'descuento:asc'  THEN f.Descuento  END ASC,
        CASE WHEN @Orden = N'descuento:desc' THEN f.Descuento  END DESC,
        f.IDUsoCupon DESC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

/* =========================================================
   Escritura
   ========================================================= */

-- POST /api/cupones: crea un cupón activo con UsosActuales = 0.
--   @IDCategoria  NULL: aplica a todo el carrito
-- Código repetido → 2627 (UQ_Cupon_Codigo) → DUPLICADO. Categoría inexistente → 50004.
-- Bitácora: CREAR de Cupon. Resultado: SP_Cupones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Crear
    @IDUsuarioSolicitante INT,
    @Codigo               NVARCHAR(100),
    @Descripcion          NVARCHAR(300) = NULL,
    @TipoDescuento        NVARCHAR(20),
    @Valor                DECIMAL(12,2),
    @IDCategoria          INT           = NULL,
    @MontoMinimo          DECIMAL(12,2) = 0,
    @FechaInicio          DATETIME2(3),
    @FechaFin             DATETIME2(3),
    @LimiteUsosTotal      INT,
    @LimiteUsosPorCliente INT           = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCupon INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Codigo        = UPPER(NULLIF(TRIM(@Codigo), N''));
    SET @Descripcion   = NULLIF(TRIM(@Descripcion), N'');
    SET @TipoDescuento = UPPER(TRIM(@TipoDescuento));
    SET @MontoMinimo   = ISNULL(@MontoMinimo, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        EXEC dbo.SP_Cupones_ValidarDatos @Codigo, @TipoDescuento, @Valor, @MontoMinimo,
                                         @FechaInicio, @FechaFin, @LimiteUsosTotal, @LimiteUsosPorCliente;

        -- 2. Bloquear la categoría (carrera con SP_Categorias_Eliminar)
        IF @IDCategoria IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50004, N'La categoría no existe.', 1;

        -- 3. Escribir. Código repetido → 2627 → DUPLICADO.
        INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, IDCategoria, MontoMinimo,
                               FechaInicio, FechaFin, LimiteUsosTotal, LimiteUsosPorCliente, UsosActuales, Activo)
        VALUES (@Codigo, @Descripcion, @TipoDescuento, @Valor, @IDCategoria, @MontoMinimo,
                @FechaInicio, @FechaFin, @LimiteUsosTotal, @LimiteUsosPorCliente, 0, 1);

        SET @IDCupon = SCOPE_IDENTITY();

        -- 4. Bitácora
        SELECT @Nuevo = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Cupones', N'Cupon', @IDCupon, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Cupones_ObtenerPorId @IDCupon = @IDCupon;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/cupones/:id: reemplaza todos los datos editables (omitir Descripcion o IDCategoria
-- los borra). No cambia Activo (SP_Cupones_CambiarEstado) ni UsosActuales.
-- LimiteUsosTotal < UsosActuales → 50001. Los pedidos ya hechos conservan su descuento; los
-- carritos que lo tienen aplicado se recalculan con los datos nuevos.
-- Bitácora: MODIFICAR de Cupon (si no cambia nada, no registra). Resultado: SP_Cupones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Actualizar
    @IDUsuarioSolicitante INT,
    @IDCupon              INT,
    @Codigo               NVARCHAR(100),
    @Descripcion          NVARCHAR(300) = NULL,
    @TipoDescuento        NVARCHAR(20),
    @Valor                DECIMAL(12,2),
    @IDCategoria          INT           = NULL,
    @MontoMinimo          DECIMAL(12,2) = 0,
    @FechaInicio          DATETIME2(3),
    @FechaFin             DATETIME2(3),
    @LimiteUsosTotal      INT,
    @LimiteUsosPorCliente INT           = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @UsosActuales INT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX), @Mensaje NVARCHAR(2048);

    SET @Codigo        = UPPER(NULLIF(TRIM(@Codigo), N''));
    SET @Descripcion   = NULLIF(TRIM(@Descripcion), N'');
    SET @TipoDescuento = UPPER(TRIM(@TipoDescuento));
    SET @MontoMinimo   = ISNULL(@MontoMinimo, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        EXEC dbo.SP_Cupones_ValidarDatos @Codigo, @TipoDescuento, @Valor, @MontoMinimo,
                                         @FechaInicio, @FechaFin, @LimiteUsosTotal, @LimiteUsosPorCliente;

        -- 2. Bloquear: categoría nueva y después el cupón (orden Categoria → Cupon)
        IF @IDCategoria IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria)
            THROW 50004, N'La categoría no existe.', 1;

        SELECT @UsosActuales = UsosActuales
        FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK)
        WHERE IDCupon = @IDCupon;

        IF @UsosActuales IS NULL
            THROW 50004, N'El cupón no existe.', 1;

        IF @LimiteUsosTotal < @UsosActuales
        BEGIN
            SET @Mensaje = CONCAT(N'El límite total de usos no puede ser menor que los usos actuales (', @UsosActuales, N').');
            THROW 50001, @Mensaje, 1;
        END;

        SELECT @Anterior = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

        -- 3. Escribir. Código repetido → 2627 → DUPLICADO.
        UPDATE dbo.Cupon
        SET Codigo               = @Codigo,
            Descripcion          = @Descripcion,
            TipoDescuento        = @TipoDescuento,
            Valor                = @Valor,
            IDCategoria          = @IDCategoria,
            MontoMinimo          = @MontoMinimo,
            FechaInicio          = @FechaInicio,
            FechaFin             = @FechaFin,
            LimiteUsosTotal      = @LimiteUsosTotal,
            LimiteUsosPorCliente = @LimiteUsosPorCliente
        WHERE IDCupon = @IDCupon;

        -- 4. Bitácora, solo si algo cambió (comparación binaria: un cambio de mayúsculas cuenta)
        SELECT @Nuevo = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

        IF @Nuevo COLLATE Latin1_General_BIN2 <> @Anterior COLLATE Latin1_General_BIN2
            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Cupones', N'Cupon', @IDCupon, N'MODIFICAR', @Anterior, @Nuevo);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Cupones_ObtenerPorId @IDCupon = @IDCupon;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/cupones/:id/estado: activa o desactiva. Un cupón inactivo deja de descontar en los
-- carritos que lo tienen (CUPON_INACTIVO) y no puede aplicarse. Si ya está en ese estado no
-- escribe ni registra nada.
-- Bitácora: ACTIVAR / DESACTIVAR de Cupon. Resultado: SP_Cupones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDCupon              INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        SELECT @ActivoActual = Activo
        FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK)
        WHERE IDCupon = @IDCupon;

        IF @ActivoActual IS NULL
            THROW 50004, N'El cupón no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

            UPDATE dbo.Cupon SET Activo = @Activo WHERE IDCupon = @IDCupon;

            SELECT @Nuevo = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Cupones', N'Cupon', @IDCupon,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Cupones_ObtenerPorId @IDCupon = @IDCupon;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/cupones/:id: borrado físico solo si ningún pedido (aunque esté cancelado) ni
-- carrito (en cualquier estado) lo tiene → si no, 50051 EN_USO: se debe desactivar.
-- El cupón queda bloqueado con UPDLOCK y SP_Carrito_AplicarCupon bloquea el suyo igual, así un
-- carrito no puede tomarlo entre la comprobación y el DELETE. La comprobación lee con
-- READCOMMITTEDLOCK: con READ_COMMITTED_SNAPSHOT una lectura normal no vería un pedido o carrito
-- aún sin confirmar.
-- Bitácora: ELIMINAR de Cupon con la foto en ValorAnterior. Sin result set.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Eliminar
    @IDUsuarioSolicitante INT,
    @IDCupon              INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF NOT EXISTS (SELECT 1 FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK) WHERE IDCupon = @IDCupon)
            THROW 50004, N'El cupón no existe.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Pedido WITH (READCOMMITTEDLOCK) WHERE IDCupon = @IDCupon)
            THROW 50051, N'El cupón se usó en pedidos y no puede eliminarse; desactívalo en lugar de eliminarlo.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Carrito WITH (READCOMMITTEDLOCK) WHERE IDCupon = @IDCupon)
            THROW 50051, N'El cupón está aplicado en carritos y no puede eliminarse; desactívalo en lugar de eliminarlo.', 1;

        SELECT @Anterior = Json FROM dbo.FU_Cupones_CuponJson(@IDCupon);

        DELETE FROM dbo.Cupon WHERE IDCupon = @IDCupon;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Cupones', N'Cupon', @IDCupon, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ===== 012_sp_pedidos.sql =====
/*
    012_sp_pedidos.sql
    Stored procedures de checkout, pedidos, estados y devoluciones.

    Montos: el cálculo vive solo en las funciones de 005_funciones.sql (FU_Cupones_CalculoDescuento,
    FU_Cupones_Validar, FU_Carrito_CalcularTotales). El resumen del checkout, el total que se cobra y
    lo que se congela en Pedido / PedidoDetalle salen de ellas, así que coinciden.

    Rol del solicitante: los SPs de pedidos lo buscan en la base (Usuario → Rol) a partir de
    @IDUsuarioSolicitante; el backend no lo envía. Un Cliente solo ve y toca sus pedidos: el de otro
    cliente responde como inexistente (50004). Los roles se comparan por Nombre, nunca por ID.

    Orden de bloqueo (ver Entregable/README.md): Carrito → Cupon → Variante → ReservaExistencia, y con un
    pedido existente Pedido → PedidoDetalle → Cupon → Variante. Varias variantes se bloquean una a una
    en orden de IDVariante (UPDLOCK, ROWLOCK). CrearPedido toma antes un bloqueo de aplicación por
    Idempotency-Key.

    Saldos que mantienen estos SPs en la misma transacción que sus filas de origen:
      Variante.ExistenciaFisica / ExistenciaReservada, Cupon.UsosActuales, PedidoDetalle.CantidadDevuelta,
      Pedido.IDEstadoPedido (con HistorialEstadoPedido) y Pago.Estado.

    Bitácora (Modulo 'Pedidos', Entidad 'Pedido', IDRegistro = IDPedido): CREAR al crear el pedido y
    MODIFICAR en cada cambio de estado, cancelación y devolución. ValorAnterior y ValorNuevo son
    FU_Pedidos_PedidoJson (estado, montos, estado del pago, monto reembolsado y líneas con su cantidad
    devuelta).

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO (incluye el pedido o la dirección de otro cliente)
      50012  USUARIO_INACTIVO (solicitante desactivado)
      50020  PAGO_RECHAZADO (tarjeta terminada en 0000, también si es una tarjeta guardada)
      50021  IDEMPOTENCIA_CONFLICTO
      50030  STOCK_INSUFICIENTE
      50031  RESERVA_VENCIDA
      50040  TRANSICION_NO_PERMITIDA
      50041  CANTIDAD_DEVOLUCION_EXCEDIDA
      50060–50067  motivos de rechazo del cupón (FU_Cupones_Validar)
    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Checkout
   ========================================================= */

-- GET /api/metodos-envio: métodos de envío activos, del más barato al más caro.
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_ListarMetodosEnvio
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        IDMetodoEnvio,
        Nombre,
        Costo,
        DiasEstimados
    FROM dbo.MetodoEnvio
    WHERE Activo = 1
    ORDER BY Costo, Nombre;
END;
GO

-- Sin endpoint: resumen del checkout de un carrito ya resuelto. Lo devuelven SP_Inventario_ReservarExistencia
-- y SP_Checkout_ObtenerResumen. No escribe ni bloquea. Dos result sets, en orden:
--   1. Encabezado (una fila): IDCarrito INT, IDCupon INT NULL, CodigoCupon NVARCHAR(30) NULL,
--      DescripcionCupon NVARCHAR(300) NULL, TipoDescuento NVARCHAR(20) NULL, ValorCupon DECIMAL(12,2) NULL,
--      CuponAplicado BIT, CodigoErrorCupon INT NULL, MensajeErrorCupon NVARCHAR(400) NULL,
--      CantidadLineas INT, CantidadUnidades INT, Subtotal, Descuento, CostoEnvio, Total (DECIMAL(12,2)),
--      PorcentajeIVA DECIMAL(5,2), MontoIVA DECIMAL(12,2), IDMetodoEnvio INT NULL, MetodoEnvio NVARCHAR(100) NULL,
--      DiasEstimados TINYINT NULL, ReservaVigente BIT, ReservaExpiraEn DATETIME2(3) NULL (UTC)
--   2. Líneas (una por línea del carrito): IDCarritoDetalle INT, IDVariante INT, SKU NVARCHAR(50),
--      Producto NVARCHAR(150), DescripcionVariante NVARCHAR(200) NULL, Cantidad INT,
--      PrecioUnitario, Importe, DescuentoLinea, ImporteNeto (DECIMAL(12,2))
-- Sin @IDMetodoEnvio (o inexistente) el costo de envío es 0 y las columnas del método son NULL.
-- Un cupón que dejó de valer no descuenta; CodigoErrorCupon / MensajeErrorCupon dicen por qué.
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_ArmarResumen
    @IDCarrito     INT,
    @IDMetodoEnvio INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Costo DECIMAL(12,2);
    DECLARE @IDCuponAplicado INT;

    SELECT @Costo = Costo
    FROM dbo.MetodoEnvio
    WHERE IDMetodoEnvio = @IDMetodoEnvio;

    SET @Costo = ISNULL(@Costo, 0);

    SELECT @IDCuponAplicado = CASE WHEN CuponAplicado = 1 THEN IDCupon END
    FROM dbo.FU_Carrito_CalcularTotales(@IDCarrito, @Costo);

    -- 1. Encabezado
    SELECT
        t.IDCarrito,
        t.IDCupon,
        cu.Codigo           AS CodigoCupon,
        cu.Descripcion      AS DescripcionCupon,
        cu.TipoDescuento,
        cu.Valor            AS ValorCupon,
        t.CuponAplicado,
        t.CodigoErrorCupon,
        t.MensajeErrorCupon,
        t.CantidadLineas,
        t.CantidadUnidades,
        t.Subtotal,
        t.Descuento,
        t.CostoEnvio,
        t.Total,
        t.PorcentajeIVA,
        t.MontoIVA,
        m.IDMetodoEnvio,
        m.Nombre            AS MetodoEnvio,
        m.DiasEstimados,
        e.Vigente           AS ReservaVigente,
        e.ReservaExpiraEn
    FROM dbo.FU_Carrito_CalcularTotales(@IDCarrito, @Costo) AS t
    LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = t.IDCupon
    LEFT JOIN dbo.MetodoEnvio AS m ON m.IDMetodoEnvio = @IDMetodoEnvio
    CROSS APPLY dbo.FU_Checkout_EstadoReserva(@IDCarrito) AS e;

    -- 2. Líneas
    SELECT
        d.IDCarritoDetalle,
        d.IDVariante,
        v.SKU,
        p.Nombre AS Producto,
        dv.Descripcion AS DescripcionVariante,
        d.Cantidad,
        d.PrecioUnitario,
        d.Importe,
        d.DescuentoLinea,
        d.ImporteNeto
    FROM dbo.FU_Cupones_CalculoDescuento(@IDCarrito, @IDCuponAplicado) AS d
    INNER JOIN dbo.Variante AS v ON v.IDVariante = d.IDVariante
    INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(d.IDVariante) AS dv
    ORDER BY d.IDCarritoDetalle;
END;
GO

-- GET /api/checkout: retoma el checkout tras recargar la página. Solo lee.
--   @IDMetodoEnvio  opcional: el método elegido en "iniciar" no se guarda en la base (no hay columna);
--                   el frontend lo conserva y lo envía como query para recalcular el envío y el total.
--                   Sin él, CostoEnvio = 0. Un método inexistente o inactivo → 50004.
-- Sin reserva vigente → 50031 (el cliente debe volver a iniciar el checkout). Vigente significa que el carrito
-- tiene líneas y cada una tiene una reserva ACTIVA no vencida de la misma cantidad, sin reservas de otras
-- variantes (FU_Checkout_EstadoReserva): si el carrito cambió después de iniciar, también es 50031.
-- Resultado: SP_Checkout_ArmarResumen (dos result sets).
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_ObtenerResumen
    @IDUsuarioSolicitante INT,
    @IDMetodoEnvio        INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IDCarrito INT;
    DECLARE @Vigente BIT;

    IF @IDMetodoEnvio IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.MetodoEnvio WHERE IDMetodoEnvio = @IDMetodoEnvio AND Activo = 1)
        THROW 50004, N'El método de envío no existe o no está disponible.', 1;

    EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 0, @IDCarrito OUTPUT;

    IF @IDCarrito IS NOT NULL
        SELECT @Vigente = Vigente FROM dbo.FU_Checkout_EstadoReserva(@IDCarrito);

    IF @IDCarrito IS NULL OR ISNULL(@Vigente, 0) = 0
        THROW 50031, N'No tienes una reserva vigente que coincida con tu carrito; inicia el pago de nuevo.', 1;

    EXEC dbo.SP_Checkout_ArmarResumen @IDCarrito = @IDCarrito, @IDMetodoEnvio = @IDMetodoEnvio;
END;
GO

-- POST /api/checkout/pagar: pago simulado y creación atómica del pedido.
--   @ClaveIdempotencia  header Idempotency-Key (UUID)
--   @IDDireccion, @IDMetodoEnvio  los elegidos en "iniciar" (no se guardan en la reserva; el body de pagar los lleva)
--   @MetodoPago         solo 'TARJETA' (si no, 50001)
--   @TitularTarjeta     obligatorio; la tabla Pago no guarda datos de tarjeta (solo TarjetaGuardada, si se pide)
--   @UltimosTarjeta     4 dígitos; '0000' es el rechazo simulado (50020)
--   @IDTarjetaGuardada  opcional: paga con una tarjeta guardada del solicitante. Su titular y últimos 4 reemplazan
--                       a @TitularTarjeta y @UltimosTarjeta ANTES de la huella y de la regla 0000, así que esa lógica
--                       no cambia. Ajena o inexistente → 50004; junto con @GuardarTarjeta = 1 → 50001.
--   @TipoTarjeta, @MarcaTarjeta  CREDITO|DEBITO y VISA|MASTERCARD|AMEX|OTRA; obligatorios solo con @GuardarTarjeta = 1 (50001)
--   @GuardarTarjeta     1 guarda la tarjeta nueva DESPUÉS de aprobar el pago, en la misma transacción y solo si
--                       Repetido = 0 (una repetición con la misma clave no guarda nada). Si el cliente ya la tiene
--                       (UQ_TarjetaGuardada_Tarjeta) no hace nada; si es su primera, queda predeterminada. Se inserta
--                       aquí y no con SP_Tarjetas_Crear: un SP anidado con su propio TRAN/CATCH revertiría el pedido.
--                       Bitácora CREAR de la tarjeta (Modulo 'Tarjetas').
--   La huella no incluye tarjeta guardada, tipo, marca ni guardar (sigue siendo T=<ultimos4>).
-- Idempotencia: HuellaSolicitud = SHA-256 en hexadecimal (mayúsculas) de un texto canónico calculado aquí:
--   D=<IDDireccion>;E=<IDMetodoEnvio>;P=<MetodoPago>;T=<UltimosTarjeta>;C=<IDCupon o vacío>;L=<IDVariante>x<Cantidad>,…
-- con las líneas ordenadas por IDVariante. Un bloqueo de aplicación exclusivo por clave (sp_getapplock,
-- al inicio de la transacción) serializa las peticiones simultáneas con la misma clave: la segunda espera,
-- ve el pedido ya confirmado y lo devuelve; no depende de capturar el 2627 de UQ_Pedido_ClaveIdempotencia.
-- Si esperar más de 15 s → 50021 (reintenta). Si la clave ya existe:
--   · es de otro usuario → 50021 (sin revelar el pedido ajeno);
--   · si el cliente tiene un carrito ACTIVO con líneas se compara la huella de (parámetros + ese carrito y su cupón);
--     si no, la de (parámetros + las líneas y el cupón del pedido, porque su carrito se convirtió con él);
--   · igual a la guardada → devuelve el pedido existente con Repetido = 1 (el backend responde 200); distinta → 50021.
-- Clave nueva: requiere carrito con líneas y una reserva ACTIVA no vencida que cubra exactamente cada una
-- (FU_Checkout_EstadoReserva), si no 50031; línea no vendible → 50001; cupón revalidado con FU_Cupones_Validar
-- bajo bloqueo del cupón (50060–50067, incluido 50065 por cliente); tarjeta 0000 → 50020 antes de escribir nada,
-- por lo que la reserva sigue vigente (todo se revierte).
-- En una transacción: Pedido (NumeroPedido SC-<año>-<IDPedido a 6 dígitos>, DireccionEntrega = copia textual
-- "Nombre, línea 1, línea 2, municipio, departamento CP. Tel: … Ref: …", máx. 800), PedidoDetalle con SKU,
-- nombre, descripción, precio unitario y descuento de línea congelados, kardex SALIDA_VENTA por línea (baja
-- ExistenciaFisica y ExistenciaReservada), reservas CONFIRMADA, UsoCupon y UsosActuales + 1 (UPDATE condicional;
-- 0 filas → 50064), Pago APROBADO (referencia simulada SIM-<hex>), HistorialEstadoPedido inicial (PAGADO) a nombre
-- del cliente, carrito CONVERTIDO y bitácora CREAR del pedido.
-- El precio es el vigente al pagar (si cambió desde "iniciar", el pedido congela el nuevo).
-- Resultado (una fila): IDPedido INT, NumeroPedido NVARCHAR(20), Estado NVARCHAR(30) (código actual),
-- Total DECIMAL(12,2), Repetido BIT, IDTarjetaGuardada INT (la tarjeta usada, la recién guardada o la que ya
-- existía al guardar; NULL si no se usó ni se guardó ninguna, y en una repetición con @GuardarTarjeta).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_CrearPedido
    @IDUsuarioSolicitante INT,
    @ClaveIdempotencia    UNIQUEIDENTIFIER,
    @IDDireccion          INT,
    @IDMetodoEnvio        INT,
    @MetodoPago           NVARCHAR(20),
    @TitularTarjeta       NVARCHAR(150),
    @UltimosTarjeta       CHAR(4),
    @IDTarjetaGuardada    INT           = NULL,
    @TipoTarjeta          NVARCHAR(10)  = NULL,
    @MarcaTarjeta         NVARCHAR(20)  = NULL,
    @GuardarTarjeta       BIT           = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3);
    DECLARE @Recurso NVARCHAR(255), @Resultado INT;
    DECLARE @IDPedido INT, @IDUsuarioPedido INT, @HuellaGuardada CHAR(64), @IDCuponPedido INT;
    DECLARE @Repetido BIT = 0;
    DECLARE @IDCarrito INT, @IDCuponCarrito INT, @IDCuponAplicado INT;
    DECLARE @Error INT, @Mensaje NVARCHAR(2048), @Skus NVARCHAR(MAX);
    DECLARE @Lineas NVARCHAR(MAX), @Huella CHAR(64);
    DECLARE @IDVariante INT, @Bloqueada INT;
    DECLARE @CostoEnvio DECIMAL(12,2);
    DECLARE @Subtotal DECIMAL(12,2), @Descuento DECIMAL(12,2), @Total DECIMAL(12,2), @MontoIVA DECIMAL(12,2);
    DECLARE @IDEstadoPagado INT, @IDTipoVenta INT, @SignoVenta SMALLINT;
    DECLARE @NumeroPedido NVARCHAR(20), @Direccion NVARCHAR(800), @Nuevo NVARCHAR(MAX);
    DECLARE @IDTarjetaResultado INT, @NuevaTarjeta NVARCHAR(MAX), @Predeterminar BIT;
    DECLARE @Bloqueo TABLE (IDVariante INT NOT NULL PRIMARY KEY);
    DECLARE @Linea TABLE (
        IDCarritoDetalle    INT           NOT NULL PRIMARY KEY,
        IDVariante          INT           NOT NULL,
        Cantidad            INT           NOT NULL,
        PrecioUnitario      DECIMAL(12,2) NOT NULL,
        Importe             DECIMAL(12,2) NOT NULL,
        DescuentoLinea      DECIMAL(12,2) NOT NULL,
        ImporteNeto         DECIMAL(12,2) NOT NULL,
        SKU                 NVARCHAR(50)  NOT NULL,
        NombreProducto      NVARCHAR(150) NOT NULL,
        DescripcionVariante NVARCHAR(200) NOT NULL,
        Vendible            BIT           NOT NULL
    );

    SET @MetodoPago = UPPER(NULLIF(TRIM(@MetodoPago), N''));
    SET @TitularTarjeta = NULLIF(TRIM(@TitularTarjeta), N'');
    SET @TipoTarjeta = UPPER(NULLIF(TRIM(@TipoTarjeta), N''));
    SET @MarcaTarjeta = UPPER(NULLIF(TRIM(@MarcaTarjeta), N''));
    SET @GuardarTarjeta = ISNULL(@GuardarTarjeta, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar los datos de la petición
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @ClaveIdempotencia IS NULL
            THROW 50001, N'La clave de idempotencia es obligatoria.', 1;

        IF @MetodoPago IS NULL OR @MetodoPago <> N'TARJETA'
            THROW 50001, N'El método de pago solo puede ser TARJETA.', 1;

        -- Tarjeta guardada: su titular y últimos 4 fijan los del pago antes de la huella y de la regla 0000.
        IF @IDTarjetaGuardada IS NOT NULL
        BEGIN
            IF @GuardarTarjeta = 1
                THROW 50001, N'No se puede guardar una tarjeta cuando se paga con una tarjeta guardada.', 1;

            SELECT @TitularTarjeta = Titular, @UltimosTarjeta = Ultimos4, @IDTarjetaResultado = IDTarjetaGuardada
            FROM dbo.TarjetaGuardada
            WHERE IDTarjetaGuardada = @IDTarjetaGuardada AND IDUsuario = @IDUsuarioSolicitante;

            IF @IDTarjetaResultado IS NULL
                THROW 50004, N'La tarjeta guardada no existe.', 1;
        END;

        IF @GuardarTarjeta = 1
        BEGIN
            IF @TipoTarjeta IS NULL OR @TipoTarjeta NOT IN (N'CREDITO', N'DEBITO')
                THROW 50001, N'Para guardar la tarjeta, el tipo debe ser CREDITO o DEBITO.', 1;

            IF @MarcaTarjeta IS NULL OR @MarcaTarjeta NOT IN (N'VISA', N'MASTERCARD', N'AMEX', N'OTRA')
                THROW 50001, N'Para guardar la tarjeta, la marca debe ser VISA, MASTERCARD, AMEX u OTRA.', 1;
        END;

        IF @TitularTarjeta IS NULL
            THROW 50001, N'El titular de la tarjeta es obligatorio.', 1;

        IF @UltimosTarjeta IS NULL OR @UltimosTarjeta NOT LIKE N'[0-9][0-9][0-9][0-9]'
            THROW 50001, N'Los últimos 4 dígitos de la tarjeta deben ser numéricos.', 1;

        -- 2. Serializar las peticiones con la misma clave (primero en el orden de bloqueo)
        SET @Recurso = CONCAT(N'ShopCart.Pago.', CONVERT(NVARCHAR(36), @ClaveIdempotencia));

        EXEC @Resultado = sp_getapplock @Resource = @Recurso, @LockMode = N'Exclusive',
                                        @LockOwner = N'Transaction', @LockTimeout = 15000;

        IF @Resultado < 0
            THROW 50021, N'Otra petición con la misma Idempotency-Key sigue en curso; reintenta en unos segundos.', 1;

        -- 3. ¿La clave ya se usó?
        SELECT @IDPedido = IDPedido, @IDUsuarioPedido = IDUsuario, @HuellaGuardada = HuellaSolicitud,
               @IDCuponPedido = IDCupon
        FROM dbo.Pedido
        WHERE ClaveIdempotencia = @ClaveIdempotencia;

        IF @IDPedido IS NOT NULL
        BEGIN
            IF @IDUsuarioPedido <> @IDUsuarioSolicitante
                THROW 50021, N'La Idempotency-Key ya se usó con otra solicitud.', 1;

            EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 0, @IDCarrito OUTPUT;

            IF @IDCarrito IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.CarritoDetalle WHERE IDCarrito = @IDCarrito)
            BEGIN
                SELECT @Lineas = STRING_AGG(CONCAT(cd.IDVariante, N'x', cd.Cantidad), N',') WITHIN GROUP (ORDER BY cd.IDVariante)
                FROM dbo.CarritoDetalle AS cd
                WHERE cd.IDCarrito = @IDCarrito;

                SELECT @IDCuponCarrito = IDCupon FROM dbo.Carrito WHERE IDCarrito = @IDCarrito;
            END
            ELSE
            BEGIN
                SELECT @Lineas = STRING_AGG(CONCAT(pd.IDVariante, N'x', pd.Cantidad), N',') WITHIN GROUP (ORDER BY pd.IDVariante)
                FROM dbo.PedidoDetalle AS pd
                WHERE pd.IDPedido = @IDPedido;

                SET @IDCuponCarrito = @IDCuponPedido;
            END;

            SET @Huella = CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONCAT(
                N'D=', @IDDireccion, N';E=', @IDMetodoEnvio, N';P=', @MetodoPago, N';T=', @UltimosTarjeta,
                N';C=', ISNULL(CONVERT(NVARCHAR(20), @IDCuponCarrito), N''), N';L=', @Lineas)), 2);

            IF @Huella <> @HuellaGuardada
                THROW 50021, N'La Idempotency-Key ya se usó con un carrito o unos datos de pago distintos.', 1;

            SET @Repetido = 1;
        END
        ELSE
        BEGIN
            -- 4. Dirección y método de envío
            SELECT @Direccion = LEFT(CONCAT(
                       d.NombreDestinatario, N', ', d.Linea1, ISNULL(N', ' + d.Linea2, N''), N', ', d.Municipio, N', ',
                       d.Departamento, ISNULL(N' ' + d.CodigoPostal, N''), N'. Tel: ', d.Telefono,
                       ISNULL(N'. Ref: ' + d.Referencias, N'')), 800)
            FROM dbo.Direccion AS d
            WHERE d.IDDireccion = @IDDireccion AND d.IDUsuario = @IDUsuarioSolicitante AND d.Activo = 1;

            IF @Direccion IS NULL
                THROW 50004, N'La dirección no existe.', 1;

            SELECT @CostoEnvio = Costo
            FROM dbo.MetodoEnvio
            WHERE IDMetodoEnvio = @IDMetodoEnvio AND Activo = 1;

            IF @CostoEnvio IS NULL
                THROW 50004, N'El método de envío no existe o no está disponible.', 1;

            -- 5. Bloquear el carrito, el cupón y las variantes (en ese orden)
            EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 1, @IDCarrito OUTPUT;

            IF @IDCarrito IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.CarritoDetalle WHERE IDCarrito = @IDCarrito)
                THROW 50031, N'No tienes una reserva vigente; inicia el pago de nuevo.', 1;

            SELECT @IDCuponCarrito = IDCupon FROM dbo.Carrito WHERE IDCarrito = @IDCarrito;

            IF @IDCuponCarrito IS NOT NULL
                SELECT @Bloqueada = IDCupon
                FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK)
                WHERE IDCupon = @IDCuponCarrito;

            INSERT INTO @Bloqueo (IDVariante)
            SELECT IDVariante FROM dbo.CarritoDetalle WHERE IDCarrito = @IDCarrito;

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

            -- 6. Reserva vigente que cubra exactamente el carrito
            IF NOT EXISTS (SELECT 1 FROM dbo.FU_Checkout_EstadoReserva(@IDCarrito) WHERE Vigente = 1)
                THROW 50031, N'Tu reserva venció o ya no coincide con tu carrito; inicia el pago de nuevo.', 1;

            -- 7. Líneas vendibles
            IF @IDCuponCarrito IS NOT NULL
            BEGIN
                SELECT @Error = CodigoError, @Mensaje = MensajeError
                FROM dbo.FU_Cupones_Validar(@IDCuponCarrito, @IDUsuarioSolicitante, @IDCarrito);

                IF @Error IS NOT NULL
                    THROW @Error, @Mensaje, 1;

                SET @IDCuponAplicado = @IDCuponCarrito;
            END;

            INSERT INTO @Linea (IDCarritoDetalle, IDVariante, Cantidad, PrecioUnitario, Importe, DescuentoLinea,
                                ImporteNeto, SKU, NombreProducto, DescripcionVariante, Vendible)
            SELECT f.IDCarritoDetalle, f.IDVariante, f.Cantidad, f.PrecioUnitario, f.Importe, f.DescuentoLinea,
                   f.ImporteNeto, v.SKU, p.Nombre, ISNULL(dv.Descripcion, N'Sin atributos'),
                   CONVERT(BIT, CASE WHEN v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END)
            FROM dbo.FU_Cupones_CalculoDescuento(@IDCarrito, @IDCuponAplicado) AS f
            INNER JOIN dbo.Variante AS v ON v.IDVariante = f.IDVariante
            INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
            INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
            OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(f.IDVariante) AS dv;

            IF EXISTS (SELECT 1 FROM @Linea WHERE Vendible = 0)
            BEGIN
                SELECT @Skus = STRING_AGG(SKU, N', ') WITHIN GROUP (ORDER BY IDVariante)
                FROM @Linea WHERE Vendible = 0;

                SET @Mensaje = CONCAT(N'Estos productos ya no están disponibles para la venta; quítalos del carrito: ',
                                      LEFT(@Skus, 1500), N'.');
                THROW 50001, @Mensaje, 1;
            END;

            IF EXISTS (
                SELECT 1 FROM @Linea AS l
                INNER JOIN dbo.Variante AS v ON v.IDVariante = l.IDVariante
                WHERE l.Cantidad > v.ExistenciaFisica
            )
                THROW 50030, N'La existencia física ya no alcanza para el pedido; inicia el pago de nuevo.', 1;

            -- 8. Montos (las mismas funciones que muestran el resumen)
            SELECT @Subtotal = Subtotal, @Descuento = Descuento, @CostoEnvio = CostoEnvio,
                   @Total = Total, @MontoIVA = MontoIVA
            FROM dbo.FU_Carrito_CalcularTotales(@IDCarrito, @CostoEnvio);

            -- 9. Pago simulado: se rechaza antes de escribir nada, la reserva sigue vigente
            IF @UltimosTarjeta = N'0000'
                THROW 50020, N'El pago fue rechazado por el emisor de la tarjeta.', 1;

            SELECT @Lineas = STRING_AGG(CONCAT(IDVariante, N'x', Cantidad), N',') WITHIN GROUP (ORDER BY IDVariante)
            FROM @Linea;

            SET @Huella = CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONCAT(
                N'D=', @IDDireccion, N';E=', @IDMetodoEnvio, N';P=', @MetodoPago, N';T=', @UltimosTarjeta,
                N';C=', ISNULL(CONVERT(NVARCHAR(20), @IDCuponCarrito), N''), N';L=', @Lineas)), 2);

            SELECT @IDEstadoPagado = IDEstadoPedido FROM dbo.EstadoPedido WHERE Codigo = N'PAGADO';

            SELECT @IDTipoVenta = IDTipoMovimientoInventario, @SignoVenta = Signo
            FROM dbo.TipoMovimientoInventario
            WHERE Codigo = N'SALIDA_VENTA';

            IF @IDEstadoPagado IS NULL OR @IDTipoVenta IS NULL
                THROW 50000, N'Faltan catálogos (estado PAGADO o tipo SALIDA_VENTA); ejecuta 085_datos_catalogos.sql.', 1;

            SET @Ahora = SYSUTCDATETIME();

            -- 10. Cupón: UPDATE condicional atómico del límite total
            IF @IDCuponAplicado IS NOT NULL
            BEGIN
                UPDATE dbo.Cupon
                SET UsosActuales = UsosActuales + 1
                WHERE IDCupon = @IDCuponAplicado
                  AND UsosActuales < LimiteUsosTotal;

                IF @@ROWCOUNT = 0
                    THROW 50064, N'El cupón ya alcanzó su límite de usos.', 1;
            END;

            -- 11. Pedido y detalle. El número definitivo necesita el IDPedido: se inserta con uno provisional
            --     derivado de la clave (único) y se completa enseguida, dentro de la misma transacción.
            INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                                    IDDireccion, IDMetodoEnvio, IDCupon, DireccionEntrega, Subtotal, Descuento,
                                    CostoEnvio, MontoIVA, Total, FechaCreacion)
            VALUES (LEFT(REPLACE(CONVERT(NVARCHAR(36), @ClaveIdempotencia), N'-', N''), 20), @ClaveIdempotencia,
                    @Huella, @IDUsuarioSolicitante, @IDEstadoPagado, @IDDireccion, @IDMetodoEnvio, @IDCuponAplicado,
                    @Direccion, @Subtotal, @Descuento, @CostoEnvio, @MontoIVA, @Total, @Ahora);

            SET @IDPedido = SCOPE_IDENTITY();

            SET @NumeroPedido = CONCAT(N'SC-', YEAR(@Ahora), N'-',
                CASE WHEN @IDPedido < 1000000 THEN RIGHT(CONCAT(N'000000', @IDPedido), 6)
                     ELSE CONVERT(NVARCHAR(10), @IDPedido) END);

            UPDATE dbo.Pedido SET NumeroPedido = @NumeroPedido WHERE IDPedido = @IDPedido;

            INSERT INTO dbo.PedidoDetalle (IDPedido, IDVariante, SKU, NombreProducto, DescripcionVariante, Cantidad,
                                           PrecioUnitario, DescuentoLinea, Subtotal)
            SELECT @IDPedido, IDVariante, SKU, NombreProducto, DescripcionVariante, Cantidad,
                   PrecioUnitario, DescuentoLinea, ImporteNeto
            FROM @Linea
            ORDER BY IDCarritoDetalle;

            -- 12. Kardex y saldos: baja la existencia física y la reservada en la misma cantidad
            INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario, IDPedido,
                                                  Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo, Fecha)
            SELECT l.IDVariante, @IDTipoVenta, @SignoVenta, @IDUsuarioSolicitante, @IDPedido,
                   l.Cantidad, v.ExistenciaFisica, v.ExistenciaFisica + @SignoVenta * l.Cantidad,
                   CONCAT(N'Venta del pedido ', @NumeroPedido), @Ahora
            FROM @Linea AS l
            INNER JOIN dbo.Variante AS v ON v.IDVariante = l.IDVariante
            ORDER BY l.IDVariante;

            UPDATE v
            SET ExistenciaFisica = v.ExistenciaFisica + @SignoVenta * l.Cantidad,
                ExistenciaReservada = v.ExistenciaReservada - l.Cantidad
            FROM dbo.Variante AS v
            INNER JOIN @Linea AS l ON l.IDVariante = v.IDVariante;

            UPDATE dbo.ReservaExistencia
            SET Estado = N'CONFIRMADA'
            WHERE IDCarrito = @IDCarrito
              AND Estado = N'ACTIVA';

            -- 13. Uso del cupón, pago, historial y carrito
            IF @IDCuponAplicado IS NOT NULL
                INSERT INTO dbo.UsoCupon (IDCupon, IDUsuario, IDPedido, Fecha)
                VALUES (@IDCuponAplicado, @IDUsuarioSolicitante, @IDPedido, @Ahora);

            INSERT INTO dbo.Pago (IDPedido, MetodoPago, Monto, Estado, ReferenciaTransaccion, Fecha)
            VALUES (@IDPedido, @MetodoPago, @Total, N'APROBADO',
                    CONCAT(N'SIM-', UPPER(REPLACE(CONVERT(NVARCHAR(36), NEWID()), N'-', N''))), @Ahora);

            INSERT INTO dbo.HistorialEstadoPedido (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario, Fecha)
            VALUES (@IDPedido, NULL, @IDEstadoPagado, @IDUsuarioSolicitante, N'Pedido creado y pago aprobado', @Ahora);

            -- Guardar la tarjeta (solo con el pago aprobado y la clave nueva). UPDLOCK, HOLDLOCK serializa dos
            -- pagos simultáneos del mismo cliente: no se duplica la tarjeta ni quedan dos predeterminadas.
            IF @GuardarTarjeta = 1
            BEGIN
                SELECT @IDTarjetaResultado = IDTarjetaGuardada
                FROM dbo.TarjetaGuardada WITH (UPDLOCK, HOLDLOCK)
                WHERE IDUsuario = @IDUsuarioSolicitante AND Marca = @MarcaTarjeta
                  AND Tipo = @TipoTarjeta AND Ultimos4 = @UltimosTarjeta;

                IF @IDTarjetaResultado IS NULL
                BEGIN
                    IF EXISTS (SELECT 1 FROM dbo.TarjetaGuardada WITH (UPDLOCK, HOLDLOCK) WHERE IDUsuario = @IDUsuarioSolicitante)
                        SET @Predeterminar = 0;
                    ELSE
                        SET @Predeterminar = 1;

                    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca, Predeterminada, FechaCreacion)
                    VALUES (@IDUsuarioSolicitante, @TitularTarjeta, @UltimosTarjeta, @TipoTarjeta, @MarcaTarjeta,
                            @Predeterminar, @Ahora);

                    SET @IDTarjetaResultado = SCOPE_IDENTITY();

                    SELECT @NuevaTarjeta = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDTarjetaResultado);

                    INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo, Fecha)
                    VALUES (@IDUsuarioSolicitante, N'Tarjetas', N'TarjetaGuardada', @IDTarjetaResultado, N'CREAR',
                            NULL, @NuevaTarjeta, @Ahora);
                END;
            END;

            UPDATE dbo.Carrito
            SET Estado = N'CONVERTIDO',
                FechaUltimaActividad = @Ahora
            WHERE IDCarrito = @IDCarrito;

            -- 14. Bitácora
            SELECT @Nuevo = Json FROM dbo.FU_Pedidos_PedidoJson(@IDPedido, 1);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo, Fecha)
            VALUES (@IDUsuarioSolicitante, N'Pedidos', N'Pedido', @IDPedido, N'CREAR', NULL, @Nuevo, @Ahora);
        END;

        COMMIT TRANSACTION;

        -- 15. Resultado
        SELECT
            p.IDPedido,
            p.NumeroPedido,
            ep.Codigo AS Estado,
            p.Total,
            @Repetido AS Repetido,
            @IDTarjetaResultado AS IDTarjetaGuardada
        FROM dbo.Pedido AS p
        INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
        WHERE p.IDPedido = @IDPedido;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Consultas de pedidos
   ========================================================= */

-- GET /api/pedidos: lista paginada. El Cliente solo ve sus pedidos (el filtro sale de @IDUsuarioSolicitante y
-- @IDCliente se ignora); Operador y Administrador ven todos. El rol se busca en la base.
--   @Estado    Codigo del estado (EstadoPedido); inexistente → 50001
--   @IDCliente solo personal
--   @Desde, @Hasta  instantes UTC inclusivos sobre FechaCreacion (el backend envía el final del día de "hasta");
--                   Desde > Hasta → 50001
--   @Texto     número de pedido (búsqueda parcial, comodines de LIKE escapados)
--   @Orden     fechaCreacion | total, con :asc o :desc. Default fechaCreacion:desc. Desempata por IDPedido en
--              la misma dirección.
-- Result sets: 1. filas de la página; 2. Total INT.
-- Fila: IDPedido INT, NumeroPedido NVARCHAR(20), IDUsuario INT, Cliente NVARCHAR(201), CorreoCliente NVARCHAR(150),
--   Estado NVARCHAR(30) (código), NombreEstado NVARCHAR(100), Subtotal, Descuento, CostoEnvio, Total (DECIMAL(12,2)),
--   CantidadLineas INT, CantidadUnidades INT, FechaCreacion DATETIME2(3).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_Listar
    @IDUsuarioSolicitante INT,
    @Estado               NVARCHAR(30)  = NULL,
    @IDCliente            INT           = NULL,
    @Desde                DATETIME2(3)  = NULL,
    @Hasta                DATETIME2(3)  = NULL,
    @Texto                NVARCHAR(50)  = NULL,
    @Pagina               INT           = 1,
    @TamanoPagina         INT           = 20,
    @Orden                NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Rol NVARCHAR(30), @IDEstado INT, @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'fechaCreacion:desc');
    SET @Estado = NULLIF(TRIM(@Estado), N'');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'fechaCreacion:asc', N'fechaCreacion:desc', N'total:asc', N'total:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden, N'. Usa fechaCreacion o total con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    IF @Desde IS NOT NULL AND @Hasta IS NOT NULL AND @Desde > @Hasta
        THROW 50001, N'La fecha inicial no puede ser posterior a la fecha final.', 1;

    SELECT @Rol = r.Nombre
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuarioSolicitante;

    IF @Rol IS NULL
        THROW 50004, N'El usuario solicitante no existe.', 1;

    IF @Estado IS NOT NULL
    BEGIN
        SELECT @IDEstado = IDEstadoPedido FROM dbo.EstadoPedido WHERE Codigo = @Estado;

        IF @IDEstado IS NULL
        BEGIN
            SET @Mensaje = CONCAT(N'El estado ', @Estado, N' no existe.');
            THROW 50001, @Mensaje, 1;
        END;
    END;

    IF @Rol = N'Cliente'
        SET @IDCliente = @IDUsuarioSolicitante;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDPedido      INT           NOT NULL PRIMARY KEY,
        FechaCreacion DATETIME2(3)  NOT NULL,
        Total         DECIMAL(12,2) NOT NULL
    );

    INSERT INTO @Fila (IDPedido, FechaCreacion, Total)
    SELECT p.IDPedido, p.FechaCreacion, p.Total
    FROM dbo.Pedido AS p
    WHERE (@IDCliente IS NULL OR p.IDUsuario = @IDCliente)
      AND (@IDEstado IS NULL OR p.IDEstadoPedido = @IDEstado)
      AND (@Desde IS NULL OR p.FechaCreacion >= @Desde)
      AND (@Hasta IS NULL OR p.FechaCreacion <= @Hasta)
      AND (@Patron IS NULL OR p.NumeroPedido LIKE @Patron)
    OPTION (RECOMPILE);

    SELECT
        p.IDPedido,
        p.NumeroPedido,
        p.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Cliente,
        u.Correo AS CorreoCliente,
        ep.Codigo AS Estado,
        ep.Nombre AS NombreEstado,
        p.Subtotal,
        p.Descuento,
        p.CostoEnvio,
        p.Total,
        l.CantidadLineas,
        l.CantidadUnidades,
        p.FechaCreacion
    FROM @Fila AS f
    INNER JOIN dbo.Pedido AS p ON p.IDPedido = f.IDPedido
    INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = p.IDUsuario
    OUTER APPLY (
        SELECT COUNT(*) AS CantidadLineas, ISNULL(SUM(d.Cantidad), 0) AS CantidadUnidades
        FROM dbo.PedidoDetalle AS d
        WHERE d.IDPedido = p.IDPedido
    ) AS l
    ORDER BY
        CASE WHEN @Orden = N'fechaCreacion:asc'  THEN f.FechaCreacion END ASC,
        CASE WHEN @Orden = N'fechaCreacion:asc'  THEN f.IDPedido      END ASC,
        CASE WHEN @Orden = N'fechaCreacion:desc' THEN f.FechaCreacion END DESC,
        CASE WHEN @Orden = N'fechaCreacion:desc' THEN f.IDPedido      END DESC,
        CASE WHEN @Orden = N'total:asc'          THEN f.Total         END ASC,
        CASE WHEN @Orden = N'total:asc'          THEN f.IDPedido      END ASC,
        CASE WHEN @Orden = N'total:desc'         THEN f.Total         END DESC,
        CASE WHEN @Orden = N'total:desc'         THEN f.IDPedido      END DESC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/pedidos/estados: estados del pedido y sus transiciones, para la interfaz. Dos result sets:
--   1. Estados (por IDEstadoPedido, que sigue el flujo): IDEstadoPedido INT, Codigo NVARCHAR(30),
--      Nombre NVARCHAR(100), EsFinal BIT
--   2. Transiciones (todas las de TransicionEstadoPedido): CodigoOrigen, CodigoDestino NVARCHAR(30),
--      Rol NVARCHAR(30), PermitidaParaSolicitante BIT (el rol del solicitante puede ejecutarla),
--      Via NVARCHAR(10): 'ESTADO' (PATCH /estado), 'CANCELAR' (POST /cancelar) o 'DEVOLUCION' (POST /devoluciones)
-- Solicitante inexistente → 50004.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarTransiciones
    @IDUsuarioSolicitante INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Rol NVARCHAR(30);

    SELECT @Rol = r.Nombre
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuarioSolicitante;

    IF @Rol IS NULL
        THROW 50004, N'El usuario solicitante no existe.', 1;

    SELECT IDEstadoPedido, Codigo, Nombre, EsFinal
    FROM dbo.EstadoPedido
    ORDER BY IDEstadoPedido;

    SELECT
        eo.Codigo AS CodigoOrigen,
        ed.Codigo AS CodigoDestino,
        r.Nombre  AS Rol,
        CONVERT(BIT, CASE WHEN r.Nombre = @Rol THEN 1 ELSE 0 END) AS PermitidaParaSolicitante,
        CASE ed.Codigo
            WHEN N'CANCELADO'        THEN N'CANCELAR'
            WHEN N'DEVUELTO_PARCIAL' THEN N'DEVOLUCION'
            WHEN N'DEVUELTO'         THEN N'DEVOLUCION'
            ELSE N'ESTADO'
        END AS Via
    FROM dbo.TransicionEstadoPedido AS t
    INNER JOIN dbo.EstadoPedido AS eo ON eo.IDEstadoPedido = t.IDEstadoOrigen
    INNER JOIN dbo.EstadoPedido AS ed ON ed.IDEstadoPedido = t.IDEstadoDestino
    INNER JOIN dbo.Rol AS r ON r.IDRol = t.IDRol
    ORDER BY eo.IDEstadoPedido, ed.IDEstadoPedido, r.IDRol;
END;
GO

-- GET /api/pedidos/:id: detalle del pedido. Un Cliente que pide el pedido de otro, o un pedido inexistente → 50004.
-- También es el resultado de SP_Pedidos_CambiarEstado y SP_Pedidos_Cancelar. Tres result sets:
--   1. Encabezado (una fila): IDPedido INT, NumeroPedido NVARCHAR(20), IDUsuario INT, Cliente NVARCHAR(201),
--      CorreoCliente NVARCHAR(150), Estado NVARCHAR(30) (código), NombreEstado NVARCHAR(100), EsFinal BIT,
--      IDDireccion INT, DireccionEntrega NVARCHAR(800) (copia al momento de la compra), IDMetodoEnvio INT,
--      MetodoEnvio NVARCHAR(100), DiasEstimados TINYINT, IDCupon INT NULL, CodigoCupon NVARCHAR(30) NULL,
--      Subtotal, Descuento, CostoEnvio, MontoIVA, Total, MontoReembolsado (DECIMAL(12,2)),
--      IDPago INT, MetodoPago NVARCHAR(20), MontoPago DECIMAL(12,2), EstadoPago NVARCHAR(20),
--      ReferenciaTransaccion NVARCHAR(100), FechaPago DATETIME2(3), FechaCreacion DATETIME2(3)
--   2. Líneas con precios congelados: IDPedidoDetalle INT, IDVariante INT, SKU NVARCHAR(50),
--      NombreProducto NVARCHAR(150), DescripcionVariante NVARCHAR(200), Cantidad INT, PrecioUnitario,
--      DescuentoLinea, Subtotal (DECIMAL(12,2)), CantidadDevuelta INT, CantidadDevolvible INT
--   3. Transiciones posibles desde el estado actual para el rol del solicitante: CodigoEstado NVARCHAR(30),
--      NombreEstado NVARCHAR(100), Via NVARCHAR(10) ('ESTADO' | 'CANCELAR' | 'DEVOLUCION', ver
--      SP_Pedidos_ListarTransiciones)
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerPorId
    @IDUsuarioSolicitante INT,
    @IDPedido             INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Rol NVARCHAR(30), @IDDuenio INT, @IDEstadoActual INT;

    SELECT @Rol = r.Nombre
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuarioSolicitante;

    IF @Rol IS NULL
        THROW 50004, N'El usuario solicitante no existe.', 1;

    SELECT @IDDuenio = IDUsuario, @IDEstadoActual = IDEstadoPedido
    FROM dbo.Pedido
    WHERE IDPedido = @IDPedido;

    IF @IDDuenio IS NULL OR (@Rol = N'Cliente' AND @IDDuenio <> @IDUsuarioSolicitante)
        THROW 50004, N'El pedido no existe.', 1;

    -- 1. Encabezado
    SELECT
        p.IDPedido,
        p.NumeroPedido,
        p.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Cliente,
        u.Correo AS CorreoCliente,
        ep.Codigo AS Estado,
        ep.Nombre AS NombreEstado,
        ep.EsFinal,
        p.IDDireccion,
        p.DireccionEntrega,
        p.IDMetodoEnvio,
        me.Nombre AS MetodoEnvio,
        me.DiasEstimados,
        p.IDCupon,
        cu.Codigo AS CodigoCupon,
        p.Subtotal,
        p.Descuento,
        p.CostoEnvio,
        p.MontoIVA,
        p.Total,
        CONVERT(DECIMAL(12,2), ISNULL(dv.Monto, 0)) AS MontoReembolsado,
        pg.IDPago,
        pg.MetodoPago,
        pg.Monto AS MontoPago,
        pg.Estado AS EstadoPago,
        pg.ReferenciaTransaccion,
        pg.Fecha AS FechaPago,
        p.FechaCreacion
    FROM dbo.Pedido AS p
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = p.IDUsuario
    INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
    INNER JOIN dbo.MetodoEnvio AS me ON me.IDMetodoEnvio = p.IDMetodoEnvio
    LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = p.IDCupon
    LEFT JOIN dbo.Pago AS pg ON pg.IDPedido = p.IDPedido
    OUTER APPLY (
        SELECT SUM(d.MontoReembolso) AS Monto
        FROM dbo.Devolucion AS d
        WHERE d.IDPedido = p.IDPedido
    ) AS dv
    WHERE p.IDPedido = @IDPedido;

    -- 2. Líneas
    SELECT
        d.IDPedidoDetalle,
        d.IDVariante,
        d.SKU,
        d.NombreProducto,
        d.DescripcionVariante,
        d.Cantidad,
        d.PrecioUnitario,
        d.DescuentoLinea,
        d.Subtotal,
        d.CantidadDevuelta,
        d.Cantidad - d.CantidadDevuelta AS CantidadDevolvible
    FROM dbo.PedidoDetalle AS d
    WHERE d.IDPedido = @IDPedido
    ORDER BY d.IDPedidoDetalle;

    -- 3. Transiciones posibles para el rol del solicitante
    SELECT
        ed.Codigo AS CodigoEstado,
        ed.Nombre AS NombreEstado,
        CASE ed.Codigo
            WHEN N'CANCELADO'        THEN N'CANCELAR'
            WHEN N'DEVUELTO_PARCIAL' THEN N'DEVOLUCION'
            WHEN N'DEVUELTO'         THEN N'DEVOLUCION'
            ELSE N'ESTADO'
        END AS Via
    FROM dbo.TransicionEstadoPedido AS t
    INNER JOIN dbo.EstadoPedido AS ed ON ed.IDEstadoPedido = t.IDEstadoDestino
    INNER JOIN dbo.Rol AS r ON r.IDRol = t.IDRol
    WHERE t.IDEstadoOrigen = @IDEstadoActual
      AND r.Nombre = @Rol
    ORDER BY ed.IDEstadoPedido;
END;
GO

-- GET /api/pedidos/:id/historial: cambios de estado del pedido, del más antiguo al más reciente (VW_Pedidos_Historial).
-- Pedido ajeno o inexistente → 50004. Una fila por cambio: IDHistorialEstadoPedido INT, IDPedido INT,
-- CodigoEstadoAnterior NVARCHAR(30) NULL, EstadoAnterior NVARCHAR(100) NULL, CodigoEstadoNuevo NVARCHAR(30),
-- EstadoNuevo NVARCHAR(100), IDUsuario INT, Usuario NVARCHAR(201), Comentario NVARCHAR(300) NULL, Fecha DATETIME2(3).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerHistorialEstados
    @IDUsuarioSolicitante INT,
    @IDPedido             INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Rol NVARCHAR(30), @IDDuenio INT;

    SELECT @Rol = r.Nombre
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuarioSolicitante;

    IF @Rol IS NULL
        THROW 50004, N'El usuario solicitante no existe.', 1;

    SELECT @IDDuenio = IDUsuario FROM dbo.Pedido WHERE IDPedido = @IDPedido;

    IF @IDDuenio IS NULL OR (@Rol = N'Cliente' AND @IDDuenio <> @IDUsuarioSolicitante)
        THROW 50004, N'El pedido no existe.', 1;

    SELECT
        IDHistorialEstadoPedido, IDPedido, CodigoEstadoAnterior, EstadoAnterior, CodigoEstadoNuevo,
        EstadoNuevo, IDUsuario, Usuario, Comentario, Fecha
    FROM dbo.VW_Pedidos_Historial
    WHERE IDPedido = @IDPedido
    ORDER BY Fecha, IDHistorialEstadoPedido;
END;
GO

-- GET /api/pedidos/:id/devoluciones: devoluciones del pedido con sus líneas. Pedido ajeno o inexistente → 50004.
-- Dos result sets:
--   1. Devoluciones (de la más antigua a la más reciente): IDDevolucion INT, IDPedido INT, Tipo NVARCHAR(10)
--      ('TOTAL' si dejó el pedido en DEVUELTO, 'PARCIAL'), Motivo NVARCHAR(300), MontoReembolso DECIMAL(12,2),
--      IDUsuario INT, Usuario NVARCHAR(201), Fecha DATETIME2(3)
--   2. Líneas: IDDevolucion INT, IDDevolucionDetalle INT, IDPedidoDetalle INT, SKU NVARCHAR(50),
--      NombreProducto NVARCHAR(150), DescripcionVariante NVARCHAR(200), Cantidad INT, MontoReembolso DECIMAL(12,2)
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarDevoluciones
    @IDUsuarioSolicitante INT,
    @IDPedido             INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Rol NVARCHAR(30), @IDDuenio INT;

    SELECT @Rol = r.Nombre
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuarioSolicitante;

    IF @Rol IS NULL
        THROW 50004, N'El usuario solicitante no existe.', 1;

    SELECT @IDDuenio = IDUsuario FROM dbo.Pedido WHERE IDPedido = @IDPedido;

    IF @IDDuenio IS NULL OR (@Rol = N'Cliente' AND @IDDuenio <> @IDUsuarioSolicitante)
        THROW 50004, N'El pedido no existe.', 1;

    SELECT
        d.IDDevolucion,
        d.IDPedido,
        d.Tipo,
        d.Motivo,
        d.MontoReembolso,
        d.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario,
        d.Fecha
    FROM dbo.Devolucion AS d
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = d.IDUsuario
    WHERE d.IDPedido = @IDPedido
    ORDER BY d.Fecha, d.IDDevolucion;

    SELECT
        dd.IDDevolucion,
        dd.IDDevolucionDetalle,
        dd.IDPedidoDetalle,
        pd.SKU,
        pd.NombreProducto,
        pd.DescripcionVariante,
        dd.Cantidad,
        dd.MontoReembolso
    FROM dbo.DevolucionDetalle AS dd
    INNER JOIN dbo.PedidoDetalle AS pd ON pd.IDPedidoDetalle = dd.IDPedidoDetalle
    INNER JOIN dbo.Devolucion AS d ON d.IDDevolucion = dd.IDDevolucion
    WHERE dd.IDPedido = @IDPedido
    ORDER BY d.Fecha, dd.IDDevolucion, dd.IDDevolucionDetalle;
END;
GO

/* =========================================================
   Ciclo de vida del pedido
   ========================================================= */

-- PATCH /api/pedidos/:id/estado: avanza el estado. Solo transiciones de TransicionEstadoPedido permitidas
-- para el rol del solicitante; cualquier otra, incluido el mismo estado en que ya está, → 50040 antes de escribir
-- (el trigger TR_Pedidos_ValidarTransicion es la última barrera). No sirve para cancelar ni para devolver:
-- CANCELADO es SP_Pedidos_Cancelar (reintegra existencia y cupón) y DEVUELTO_PARCIAL / DEVUELTO es
-- SP_Pedidos_RegistrarDevolucion (reintegra existencia por línea); pedirlos aquí → 50040 con ese aviso.
--   @CodigoEstado  Codigo del estado destino; inexistente → 50001
--   @Comentario    opcional, hasta 300 caracteres; vacío = NULL
-- Pedido inexistente (o ajeno para un Cliente) → 50004. Bloquea el pedido con UPDLOCK, ROWLOCK y lee el estado
-- ya bloqueado: dos cambios simultáneos se serializan y el segundo ve el estado nuevo.
-- Escribe HistorialEstadoPedido (a nombre del solicitante) y bitácora MODIFICAR del pedido.
-- Resultado: SP_Pedidos_ObtenerPorId (tres result sets).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDPedido             INT,
    @CodigoEstado         NVARCHAR(30),
    @Comentario           NVARCHAR(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3);
    DECLARE @Rol NVARCHAR(30), @IDDuenio INT;
    DECLARE @IDEstadoActual INT, @CodigoActual NVARCHAR(30), @IDEstadoDestino INT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX), @Mensaje NVARCHAR(2048);

    SET @CodigoEstado = NULLIF(TRIM(@CodigoEstado), N'');
    SET @Comentario = NULLIF(TRIM(@Comentario), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @CodigoEstado IS NULL
            THROW 50001, N'El estado es obligatorio.', 1;

        SELECT @IDEstadoDestino = IDEstadoPedido FROM dbo.EstadoPedido WHERE Codigo = @CodigoEstado;

        IF @IDEstadoDestino IS NULL
        BEGIN
            SET @Mensaje = CONCAT(N'El estado ', LEFT(@CodigoEstado, 30), N' no existe.');
            THROW 50001, @Mensaje, 1;
        END;

        SELECT @Rol = r.Nombre
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuarioSolicitante;

        -- 2. Bloquear el pedido y leer su estado
        SELECT @IDDuenio = p.IDUsuario, @IDEstadoActual = p.IDEstadoPedido
        FROM dbo.Pedido AS p WITH (UPDLOCK, ROWLOCK)
        WHERE p.IDPedido = @IDPedido;

        IF @IDDuenio IS NULL OR (@Rol = N'Cliente' AND @IDDuenio <> @IDUsuarioSolicitante)
            THROW 50004, N'El pedido no existe.', 1;

        SELECT @CodigoActual = Codigo FROM dbo.EstadoPedido WHERE IDEstadoPedido = @IDEstadoActual;

        IF @CodigoEstado = N'CANCELADO'
        BEGIN
            SET @Mensaje = N'Para cancelar un pedido usa la cancelación: reintegra la existencia y libera el cupón.';
            THROW 50040, @Mensaje, 1;
        END;

        IF @CodigoEstado IN (N'DEVUELTO_PARCIAL', N'DEVUELTO')
        BEGIN
            SET @Mensaje = N'Las devoluciones se registran por línea con el registro de devoluciones; el estado se actualiza solo.';
            THROW 50040, @Mensaje, 1;
        END;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.TransicionEstadoPedido AS t
            INNER JOIN dbo.Rol AS r ON r.IDRol = t.IDRol
            WHERE t.IDEstadoOrigen = @IDEstadoActual
              AND t.IDEstadoDestino = @IDEstadoDestino
              AND r.Nombre = @Rol
        )
        BEGIN
            SET @Mensaje = CASE
                WHEN @IDEstadoActual = @IDEstadoDestino
                    THEN CONCAT(N'El pedido ya está en estado ', @CodigoActual, N'.')
                ELSE CONCAT(N'Un pedido en estado ', @CodigoActual, N' no puede pasar a ', @CodigoEstado, N'.')
            END;
            THROW 50040, @Mensaje, 1;
        END;

        SELECT @Anterior = Json FROM dbo.FU_Pedidos_PedidoJson(@IDPedido, 0);

        -- 3. Escribir
        SET @Ahora = SYSUTCDATETIME();

        UPDATE dbo.Pedido
        SET IDEstadoPedido = @IDEstadoDestino
        WHERE IDPedido = @IDPedido;

        INSERT INTO dbo.HistorialEstadoPedido (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario, Fecha)
        VALUES (@IDPedido, @IDEstadoActual, @IDEstadoDestino, @IDUsuarioSolicitante, @Comentario, @Ahora);

        -- 4. Bitácora
        SELECT @Nuevo = Json FROM dbo.FU_Pedidos_PedidoJson(@IDPedido, 0);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo, Fecha)
        VALUES (@IDUsuarioSolicitante, N'Pedidos', N'Pedido', @IDPedido, N'MODIFICAR', @Anterior, @Nuevo, @Ahora);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Pedidos_ObtenerPorId @IDUsuarioSolicitante = @IDUsuarioSolicitante, @IDPedido = @IDPedido;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/pedidos/:id/cancelar: cancela un pedido que aún no se despachó.
--   @Motivo  opcional, hasta 300 caracteres; queda como comentario del historial
-- El Cliente solo cancela el suyo (el ajeno o inexistente → 50004). La cancelación debe estar permitida al rol
-- del solicitante en TransicionEstadoPedido desde el estado actual (PAGADO o EN_PREPARACION); si no (despachado,
-- entregado, ya cancelado…) → 50040.
-- Bloquea Pedido → Cupon → Variante (en orden de IDVariante). En la misma transacción:
--   · kardex CANCELACION (+1) por línea con lo no devuelto (Cantidad - CantidadDevuelta) y sube ExistenciaFisica;
--   · si el pedido usó cupón: borra su UsoCupon y baja Cupon.UsosActuales (Pedido.IDCupon se conserva como dato
--     histórico del descuento);
--   · Pago.Estado = 'REEMBOLSADO' (la cancelación devuelve el cobro completo; el pago es simulado);
--   · HistorialEstadoPedido y bitácora MODIFICAR del pedido (ValorAnterior / ValorNuevo con el estado y el pago).
-- Resultado: SP_Pedidos_ObtenerPorId (tres result sets).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_Cancelar
    @IDUsuarioSolicitante INT,
    @IDPedido             INT,
    @Motivo               NVARCHAR(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3);
    DECLARE @Rol NVARCHAR(30), @IDDuenio INT, @IDCupon INT, @NumeroPedido NVARCHAR(20);
    DECLARE @IDEstadoActual INT, @CodigoActual NVARCHAR(30), @IDCancelado INT;
    DECLARE @IDTipo INT, @Signo SMALLINT;
    DECLARE @IDVariante INT, @Bloqueada INT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX), @Mensaje NVARCHAR(2048);
    DECLARE @Bloqueo TABLE (IDVariante INT NOT NULL PRIMARY KEY);

    SET @Motivo = NULLIF(TRIM(@Motivo), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SELECT @Rol = r.Nombre
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuarioSolicitante;

        SELECT @IDCancelado = IDEstadoPedido FROM dbo.EstadoPedido WHERE Codigo = N'CANCELADO';

        SELECT @IDTipo = IDTipoMovimientoInventario, @Signo = Signo
        FROM dbo.TipoMovimientoInventario
        WHERE Codigo = N'CANCELACION';

        IF @IDCancelado IS NULL OR @IDTipo IS NULL
            THROW 50000, N'Faltan catálogos (estado CANCELADO o tipo CANCELACION); ejecuta 085_datos_catalogos.sql.', 1;

        -- 2. Bloquear el pedido y comprobar que el rol puede cancelarlo en su estado actual
        SELECT @IDDuenio = p.IDUsuario, @IDEstadoActual = p.IDEstadoPedido, @IDCupon = p.IDCupon,
               @NumeroPedido = p.NumeroPedido
        FROM dbo.Pedido AS p WITH (UPDLOCK, ROWLOCK)
        WHERE p.IDPedido = @IDPedido;

        IF @IDDuenio IS NULL OR (@Rol = N'Cliente' AND @IDDuenio <> @IDUsuarioSolicitante)
            THROW 50004, N'El pedido no existe.', 1;

        SELECT @CodigoActual = Codigo FROM dbo.EstadoPedido WHERE IDEstadoPedido = @IDEstadoActual;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.TransicionEstadoPedido AS t
            INNER JOIN dbo.Rol AS r ON r.IDRol = t.IDRol
            WHERE t.IDEstadoOrigen = @IDEstadoActual
              AND t.IDEstadoDestino = @IDCancelado
              AND r.Nombre = @Rol
        )
        BEGIN
            SET @Mensaje = CONCAT(N'Un pedido en estado ', @CodigoActual, N' no puede cancelarse.');
            THROW 50040, @Mensaje, 1;
        END;

        SELECT @Anterior = Json FROM dbo.FU_Pedidos_PedidoJson(@IDPedido, 1);

        -- 3. Bloquear el cupón y las variantes (en ese orden)
        IF @IDCupon IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.UsoCupon WHERE IDPedido = @IDPedido)
            SELECT @Bloqueada = IDCupon
            FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK)
            WHERE IDCupon = @IDCupon;

        INSERT INTO @Bloqueo (IDVariante)
        SELECT DISTINCT IDVariante FROM dbo.PedidoDetalle WHERE IDPedido = @IDPedido;

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

        -- 4. Escribir
        SET @Ahora = SYSUTCDATETIME();

        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario, IDPedido,
                                              Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo, Fecha)
        SELECT d.IDVariante, @IDTipo, @Signo, @IDUsuarioSolicitante, @IDPedido,
               d.Cantidad - d.CantidadDevuelta, v.ExistenciaFisica,
               v.ExistenciaFisica + @Signo * (d.Cantidad - d.CantidadDevuelta),
               CONCAT(N'Cancelación del pedido ', @NumeroPedido), @Ahora
        FROM dbo.PedidoDetalle AS d
        INNER JOIN dbo.Variante AS v ON v.IDVariante = d.IDVariante
        WHERE d.IDPedido = @IDPedido
          AND d.Cantidad > d.CantidadDevuelta
        ORDER BY d.IDVariante;

        UPDATE v
        SET ExistenciaFisica = v.ExistenciaFisica + @Signo * (d.Cantidad - d.CantidadDevuelta)
        FROM dbo.Variante AS v
        INNER JOIN dbo.PedidoDetalle AS d ON d.IDVariante = v.IDVariante
        WHERE d.IDPedido = @IDPedido
          AND d.Cantidad > d.CantidadDevuelta;

        IF @IDCupon IS NOT NULL
        BEGIN
            DELETE FROM dbo.UsoCupon WHERE IDPedido = @IDPedido;

            IF @@ROWCOUNT > 0
                UPDATE dbo.Cupon
                SET UsosActuales = UsosActuales - 1
                WHERE IDCupon = @IDCupon
                  AND UsosActuales > 0;
        END;

        UPDATE dbo.Pago
        SET Estado = N'REEMBOLSADO'
        WHERE IDPedido = @IDPedido;

        UPDATE dbo.Pedido
        SET IDEstadoPedido = @IDCancelado
        WHERE IDPedido = @IDPedido;

        INSERT INTO dbo.HistorialEstadoPedido (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario, Fecha)
        VALUES (@IDPedido, @IDEstadoActual, @IDCancelado, @IDUsuarioSolicitante,
                ISNULL(@Motivo, N'Pedido cancelado'), @Ahora);

        -- 5. Bitácora
        SELECT @Nuevo = Json FROM dbo.FU_Pedidos_PedidoJson(@IDPedido, 1);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo, Fecha)
        VALUES (@IDUsuarioSolicitante, N'Pedidos', N'Pedido', @IDPedido, N'MODIFICAR', @Anterior, @Nuevo, @Ahora);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Pedidos_ObtenerPorId @IDUsuarioSolicitante = @IDUsuarioSolicitante, @IDPedido = @IDPedido;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/pedidos/:id/devoluciones: devolución total o parcial por línea.
--   @Motivo   obligatorio, hasta 300 caracteres
--   @Lineas   arreglo JSON [{ "idPedidoDetalle": n, "cantidad": n }]; vacío, JSON inválido, valores que no sean
--             enteros > 0, una línea repetida o que no es de este pedido → 50001
-- Solo Operador o Administrador: el rol debe tener la transición ENTREGADO → DEVUELTO_PARCIAL en
-- TransicionEstadoPedido (un Cliente recibe 50004 si el pedido no es suyo y 50040 si lo es). El pedido debe estar
-- ENTREGADO o DEVUELTO_PARCIAL; si no → 50040. Pedido inexistente → 50004. Una cantidad mayor a lo vendido menos lo
-- ya devuelto → 50041 (nombra la línea).
-- Bloquea Pedido → PedidoDetalle (las líneas devueltas) → Variante (en orden de IDVariante). En la misma transacción:
--   · Devolucion y DevolucionDetalle; Tipo = 'TOTAL' si tras la devolución no queda nada por devolver (el pedido pasa a
--     DEVUELTO) y 'PARCIAL' si queda algo;
--   · MontoReembolso de cada línea = Cantidad * PedidoDetalle.Subtotal / PedidoDetalle.Cantidad redondeado a 2
--     decimales (descuento incluido); la devolución que completa la línea recibe lo que falta para llegar a
--     PedidoDetalle.Subtotal. La del encabezado es la suma de sus líneas. El envío no se reembolsa;
--   · kardex DEVOLUCION (+1) por línea (con IDDevolucion e IDPedido) y sube ExistenciaFisica;
--   · PedidoDetalle.CantidadDevuelta += cantidad;
--   · estado: ENTREGADO → DEVUELTO_PARCIAL o DEVUELTO; DEVUELTO_PARCIAL → DEVUELTO si ya no queda nada; otra parcial
--     sobre DEVUELTO_PARCIAL no cambia el estado ni escribe historial. Cuando cambia, escribe HistorialEstadoPedido;
--   · Pago.Estado = 'REEMBOLSADO_PARCIAL' o, si el pedido quedó DEVUELTO, 'REEMBOLSADO';
--   · bitácora MODIFICAR del pedido (siempre, incluso sin cambio de estado).
-- Resultado (una fila): IDDevolucion INT, IDPedido INT, Tipo NVARCHAR(10), MontoReembolso DECIMAL(12,2),
-- Motivo NVARCHAR(300), EstadoPedido NVARCHAR(30) (código resultante), Fecha DATETIME2(3).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_RegistrarDevolucion
    @IDUsuarioSolicitante INT,
    @IDPedido             INT,
    @Motivo               NVARCHAR(300),
    @Lineas               NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3);
    DECLARE @Rol NVARCHAR(30), @IDDuenio INT;
    DECLARE @IDEstadoActual INT, @CodigoActual NVARCHAR(30), @IDEstadoNuevo INT, @CodigoNuevo NVARCHAR(30);
    DECLARE @IDTipo INT, @Signo SMALLINT, @NumeroPedido NVARCHAR(20);
    DECLARE @IDVariante INT, @Bloqueada INT;
    DECLARE @Tipo NVARCHAR(10), @Pendiente INT, @Monto DECIMAL(12,2), @IDDevolucion INT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX), @Mensaje NVARCHAR(2048);
    DECLARE @Linea TABLE (IDPedidoDetalle INT NULL, Cantidad INT NULL);
    DECLARE @Bloqueo TABLE (IDVariante INT NOT NULL PRIMARY KEY);
    DECLARE @Det TABLE (
        IDPedidoDetalle  INT           NOT NULL PRIMARY KEY,
        IDVariante       INT           NOT NULL,
        SKU              NVARCHAR(50)  NOT NULL,
        Vendida          INT           NOT NULL,
        YaDevuelta       INT           NOT NULL,
        Devolver         INT           NOT NULL,
        SubtotalLinea    DECIMAL(12,2) NOT NULL,
        YaReembolsado    DECIMAL(12,2) NOT NULL,
        Monto            DECIMAL(12,2) NULL
    );

    SET @Motivo = NULLIF(TRIM(@Motivo), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar el cuerpo de la petición
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Motivo IS NULL
            THROW 50001, N'El motivo de la devolución es obligatorio.', 1;

        IF @Lineas IS NULL OR ISJSON(@Lineas) = 0 OR LEFT(LTRIM(@Lineas), 1) <> N'['
            THROW 50001, N'Las líneas deben ser un arreglo JSON de { idPedidoDetalle, cantidad }.', 1;

        INSERT INTO @Linea (IDPedidoDetalle, Cantidad)
        SELECT TRY_CONVERT(INT, CASE WHEN j.[type] = 5 THEN JSON_VALUE(j.value, N'$.idPedidoDetalle') END),
               TRY_CONVERT(INT, CASE WHEN j.[type] = 5 THEN JSON_VALUE(j.value, N'$.cantidad') END)
        FROM OPENJSON(@Lineas) AS j;

        IF NOT EXISTS (SELECT 1 FROM @Linea)
            THROW 50001, N'La devolución debe incluir al menos una línea.', 1;

        IF EXISTS (SELECT 1 FROM @Linea WHERE IDPedidoDetalle IS NULL OR IDPedidoDetalle <= 0 OR Cantidad IS NULL OR Cantidad <= 0)
            THROW 50001, N'Cada línea necesita un idPedidoDetalle y una cantidad enteros mayores que 0.', 1;

        IF EXISTS (SELECT 1 FROM @Linea GROUP BY IDPedidoDetalle HAVING COUNT(*) > 1)
            THROW 50001, N'Una línea del pedido solo puede aparecer una vez en la devolución.', 1;

        -- 2. Bloquear el pedido, comprobar su estado y el rol
        SELECT @Rol = r.Nombre
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuarioSolicitante;

        SELECT @IDDuenio = p.IDUsuario, @IDEstadoActual = p.IDEstadoPedido, @NumeroPedido = p.NumeroPedido
        FROM dbo.Pedido AS p WITH (UPDLOCK, ROWLOCK)
        WHERE p.IDPedido = @IDPedido;

        IF @IDDuenio IS NULL OR (@Rol = N'Cliente' AND @IDDuenio <> @IDUsuarioSolicitante)
            THROW 50004, N'El pedido no existe.', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.TransicionEstadoPedido AS t
            INNER JOIN dbo.Rol AS r ON r.IDRol = t.IDRol
            INNER JOIN dbo.EstadoPedido AS eo ON eo.IDEstadoPedido = t.IDEstadoOrigen
            INNER JOIN dbo.EstadoPedido AS ed ON ed.IDEstadoPedido = t.IDEstadoDestino
            WHERE eo.Codigo = N'ENTREGADO'
              AND ed.Codigo = N'DEVUELTO_PARCIAL'
              AND r.Nombre = @Rol
        )
            THROW 50040, N'Tu rol no puede registrar devoluciones.', 1;

        SELECT @CodigoActual = Codigo FROM dbo.EstadoPedido WHERE IDEstadoPedido = @IDEstadoActual;

        IF @CodigoActual NOT IN (N'ENTREGADO', N'DEVUELTO_PARCIAL')
        BEGIN
            SET @Mensaje = CONCAT(N'Solo se pueden devolver pedidos entregados; el pedido está en estado ', @CodigoActual, N'.');
            THROW 50040, @Mensaje, 1;
        END;

        SELECT @IDTipo = IDTipoMovimientoInventario, @Signo = Signo
        FROM dbo.TipoMovimientoInventario
        WHERE Codigo = N'DEVOLUCION';

        IF @IDTipo IS NULL
            THROW 50000, N'No existe el tipo de movimiento DEVOLUCION; ejecuta 085_datos_catalogos.sql.', 1;

        -- 3. Las líneas son del pedido; bloquearlas y comparar con lo ya devuelto
        IF EXISTS (
            SELECT 1 FROM @Linea AS l
            WHERE NOT EXISTS (
                SELECT 1 FROM dbo.PedidoDetalle AS pd
                WHERE pd.IDPedidoDetalle = l.IDPedidoDetalle AND pd.IDPedido = @IDPedido
            )
        )
            THROW 50001, N'Una de las líneas no pertenece a este pedido.', 1;

        INSERT INTO @Det (IDPedidoDetalle, IDVariante, SKU, Vendida, YaDevuelta, Devolver, SubtotalLinea, YaReembolsado)
        SELECT pd.IDPedidoDetalle, pd.IDVariante, pd.SKU, pd.Cantidad, pd.CantidadDevuelta, l.Cantidad, pd.Subtotal,
               ISNULL((SELECT SUM(dd.MontoReembolso) FROM dbo.DevolucionDetalle AS dd
                       WHERE dd.IDPedidoDetalle = pd.IDPedidoDetalle), 0)
        FROM dbo.PedidoDetalle AS pd WITH (UPDLOCK, ROWLOCK)
        INNER JOIN @Linea AS l ON l.IDPedidoDetalle = pd.IDPedidoDetalle
        WHERE pd.IDPedido = @IDPedido;

        SELECT TOP (1) @Mensaje = CONCAT(N'No puedes devolver ', Devolver, N' de ', SKU, N': se vendieron ', Vendida,
                                         N' y ya se devolvieron ', YaDevuelta, N'.')
        FROM @Det
        WHERE Devolver > Vendida - YaDevuelta
        ORDER BY IDPedidoDetalle;

        IF @@ROWCOUNT > 0
            THROW 50041, @Mensaje, 1;

        -- 4. Bloquear las variantes en orden de IDVariante
        INSERT INTO @Bloqueo (IDVariante)
        SELECT DISTINCT IDVariante FROM @Det;

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

        -- 5. Montos y tipo de la devolución
        UPDATE @Det
        SET Monto = CASE
            WHEN YaDevuelta + Devolver = Vendida THEN SubtotalLinea - YaReembolsado
            WHEN CONVERT(DECIMAL(12,2), ROUND(CONVERT(DECIMAL(18,6), Devolver) * SubtotalLinea / Vendida, 2))
                 > SubtotalLinea - YaReembolsado THEN SubtotalLinea - YaReembolsado
            ELSE CONVERT(DECIMAL(12,2), ROUND(CONVERT(DECIMAL(18,6), Devolver) * SubtotalLinea / Vendida, 2))
        END;

        SELECT @Monto = SUM(Monto) FROM @Det;

        SELECT @Pendiente = SUM(pd.Cantidad - pd.CantidadDevuelta) - (SELECT SUM(Devolver) FROM @Det)
        FROM dbo.PedidoDetalle AS pd
        WHERE pd.IDPedido = @IDPedido;

        SET @Tipo = CASE WHEN @Pendiente = 0 THEN N'TOTAL' ELSE N'PARCIAL' END;

        SET @CodigoNuevo = CASE
            WHEN @Pendiente = 0 THEN N'DEVUELTO'
            WHEN @CodigoActual = N'ENTREGADO' THEN N'DEVUELTO_PARCIAL'
            ELSE @CodigoActual
        END;

        SELECT @IDEstadoNuevo = IDEstadoPedido FROM dbo.EstadoPedido WHERE Codigo = @CodigoNuevo;

        SELECT @Anterior = Json FROM dbo.FU_Pedidos_PedidoJson(@IDPedido, 1);

        -- 6. Escribir
        SET @Ahora = SYSUTCDATETIME();

        INSERT INTO dbo.Devolucion (IDPedido, IDUsuario, Tipo, Motivo, MontoReembolso, Fecha)
        VALUES (@IDPedido, @IDUsuarioSolicitante, @Tipo, @Motivo, @Monto, @Ahora);

        SET @IDDevolucion = SCOPE_IDENTITY();

        INSERT INTO dbo.DevolucionDetalle (IDDevolucion, IDPedido, IDPedidoDetalle, Cantidad, MontoReembolso)
        SELECT @IDDevolucion, @IDPedido, IDPedidoDetalle, Devolver, Monto
        FROM @Det
        ORDER BY IDPedidoDetalle;

        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario, IDPedido,
                                              IDDevolucion, Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo, Fecha)
        SELECT d.IDVariante, @IDTipo, @Signo, @IDUsuarioSolicitante, @IDPedido, @IDDevolucion,
               d.Devolver, v.ExistenciaFisica, v.ExistenciaFisica + @Signo * d.Devolver,
               LEFT(CONCAT(N'Devolución del pedido ', @NumeroPedido, N': ', @Motivo), 300), @Ahora
        FROM @Det AS d
        INNER JOIN dbo.Variante AS v ON v.IDVariante = d.IDVariante
        ORDER BY d.IDVariante;

        UPDATE v
        SET ExistenciaFisica = v.ExistenciaFisica + @Signo * d.Devolver
        FROM dbo.Variante AS v
        INNER JOIN @Det AS d ON d.IDVariante = v.IDVariante;

        UPDATE pd
        SET CantidadDevuelta = pd.CantidadDevuelta + d.Devolver
        FROM dbo.PedidoDetalle AS pd
        INNER JOIN @Det AS d ON d.IDPedidoDetalle = pd.IDPedidoDetalle;

        UPDATE dbo.Pago
        SET Estado = CASE WHEN @CodigoNuevo = N'DEVUELTO' THEN N'REEMBOLSADO' ELSE N'REEMBOLSADO_PARCIAL' END
        WHERE IDPedido = @IDPedido;

        IF @IDEstadoNuevo <> @IDEstadoActual
        BEGIN
            UPDATE dbo.Pedido
            SET IDEstadoPedido = @IDEstadoNuevo
            WHERE IDPedido = @IDPedido;

            INSERT INTO dbo.HistorialEstadoPedido (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario, Fecha)
            VALUES (@IDPedido, @IDEstadoActual, @IDEstadoNuevo, @IDUsuarioSolicitante,
                    LEFT(CONCAT(N'Devolución registrada: ', @Motivo), 300), @Ahora);
        END;

        -- 7. Bitácora
        SELECT @Nuevo = Json FROM dbo.FU_Pedidos_PedidoJson(@IDPedido, 1);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo, Fecha)
        VALUES (@IDUsuarioSolicitante, N'Pedidos', N'Pedido', @IDPedido, N'MODIFICAR', @Anterior, @Nuevo, @Ahora);

        COMMIT TRANSACTION;

        SELECT
            d.IDDevolucion,
            d.IDPedido,
            d.Tipo,
            d.MontoReembolso,
            d.Motivo,
            ep.Codigo AS EstadoPedido,
            d.Fecha
        FROM dbo.Devolucion AS d
        INNER JOIN dbo.Pedido AS p ON p.IDPedido = d.IDPedido
        INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
        WHERE d.IDDevolucion = @IDDevolucion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ===== 013_sp_reportes.sql =====
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

-- ===== 014_sp_bitacora.sql =====
/*
    014_sp_bitacora.sql
    Stored procedures de bitácora, configuración y sistema.

    Errores: 50001 VALIDACION, 50004 NO_ENCONTRADO y 50012 USUARIO_INACTIVO (solicitante desactivado).
    La bitácora es de solo lectura desde la API; la escriben los SPs de cada módulo.

    Sin objetos pendientes en este archivo.
    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Bitácora
   ========================================================= */

-- GET /api/bitacora: lista paginada (Admin), con el nombre y el correo del usuario que hizo el cambio.
--   @Modulo, @Entidad, @Accion  coincidencia exacta (CI_AI)
--   @IDRegistro, @IDUsuario     el ID del registro modificado y el del usuario que lo modificó
--   @Desde, @Hasta              UTC, ambos inclusivos; @Desde > @Hasta → 50001
--   @Orden                      fecha | modulo | entidad | accion, con :asc o :desc
--                               (por defecto fecha:desc; desempata por IDBitacora en el mismo sentido)
-- Los filtros van contra las columnas de Bitacora con sus índices; no se copia la tabla.
-- ValorAnterior y ValorNuevo son JSON (NVARCHAR(MAX)) o NULL.
CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_Listar
    @Modulo       NVARCHAR(50)  = NULL,
    @Entidad      NVARCHAR(50)  = NULL,
    @IDRegistro   INT           = NULL,
    @IDUsuario    INT           = NULL,
    @Accion       NVARCHAR(20)  = NULL,
    @Desde        DATETIME2(3)  = NULL,
    @Hasta        DATETIME2(3)  = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Mensaje NVARCHAR(2048);

    SET @Modulo  = NULLIF(TRIM(@Modulo), N'');
    SET @Entidad = NULLIF(TRIM(@Entidad), N'');
    SET @Accion  = NULLIF(TRIM(@Accion), N'');
    SET @Orden   = ISNULL(NULLIF(TRIM(@Orden), N''), N'fecha:desc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'fecha:asc', N'fecha:desc', N'modulo:asc', N'modulo:desc',
                      N'entidad:asc', N'entidad:desc', N'accion:asc', N'accion:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa fecha, modulo, entidad o accion con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    IF @Desde IS NOT NULL AND @Hasta IS NOT NULL AND @Desde > @Hasta
        THROW 50001, N'La fecha inicial no puede ser posterior a la final.', 1;

    SELECT
        b.IDBitacora,
        b.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario,
        u.Correo                           AS CorreoUsuario,
        b.Modulo,
        b.Entidad,
        b.IDRegistro,
        b.Accion,
        b.ValorAnterior,
        b.ValorNuevo,
        b.Fecha
    FROM dbo.Bitacora AS b
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = b.IDUsuario
    WHERE (@Modulo     IS NULL OR b.Modulo     = @Modulo)
      AND (@Entidad    IS NULL OR b.Entidad    = @Entidad)
      AND (@IDRegistro IS NULL OR b.IDRegistro = @IDRegistro)
      AND (@IDUsuario  IS NULL OR b.IDUsuario  = @IDUsuario)
      AND (@Accion     IS NULL OR b.Accion     = @Accion)
      AND (@Desde      IS NULL OR b.Fecha     >= @Desde)
      AND (@Hasta      IS NULL OR b.Fecha     <= @Hasta)
    ORDER BY
        CASE WHEN @Orden = N'fecha:asc'    THEN b.Fecha      END ASC,
        CASE WHEN @Orden = N'fecha:desc'   THEN b.Fecha      END DESC,
        CASE WHEN @Orden = N'modulo:asc'   THEN b.Modulo     END ASC,
        CASE WHEN @Orden = N'modulo:desc'  THEN b.Modulo     END DESC,
        CASE WHEN @Orden = N'entidad:asc'  THEN b.Entidad    END ASC,
        CASE WHEN @Orden = N'entidad:desc' THEN b.Entidad    END DESC,
        CASE WHEN @Orden = N'accion:asc'   THEN b.Accion     END ASC,
        CASE WHEN @Orden = N'accion:desc'  THEN b.Accion     END DESC,
        CASE WHEN @Orden LIKE N'%:desc'    THEN b.IDBitacora END DESC,
        b.IDBitacora ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);

    SELECT COUNT_BIG(*) AS Total
    FROM dbo.Bitacora AS b
    WHERE (@Modulo     IS NULL OR b.Modulo     = @Modulo)
      AND (@Entidad    IS NULL OR b.Entidad    = @Entidad)
      AND (@IDRegistro IS NULL OR b.IDRegistro = @IDRegistro)
      AND (@IDUsuario  IS NULL OR b.IDUsuario  = @IDUsuario)
      AND (@Accion     IS NULL OR b.Accion     = @Accion)
      AND (@Desde      IS NULL OR b.Fecha     >= @Desde)
      AND (@Hasta      IS NULL OR b.Fecha     <= @Hasta)
    OPTION (RECOMPILE);
END;
GO

-- GET /api/bitacora/modulos: módulos que ya tienen registros, en orden alfabético (filtro del
-- frontend). Un resultado: Modulo NVARCHAR(50).
CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_ListarModulos
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT Modulo
    FROM dbo.Bitacora
    ORDER BY Modulo;
END;
GO

/* =========================================================
   Configuración
   ========================================================= */

-- GET /api/configuracion: todos los parámetros, ordenados por clave.
CREATE OR ALTER PROCEDURE dbo.SP_Configuracion_Listar
AS
BEGIN
    SET NOCOUNT ON;

    SELECT IDConfiguracion, Clave, Valor, Descripcion
    FROM dbo.Configuracion
    ORDER BY Clave;
END;
GO

-- PUT /api/configuracion/:clave: cambia el valor de un parámetro. Valida según la clave:
--   MinutosReserva          entero de 1 a 120
--   HorasCarritoAbandonado  entero de 1 a 720
--   PorcentajeIVA           decimal de 0 a 100 con hasta 2 decimales (se guarda como 12.00)
--   UmbralBajoStock         entero mayor o igual a 0
--   otra clave existente    cualquier texto no vacío
-- Solo dígitos (y un punto en el IVA): sin signos, comas, espacios internos ni notación
-- científica. Los enteros se guardan normalizados (007 → 7). Clave inexistente → 50004;
-- valor inválido → 50001. Si el valor no cambia no escribe ni registra bitácora.
-- Bitácora: MODIFICAR, Modulo 'Configuracion', Entidad 'Configuracion', IDRegistro = IDConfiguracion;
-- ValorAnterior y ValorNuevo son {"Clave", "Valor"}.
-- Resultado: la fila de la clave (mismas columnas que SP_Configuracion_Listar).
CREATE OR ALTER PROCEDURE dbo.SP_Configuracion_Actualizar
    @IDUsuarioSolicitante INT,
    @Clave                NVARCHAR(50),
    @Valor                NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDConfiguracion INT;
    DECLARE @ClaveReal NVARCHAR(50);
    DECLARE @ValorActual NVARCHAR(200);
    DECLARE @Entero INT;
    DECLARE @Decimal DECIMAL(12,2);
    DECLARE @Anterior NVARCHAR(MAX);
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Clave = NULLIF(TRIM(@Clave), N'');
    SET @Valor = NULLIF(TRIM(@Valor), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar la clave y el valor
        IF @Clave IS NULL
            THROW 50001, N'La clave es obligatoria.', 1;

        IF @Valor IS NULL
            THROW 50001, N'El valor es obligatorio.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear el parámetro
        SELECT @IDConfiguracion = IDConfiguracion, @ClaveReal = Clave, @ValorActual = Valor
        FROM dbo.Configuracion WITH (UPDLOCK, ROWLOCK)
        WHERE Clave = @Clave;

        IF @IDConfiguracion IS NULL
            THROW 50004, N'El parámetro de configuración no existe.', 1;

        IF @ClaveReal IN (N'MinutosReserva', N'HorasCarritoAbandonado', N'UmbralBajoStock')
        BEGIN
            IF @Valor LIKE N'%[^0-9]%' OR LEN(@Valor) > 9
                THROW 50001, N'El valor debe ser un número entero sin signo.', 1;

            SET @Entero = CONVERT(INT, @Valor);

            IF @ClaveReal = N'MinutosReserva' AND @Entero NOT BETWEEN 1 AND 120
                THROW 50001, N'MinutosReserva debe estar entre 1 y 120.', 1;

            IF @ClaveReal = N'HorasCarritoAbandonado' AND @Entero NOT BETWEEN 1 AND 720
                THROW 50001, N'HorasCarritoAbandonado debe estar entre 1 y 720.', 1;

            SET @Valor = CONVERT(NVARCHAR(200), @Entero);
        END
        ELSE IF @ClaveReal = N'PorcentajeIVA'
        BEGIN
            -- Solo dígitos y un punto, con dígitos a ambos lados (o sin parte decimal), hasta 2 decimales
            IF @Valor LIKE N'%[^0-9.]%'
               OR LEN(@Valor) - LEN(REPLACE(@Valor, N'.', N'')) > 1
               OR LEFT(@Valor, 1) = N'.' OR RIGHT(@Valor, 1) = N'.'
               OR LEN(@Valor) > 9
               OR (CHARINDEX(N'.', @Valor) > 0 AND LEN(@Valor) - CHARINDEX(N'.', @Valor) > 2)
                THROW 50001, N'PorcentajeIVA debe ser un número decimal entre 0 y 100 con hasta 2 decimales.', 1;

            SET @Decimal = TRY_CONVERT(DECIMAL(12,2), @Valor);

            IF @Decimal IS NULL OR @Decimal NOT BETWEEN 0 AND 100
                THROW 50001, N'PorcentajeIVA debe ser un número decimal entre 0 y 100 con hasta 2 decimales.', 1;

            SET @Valor = CONVERT(NVARCHAR(200), @Decimal);
        END;

        -- 3. Escribir y 4. Bitácora (solo si cambia)
        IF @Valor COLLATE Latin1_General_BIN2 <> @ValorActual COLLATE Latin1_General_BIN2
        BEGIN
            SELECT @Anterior = (SELECT @ClaveReal AS Clave, @ValorActual AS Valor
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            UPDATE dbo.Configuracion
            SET Valor = @Valor
            WHERE IDConfiguracion = @IDConfiguracion;

            SELECT @Nuevo = (SELECT @ClaveReal AS Clave, @Valor AS Valor
                             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Configuracion', N'Configuracion', @IDConfiguracion,
                    N'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT IDConfiguracion, Clave, Valor, Descripcion
        FROM dbo.Configuracion
        WHERE IDConfiguracion = @IDConfiguracion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Sistema
   ========================================================= */

-- GET /api/health: comprueba que la base responde con el login de la aplicación.
CREATE OR ALTER PROCEDURE dbo.SP_Sistema_VerificarConexion
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        DB_NAME()        AS BaseDatos,
        SYSUTCDATETIME() AS FechaServidor;
END;
GO

-- ===== 015_sp_tarjetas.sql =====
/*
    015_sp_tarjetas.sql
    Stored procedures de las tarjetas guardadas del cliente (SP_Tarjetas_*).

    Solo se guarda lo que muestra un recibo: titular, marca, tipo (CREDITO/DEBITO) y últimos 4 dígitos.
    El número completo, el vencimiento y el CVV nunca llegan a la base. El pago es simulado: guardar una
    tarjeta terminada en 0000 se rechaza como un pago (50020), igual que al pagar con ella.

    Reglas:
      * Solo el rol Cliente tiene tarjetas (otro rol → 50001).
      * Una tarjeta ajena o inexistente es inexistente para el solicitante (50004).
      * Una tarjeta repetida (misma marca, tipo y últimos 4) no tiene THROW propio: termina en 2627
        (UQ_TarjetaGuardada_Tarjeta) → DUPLICADO, igual que el correo de usuario o el nombre de categoría
        (ver 007_sp_auth.sql, SP_Auth_RegistrarCliente). Ningún SP del proyecto lanza un código propio para
        duplicados, así que aquí tampoco se agrega uno.
      * A lo sumo una predeterminada por cliente (UX_TarjetaGuardada_Predeterminada). La primera tarjeta
        del cliente queda predeterminada; al eliminar la predeterminada pasa a serlo la más reciente.
      * Orden de bloqueo: TarjetaGuardada del cliente (UPDLOCK, ROWLOCK). No toca variantes ni reservas.
      * Bitácora (Modulo 'Tarjetas', Entidad 'TarjetaGuardada', IDRegistro = IDTarjetaGuardada) con
        FU_Tarjetas_TarjetaJson: CREAR, MODIFICAR (predeterminada) y ELIMINAR.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (SP_Usuarios_ValidarSolicitante)
      50020  PAGO_RECHAZADO (tarjeta terminada en 0000 al guardarla)
      2627   DUPLICADO (UQ_TarjetaGuardada_Tarjeta)

    Pagar con una tarjeta guardada o guardarla durante el pago lo hace SP_Pedidos_CrearPedido (012).
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

-- GET /api/tarjetas: tarjetas del solicitante, la predeterminada primero y luego de la más reciente a la
-- más antigua. Sin result set de total (no se pagina).
-- Fila: IDTarjetaGuardada INT, Titular NVARCHAR(150), Ultimos4 CHAR(4), Tipo NVARCHAR(10),
--   Marca NVARCHAR(20), Predeterminada BIT, FechaCreacion DATETIME2(3).
CREATE OR ALTER PROCEDURE dbo.SP_Tarjetas_Listar
    @IDUsuarioSolicitante INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT IDTarjetaGuardada, Titular, Ultimos4, Tipo, Marca, Predeterminada, FechaCreacion
    FROM dbo.TarjetaGuardada
    WHERE IDUsuario = @IDUsuarioSolicitante
    ORDER BY Predeterminada DESC, FechaCreacion DESC, IDTarjetaGuardada DESC;
END;
GO

-- POST /api/tarjetas: guarda una tarjeta del solicitante.
--   @Tipo CREDITO | DEBITO, @Marca VISA | MASTERCARD | AMEX | OTRA (otro valor → 50001)
--   @Ultimos4 cuatro dígitos; '0000' → 50020 (verificación simulada, no se guarda)
--   @Predeterminada 1 la deja como predeterminada y desmarca la anterior. La primera tarjeta del cliente
--                   queda predeterminada siempre.
-- Repetida → 2627 (DUPLICADO). Resultado: la fila creada con las columnas de SP_Tarjetas_Listar.
CREATE OR ALTER PROCEDURE dbo.SP_Tarjetas_Crear
    @IDUsuarioSolicitante INT,
    @Titular              NVARCHAR(150),
    @Ultimos4             CHAR(4),
    @Tipo                 NVARCHAR(10),
    @Marca                NVARCHAR(20),
    @Predeterminada       BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDTarjetaGuardada INT, @Rol NVARCHAR(30), @Marcar BIT, @Nuevo NVARCHAR(MAX);

    SET @Titular = NULLIF(TRIM(@Titular), N'');
    SET @Tipo    = UPPER(NULLIF(TRIM(@Tipo), N''));
    SET @Marca   = UPPER(NULLIF(TRIM(@Marca), N''));

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SELECT @Rol = r.Nombre
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuarioSolicitante;

        IF @Rol <> N'Cliente'
            THROW 50001, N'Solo los clientes pueden guardar tarjetas.', 1;

        IF @Titular IS NULL
            THROW 50001, N'El titular de la tarjeta es obligatorio.', 1;

        IF @Ultimos4 IS NULL OR @Ultimos4 NOT LIKE N'[0-9][0-9][0-9][0-9]'
            THROW 50001, N'Los últimos 4 dígitos de la tarjeta deben ser numéricos.', 1;

        IF @Tipo IS NULL OR @Tipo NOT IN (N'CREDITO', N'DEBITO')
            THROW 50001, N'El tipo de tarjeta debe ser CREDITO o DEBITO.', 1;

        IF @Marca IS NULL OR @Marca NOT IN (N'VISA', N'MASTERCARD', N'AMEX', N'OTRA')
            THROW 50001, N'La marca de la tarjeta debe ser VISA, MASTERCARD, AMEX u OTRA.', 1;

        IF @Ultimos4 = N'0000'
            THROW 50020, N'La tarjeta fue rechazada por el emisor.', 1;

        -- 2. Bloquear las tarjetas del cliente: serializa la elección de la predeterminada
        --    (el rango vacío también queda protegido por HOLDLOCK).
        IF EXISTS (SELECT 1 FROM dbo.TarjetaGuardada WITH (UPDLOCK, HOLDLOCK) WHERE IDUsuario = @IDUsuarioSolicitante)
            SET @Marcar = ISNULL(@Predeterminada, 0);
        ELSE
            SET @Marcar = 1;

        -- 3. Escribir. Una tarjeta repetida termina aquí con 2627 (UQ_TarjetaGuardada_Tarjeta) → DUPLICADO.
        IF @Marcar = 1
            UPDATE dbo.TarjetaGuardada
            SET Predeterminada = 0
            WHERE IDUsuario = @IDUsuarioSolicitante
              AND Predeterminada = 1;

        INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca, Predeterminada)
        VALUES (@IDUsuarioSolicitante, @Titular, @Ultimos4, @Tipo, @Marca, @Marcar);

        SET @IDTarjetaGuardada = SCOPE_IDENTITY();

        -- 4. Bitácora
        SELECT @Nuevo = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDTarjetaGuardada);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Tarjetas', N'TarjetaGuardada', @IDTarjetaGuardada, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT IDTarjetaGuardada, Titular, Ultimos4, Tipo, Marca, Predeterminada, FechaCreacion
        FROM dbo.TarjetaGuardada
        WHERE IDTarjetaGuardada = @IDTarjetaGuardada;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/tarjetas/:id/predeterminada: la deja como predeterminada y desmarca la anterior.
-- Tarjeta ajena o inexistente → 50004. Si ya era la predeterminada no cambia nada ni escribe bitácora.
-- Resultado: la fila con las columnas de SP_Tarjetas_Listar.
CREATE OR ALTER PROCEDURE dbo.SP_Tarjetas_MarcarPredeterminada
    @IDUsuarioSolicitante INT,
    @IDTarjetaGuardada    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Actual BIT, @IDAnterior INT, @AntesNueva NVARCHAR(MAX), @DespuesNueva NVARCHAR(MAX);
    DECLARE @AntesPrevia NVARCHAR(MAX), @DespuesPrevia NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear las tarjetas del cliente; la de otro usuario no existe para el solicitante.
        SELECT @Actual = Predeterminada
        FROM dbo.TarjetaGuardada WITH (UPDLOCK, ROWLOCK)
        WHERE IDTarjetaGuardada = @IDTarjetaGuardada AND IDUsuario = @IDUsuarioSolicitante;

        IF @Actual IS NULL
            THROW 50004, N'La tarjeta no existe.', 1;

        IF @Actual = 0
        BEGIN
            SELECT @IDAnterior = IDTarjetaGuardada
            FROM dbo.TarjetaGuardada WITH (UPDLOCK, ROWLOCK)
            WHERE IDUsuario = @IDUsuarioSolicitante AND Predeterminada = 1;

            SELECT @AntesNueva = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDTarjetaGuardada);

            -- 3. Escribir: primero se desmarca la anterior (UX_TarjetaGuardada_Predeterminada)
            IF @IDAnterior IS NOT NULL
            BEGIN
                SELECT @AntesPrevia = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDAnterior);

                UPDATE dbo.TarjetaGuardada SET Predeterminada = 0 WHERE IDTarjetaGuardada = @IDAnterior;

                SELECT @DespuesPrevia = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDAnterior);

                INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
                VALUES (@IDUsuarioSolicitante, N'Tarjetas', N'TarjetaGuardada', @IDAnterior, N'MODIFICAR', @AntesPrevia, @DespuesPrevia);
            END;

            UPDATE dbo.TarjetaGuardada SET Predeterminada = 1 WHERE IDTarjetaGuardada = @IDTarjetaGuardada;

            -- 4. Bitácora
            SELECT @DespuesNueva = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDTarjetaGuardada);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Tarjetas', N'TarjetaGuardada', @IDTarjetaGuardada, N'MODIFICAR', @AntesNueva, @DespuesNueva);
        END;

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT IDTarjetaGuardada, Titular, Ultimos4, Tipo, Marca, Predeterminada, FechaCreacion
        FROM dbo.TarjetaGuardada
        WHERE IDTarjetaGuardada = @IDTarjetaGuardada;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/tarjetas/:id: borrado físico. Si era la predeterminada, pasa a serlo la más reciente que
-- quede. Tarjeta ajena o inexistente → 50004. Sin result set (204).
CREATE OR ALTER PROCEDURE dbo.SP_Tarjetas_Eliminar
    @IDUsuarioSolicitante INT,
    @IDTarjetaGuardada    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @EraPredeterminada BIT, @IDNueva INT, @Anterior NVARCHAR(MAX);
    DECLARE @AntesNueva NVARCHAR(MAX), @DespuesNueva NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear
        SELECT @EraPredeterminada = Predeterminada
        FROM dbo.TarjetaGuardada WITH (UPDLOCK, ROWLOCK)
        WHERE IDTarjetaGuardada = @IDTarjetaGuardada AND IDUsuario = @IDUsuarioSolicitante;

        IF @EraPredeterminada IS NULL
            THROW 50004, N'La tarjeta no existe.', 1;

        SELECT @Anterior = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDTarjetaGuardada);

        -- 3. Escribir
        DELETE FROM dbo.TarjetaGuardada
        WHERE IDTarjetaGuardada = @IDTarjetaGuardada
          AND IDUsuario = @IDUsuarioSolicitante;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Tarjetas', N'TarjetaGuardada', @IDTarjetaGuardada, N'ELIMINAR', @Anterior, NULL);

        IF @EraPredeterminada = 1
        BEGIN
            SELECT TOP (1) @IDNueva = IDTarjetaGuardada
            FROM dbo.TarjetaGuardada WITH (UPDLOCK, ROWLOCK)
            WHERE IDUsuario = @IDUsuarioSolicitante
            ORDER BY FechaCreacion DESC, IDTarjetaGuardada DESC;

            IF @IDNueva IS NOT NULL
            BEGIN
                SELECT @AntesNueva = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDNueva);

                UPDATE dbo.TarjetaGuardada SET Predeterminada = 1 WHERE IDTarjetaGuardada = @IDNueva;

                SELECT @DespuesNueva = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDNueva);

                INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
                VALUES (@IDUsuarioSolicitante, N'Tarjetas', N'TarjetaGuardada', @IDNueva, N'MODIFICAR', @AntesNueva, @DespuesNueva);
            END;
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ===== 080_permisos.sql =====
/*
    080_permisos.sql
    Login de la aplicación con permiso EXECUTE únicamente.
    El backend solo puede ejecutar stored procedures: cualquier SELECT/INSERT/UPDATE/DELETE
    directo sobre las tablas es rechazado por la base. Las vistas y funciones se usan desde
    los SPs por encadenamiento de propiedad (mismo dueño dbo).

    Variables de sqlcmd:
      $(DbName)       nombre de la base
      $(AppLogin)     login de la aplicación (shopcart_app)
      $(AppPassword)  contraseña del login
*/
USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(AppLogin)')
    CREATE LOGIN [$(AppLogin)] WITH PASSWORD = N'$(AppPassword)', CHECK_POLICY = ON, DEFAULT_DATABASE = [$(DbName)];
ELSE
    ALTER LOGIN [$(AppLogin)] WITH PASSWORD = N'$(AppPassword)', DEFAULT_DATABASE = [$(DbName)];
GO

USE [$(DbName)];
GO

CREATE USER [$(AppLogin)] FOR LOGIN [$(AppLogin)] WITH DEFAULT_SCHEMA = dbo;
GO

GRANT EXECUTE ON SCHEMA::dbo TO [$(AppLogin)];
GO

-- Explícito, aunque el usuario no tiene permisos de tabla: la bitácora y el kardex son inmutables.
DENY UPDATE, DELETE ON dbo.Bitacora TO [$(AppLogin)];
DENY UPDATE, DELETE ON dbo.MovimientoInventario TO [$(AppLogin)];
GO

-- ===== 085_datos_catalogos.sql =====
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

/* Métodos de envío */
INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimados)
VALUES
    (N'Estándar',          25.00, 3),
    (N'Express',           45.00, 1),
    (N'Recoger en tienda',  0.00, 0);

/* Configuración */
INSERT INTO dbo.Configuracion (Clave, Valor, Descripcion)
VALUES
    (N'MinutosReserva',         N'15',    N'Minutos que dura la reserva de existencia durante el checkout'),
    (N'HorasCarritoAbandonado', N'24',    N'Horas sin actividad para considerar un carrito abandonado'),
    (N'PorcentajeIVA',          N'12.00', N'IVA incluido en los precios publicados'),
    (N'UmbralBajoStock',        N'5',     N'Existencia disponible a partir de la cual se marca bajo stock');

COMMIT TRANSACTION;
GO

-- ===== 090_datos_semilla.sql =====
/*
    090_datos_semilla.sql
    Datos de ejemplo: usuarios de prueba con sus direcciones, catálogo de productos con
    variantes y existencia inicial, y cupones para probar cada regla.

    Los catálogos del sistema (roles, tipos de movimiento, …) vienen de 085_datos_catalogos.sql
    y se buscan por Nombre o Codigo, nunca por ID. Todo va en una sola transacción: si algo
    falla no queda una semilla a medias.

    Usuarios (contraseñas en el README, "Credenciales de prueba"). Los hashes son argon2id reales
    generados con el paquete argon2 del backend. Contienen '$' pero nunca '$(', así que sqlcmd no
    los toma por variables.

    Usuarios, direcciones, productos, variantes y cupones se insertan con ORDER BY por una
    columna Orden: sus IDs siguen el orden de declaración y son los mismos en cada ejecución.

    La existencia inicial entra al kardex con el tipo INVENTARIO_INICIAL (Signo +1) y
    Variante.ExistenciaFisica se calcula del kardex en el mismo lote: suma de Signo * Cantidad.

    Cupones: las vigencias son relativas a la fecha de ejecución, así BIENVENIDA10 y VERANO25
    siguen vigentes y VENCIDO5 vencido sin importar cuándo se cree la base.
    AGOTADO5 nace con UsosActuales = LimiteUsosTotal sin filas en UsoCupon, porque ningún pedido de
    ejemplo lo usa: es el único contador de la semilla que no sale de su tabla de origen.

    Pedidos de ejemplo (último bloque): siete pedidos de cliente3@shopcart.gt (usuario 6) creados llamando a
    los SPs reales (SP_Inventario_ReservarExistencia, SP_Pedidos_CrearPedido, SP_Pedidos_CambiarEstado,
    SP_Pedidos_Cancelar, SP_Pedidos_RegistrarDevolucion), así el kardex, los saldos, el uso de cupón, el pago, el
    historial y la bitácora salen de la misma lógica que en producción. Usan variantes distintas de la 4 y de las
    que usan las pruebas, y el cliente 6 en lugar de los clientes 3 y 4. Los SPs ponen la fecha actual; como sa se
    reescriben las fechas (con los triggers de inmutabilidad deshabilitados dentro de la transacción de la semilla y
    vueltos a habilitar antes del COMMIT) para repartir los pedidos en varios días, uno de ellos a las 02:00 UTC
    (20:00 del día anterior en Guatemala) para probar la agrupación por fecha local. Las existencias anterior y nueva
    del kardex no cambian: solo se mueve el INVENTARIO_INICIAL de esas variantes a 30 días atrás para que el kardex
    quede en orden cronológico. Al final un bloque comprueba que cada saldo coincide con su fuente.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();

/* =========================================================
   Usuarios y direcciones
   ========================================================= */

INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono, Activo)
SELECT r.IDRol, u.Correo, u.HashContrasena, u.Nombre, u.Apellido, u.Telefono, u.Activo
FROM (VALUES
        -- Admin#2026
        (1, N'Administrador', N'admin@shopcart.gt',
         N'$argon2id$v=19$m=65536,p=4,t=3$RFDBZx8oXkPcuzcWkdKw1Q$VrjKpLoJRB7SO+8AFfoxnJOCp/6QKzhPDG7IVB/vkvk',
         N'Andrea', N'Morales', N'55510001', 1),
        -- Operador#2026
        (2, N'Operador', N'operador@shopcart.gt',
         N'$argon2id$v=19$m=65536,p=4,t=3$MN9730SzJTeC3oZgFpYdCw$6ddUzp/9Jihos7XFSHuppvZ3oZqH7erWWVJOczT8Agk',
         N'Óscar', N'Pérez', N'55510002', 1),
        -- Cliente#2026
        (3, N'Cliente', N'cliente@shopcart.gt',
         N'$argon2id$v=19$m=65536,p=4,t=3$42gzU+Uin/DGdqpX5qsodQ$ZPCrug7DUw96bnyoRiFyLAzupEsE7hQLreH/OF+okIk',
         N'Ana', N'López', N'55510003', 1),
        -- Cliente#2026; segundo cliente para las pruebas de propiedad (recurso ajeno → 404)
        (4, N'Cliente', N'cliente2@shopcart.gt',
         N'$argon2id$v=19$m=65536,p=4,t=3$8YMfJ52OkTC1mfnvnvzubQ$e+mxDEfhteYxXyuivLA8FNaJPMXZ8nof4rWoBKNVMjI',
         N'Bruno', N'García', N'55510004', 1),
        -- Cliente#2026; desactivado, para probar USUARIO_INACTIVO
        (5, N'Cliente', N'inactivo@shopcart.gt',
         N'$argon2id$v=19$m=65536,p=4,t=3$jjdFcGI+ighPuAZu69yCDw$fnGvzodDAvqJCzAOAgOvN72qwVmCYCrxxkLszudHvMU',
         N'Carla', N'Ruiz', NULL, 0),
        -- Cliente#2026; tercer cliente, dueño de los pedidos de ejemplo (mismo hash que cliente@shopcart.gt)
        (6, N'Cliente', N'cliente3@shopcart.gt',
         N'$argon2id$v=19$m=65536,p=4,t=3$42gzU+Uin/DGdqpX5qsodQ$ZPCrug7DUw96bnyoRiFyLAzupEsE7hQLreH/OF+okIk',
         N'Diego', N'Ramírez', N'55510006', 1)
     ) AS u (Orden, Rol, Correo, HashContrasena, Nombre, Apellido, Telefono, Activo)
INNER JOIN dbo.Rol AS r ON r.Nombre = u.Rol
ORDER BY u.Orden;

IF @@ROWCOUNT <> 6
    THROW 50000, N'Semilla: faltan roles en el catálogo; ejecuta 085_datos_catalogos.sql.', 1;

DECLARE @IDAdmin INT = (SELECT IDUsuario FROM dbo.Usuario WHERE Correo = N'admin@shopcart.gt');

INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, Linea2,
                           Municipio, Departamento, CodigoPostal, Referencias)
SELECT us.IDUsuario, d.Alias, d.NombreDestinatario, d.Telefono, d.Linea1, d.Linea2,
       d.Municipio, d.Departamento, d.CodigoPostal, d.Referencias
FROM (VALUES
        (1, N'cliente@shopcart.gt',  N'Casa',    N'Ana López',    N'55510003', N'5a. avenida 10-25, zona 1', N'Apartamento 3B',
         N'Guatemala', N'Guatemala', N'01001', N'Edificio color crema, frente al parque'),
        (2, N'cliente@shopcart.gt',  N'Oficina', N'Ana López',    N'55510003', N'Diagonal 6 12-42, zona 10', N'Torre 2, nivel 8',
         N'Guatemala', N'Guatemala', N'01010', NULL),
        (3, N'cliente2@shopcart.gt', N'Casa',    N'Bruno García', N'55510004', N'3a. calle 4-15, zona 1',    NULL,
         N'Antigua Guatemala', N'Sacatepéquez', N'03001', N'Portón negro'),
        (4, N'inactivo@shopcart.gt', N'Casa',    N'Carla Ruiz',   N'55510005', N'Calzada Roosevelt 22-43, zona 11', NULL,
         N'Mixco', N'Guatemala', N'01057', NULL),
        (5, N'cliente3@shopcart.gt', N'Casa',    N'Diego Ramírez', N'55510006', N'12 calle 3-40, zona 14', N'Casa 7',
         N'Guatemala', N'Guatemala', N'01014', N'Portón blanco')
     ) AS d (Orden, Correo, Alias, NombreDestinatario, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Referencias)
INNER JOIN dbo.Usuario AS us ON us.Correo = d.Correo
ORDER BY d.Orden;

-- Tarjetas guardadas de cliente@shopcart.gt: solo titular, marca, tipo y últimos 4 (nunca el número completo).
INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca, Predeterminada)
SELECT us.IDUsuario, t.Titular, t.Ultimos4, t.Tipo, t.Marca, t.Predeterminada
FROM (VALUES
        (1, N'Ana López', '4242', N'CREDITO', N'VISA',       1),
        (2, N'Ana López', '5454', N'DEBITO',  N'MASTERCARD', 0)
     ) AS t (Orden, Titular, Ultimos4, Tipo, Marca, Predeterminada)
INNER JOIN dbo.Usuario AS us ON us.Correo = N'cliente@shopcart.gt'
ORDER BY t.Orden;

/* =========================================================
   Catálogo
   ========================================================= */

INSERT INTO dbo.Categoria (Nombre, Descripcion)
VALUES
    (N'Camisetas',   N'Camisetas y playeras de algodón'),
    (N'Pantalones',  N'Jeans, joggers y pantalones casuales'),
    (N'Calzado',     N'Tenis y zapatos'),
    (N'Accesorios',  N'Gorras, bufandas y complementos');

INSERT INTO dbo.Atributo (Nombre)
VALUES (N'Talla'), (N'Color');

INSERT INTO dbo.ValorAtributo (IDAtributo, Valor)
SELECT a.IDAtributo, v.Valor
FROM (VALUES
        (N'Talla', N'S'), (N'Talla', N'M'), (N'Talla', N'L'), (N'Talla', N'XL'),
        (N'Talla', N'30'), (N'Talla', N'32'), (N'Talla', N'34'),
        (N'Talla', N'40'), (N'Talla', N'41'), (N'Talla', N'42'),
        (N'Talla', N'Única'),
        (N'Color', N'Negro'), (N'Color', N'Blanco'), (N'Color', N'Azul'),
        (N'Color', N'Gris'), (N'Color', N'Rojo')
     ) AS v (Atributo, Valor)
INNER JOIN dbo.Atributo AS a ON a.Nombre = v.Atributo;

-- Los nombres de producto no tienen UNIQUE en la tabla, pero son únicos en esta semilla
-- y sirven para enlazar imágenes y variantes.
INSERT INTO dbo.Producto (IDCategoria, Nombre, Descripcion, Activo)
SELECT c.IDCategoria, p.Nombre, p.Descripcion, p.Activo
FROM (VALUES
        (1, N'Camisetas',  N'Camiseta básica de algodón',  N'Camiseta de algodón peinado, corte regular y cuello redondo.', 1),
        (2, N'Camisetas',  N'Camiseta edición limitada',   N'Estampado de edición limitada; últimas unidades.', 1),
        (3, N'Pantalones', N'Jeans slim fit',              N'Jeans de mezclilla elástica, corte slim.', 1),
        (4, N'Pantalones', N'Pantalón jogger',             N'Jogger de algodón con puños y cintura ajustable.', 1),
        (5, N'Calzado',    N'Tenis urbanos',               N'Tenis de lona con suela de goma.', 1),
        (6, N'Accesorios', N'Gorra clásica',               N'Gorra de seis paneles con cierre ajustable.', 1),
        (7, N'Accesorios', N'Bufanda de lana',             N'Producto descontinuado: no aparece en el catálogo público.', 0)
     ) AS p (Orden, Categoria, Nombre, Descripcion, Activo)
INNER JOIN dbo.Categoria AS c ON c.Nombre = p.Categoria
ORDER BY p.Orden;

INSERT INTO dbo.ProductoImagen (IDProducto, Url, Orden, EsPrincipal)
SELECT p.IDProducto, i.Url, i.Orden, i.EsPrincipal
FROM (VALUES
        (N'Camiseta básica de algodón', N'https://placehold.co/600x600?text=Camiseta+basica',    0, 1),
        (N'Camiseta básica de algodón', N'https://placehold.co/600x600?text=Camiseta+espalda',   1, 0),
        (N'Camiseta edición limitada',  N'https://placehold.co/600x600?text=Edicion+limitada',   0, 1),
        (N'Jeans slim fit',             N'https://placehold.co/600x600?text=Jeans+slim',         0, 1),
        (N'Pantalón jogger',            N'https://placehold.co/600x600?text=Jogger',             0, 1),
        (N'Tenis urbanos',              N'https://placehold.co/600x600?text=Tenis+urbanos',      0, 1),
        (N'Gorra clásica',              N'https://placehold.co/600x600?text=Gorra',              0, 1),
        (N'Bufanda de lana',            N'https://placehold.co/600x600?text=Bufanda',            0, 1)
     ) AS i (Producto, Url, Orden, EsPrincipal)
INNER JOIN dbo.Producto AS p ON p.Nombre = i.Producto;

-- Variantes: precio con IVA incluido, en quetzales.
--   CAM-LIM-NEG-M tiene una sola unidad (prueba de compra concurrente de la última unidad).
--   CAL-TEN-NEG-41 está inactiva y conserva existencia (no se vende aunque haya unidades).
--   CAL-TEN-BLA-42 está agotada (existencia 0, sin movimiento de kardex).
DECLARE @Variante TABLE (
    Orden      INT IDENTITY(1,1) NOT NULL,  -- orden de declaración; fija los IDs de las variantes
    Producto   NVARCHAR(150) NOT NULL,
    SKU        NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Precio     DECIMAL(12,2) NOT NULL,
    Existencia INT           NOT NULL,
    Activo     BIT           NOT NULL,
    Talla      NVARCHAR(50)  NOT NULL,
    Color      NVARCHAR(50)  NOT NULL
);

INSERT INTO @Variante (Producto, SKU, Precio, Existencia, Activo, Talla, Color)
VALUES
    (N'Camiseta básica de algodón', N'CAM-BAS-NEG-M',  89.00, 50, 1, N'M',     N'Negro'),
    (N'Camiseta básica de algodón', N'CAM-BAS-BLA-M',  89.00, 40, 1, N'M',     N'Blanco'),
    (N'Camiseta básica de algodón', N'CAM-BAS-AZU-L',  95.00, 25, 1, N'L',     N'Azul'),
    (N'Camiseta edición limitada',  N'CAM-LIM-NEG-M', 149.00,  1, 1, N'M',     N'Negro'),
    (N'Camiseta edición limitada',  N'CAM-LIM-BLA-L', 149.00,  3, 1, N'L',     N'Blanco'),
    (N'Jeans slim fit',             N'PAN-JEA-AZU-30', 299.00, 20, 1, N'30',   N'Azul'),
    (N'Jeans slim fit',             N'PAN-JEA-AZU-32', 299.00, 15, 1, N'32',   N'Azul'),
    (N'Jeans slim fit',             N'PAN-JEA-NEG-34', 319.00, 10, 1, N'34',   N'Negro'),
    (N'Pantalón jogger',            N'PAN-JOG-GRI-M',  199.00, 25, 1, N'M',    N'Gris'),
    (N'Pantalón jogger',            N'PAN-JOG-NEG-L',  199.00, 12, 1, N'L',    N'Negro'),
    (N'Tenis urbanos',              N'CAL-TEN-BLA-40', 459.00,  8, 1, N'40',   N'Blanco'),
    (N'Tenis urbanos',              N'CAL-TEN-BLA-42', 459.00,  0, 1, N'42',   N'Blanco'),
    (N'Tenis urbanos',              N'CAL-TEN-NEG-41', 459.00,  5, 0, N'41',   N'Negro'),
    (N'Gorra clásica',              N'ACC-GOR-NEG-U',   79.50, 30, 1, N'Única', N'Negro'),
    (N'Gorra clásica',              N'ACC-GOR-ROJ-U',   79.50, 18, 1, N'Única', N'Rojo'),
    (N'Bufanda de lana',            N'ACC-BUF-GRI-U',  129.00, 10, 1, N'Única', N'Gris');

-- La existencia nace en 0 y solo la mueve el kardex.
INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, Activo)
SELECT p.IDProducto, s.SKU, s.Precio, 0, s.Activo
FROM @Variante AS s
INNER JOIN dbo.Producto AS p ON p.Nombre = s.Producto
ORDER BY s.Orden;

IF @@ROWCOUNT <> (SELECT COUNT(*) FROM @Variante)
    THROW 50000, N'Semilla: hay variantes cuyo producto no existe.', 1;

INSERT INTO dbo.VarianteValorAtributo (IDVariante, IDAtributo, IDValorAtributo)
SELECT v.IDVariante, va.IDAtributo, va.IDValorAtributo
FROM @Variante AS s
INNER JOIN dbo.Variante AS v ON v.SKU = s.SKU
CROSS APPLY (VALUES (N'Talla', s.Talla), (N'Color', s.Color)) AS x (Atributo, Valor)
INNER JOIN dbo.Atributo AS a ON a.Nombre = x.Atributo
INNER JOIN dbo.ValorAtributo AS va ON va.IDAtributo = a.IDAtributo AND va.Valor = x.Valor;

IF @@ROWCOUNT <> 2 * (SELECT COUNT(*) FROM @Variante)
    THROW 50000, N'Semilla: hay variantes con una talla o un color que no existe.', 1;

/* =========================================================
   Inventario inicial (kardex)
   ========================================================= */

-- Un movimiento INVENTARIO_INICIAL por variante con existencia; el Signo sale del tipo.
INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario,
                                      Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo)
SELECT v.IDVariante, t.IDTipoMovimientoInventario, t.Signo, @IDAdmin,
       s.Existencia, v.ExistenciaFisica, v.ExistenciaFisica + t.Signo * s.Existencia,
       N'Inventario inicial (datos semilla)'
FROM @Variante AS s
INNER JOIN dbo.Variante AS v ON v.SKU = s.SKU
CROSS JOIN dbo.TipoMovimientoInventario AS t
WHERE t.Codigo = N'INVENTARIO_INICIAL'
  AND s.Existencia > 0
ORDER BY s.Orden;

IF @@ROWCOUNT <> (SELECT COUNT(*) FROM @Variante WHERE Existencia > 0)
    THROW 50000, N'Semilla: falta el tipo de movimiento INVENTARIO_INICIAL.', 1;

-- Existencia física = saldo del kardex.
UPDATE v
SET ExistenciaFisica = k.Saldo
FROM dbo.Variante AS v
INNER JOIN (
    SELECT IDVariante, SUM(Signo * Cantidad) AS Saldo
    FROM dbo.MovimientoInventario
    GROUP BY IDVariante
) AS k ON k.IDVariante = v.IDVariante;

/* =========================================================
   Cupones
   ========================================================= */

INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, IDCategoria, MontoMinimo,
                       FechaInicio, FechaFin, LimiteUsosTotal, LimiteUsosPorCliente, UsosActuales, Activo)
SELECT c.Codigo, c.Descripcion, c.TipoDescuento, c.Valor, cat.IDCategoria, c.MontoMinimo,
       DATEADD(DAY, c.DiasInicio, @Ahora), DATEADD(DAY, c.DiasFin, @Ahora),
       c.LimiteUsosTotal, c.LimiteUsosPorCliente, c.UsosActuales, c.Activo
FROM (VALUES
        -- Vigente, todo el carrito.
        (1, N'BIENVENIDA10', N'10 % de descuento en tu primera compra', N'PORCENTAJE', 10.00, NULL,
         0.00,  -30, 365, 1000, 1, 0, 1),
        -- Vigente, solo camisetas, con compra mínima.
        (2, N'VERANO25', N'Q25.00 de descuento en camisetas con compra mínima de Q300.00', N'MONTO_FIJO', 25.00, N'Camisetas',
         300.00, -30, 365, 100, 1, 0, 1),
        -- CUPON_VENCIDO: su vigencia terminó ayer.
        (3, N'VENCIDO5', N'Cupón de prueba vencido', N'PORCENTAJE', 5.00, NULL,
         0.00,  -60,  -1, 100, 1, 0, 1),
        -- CUPON_AGOTADO: ya alcanzó su límite total de usos.
        (4, N'AGOTADO5', N'Cupón de prueba agotado', N'PORCENTAJE', 5.00, NULL,
         0.00,  -30, 365, 1, 1, 1, 1),
        -- CUPON_NO_VIGENTE: su vigencia empieza en 30 días.
        (5, N'PROXIMO15', N'Cupón de prueba que aún no inicia', N'PORCENTAJE', 15.00, NULL,
         0.00,   30, 365, 100, 1, 0, 1),
        -- CUPON_INACTIVO: desactivado por el administrador.
        (6, N'INACTIVO5', N'Cupón de prueba desactivado', N'PORCENTAJE', 5.00, NULL,
         0.00,  -30, 365, 100, 1, 0, 0)
     ) AS c (Orden, Codigo, Descripcion, TipoDescuento, Valor, Categoria, MontoMinimo,
             DiasInicio, DiasFin, LimiteUsosTotal, LimiteUsosPorCliente, UsosActuales, Activo)
LEFT JOIN dbo.Categoria AS cat ON cat.Nombre = c.Categoria
ORDER BY c.Orden;

IF EXISTS (SELECT 1 FROM dbo.Cupon WHERE Codigo = N'VERANO25' AND IDCategoria IS NULL)
    THROW 50000, N'Semilla: la categoría de VERANO25 no existe.', 1;

COMMIT TRANSACTION;
GO

/* =========================================================
   Pedidos de ejemplo
   =========================================================
   Siete pedidos del cliente 6, en orden cronológico (los IDPedido siguen ese orden):
     1  hace 12 días 15:30 UTC  ENTREGADO         2 x CAM-BAS-NEG-M + 1 x PAN-JOG-GRI-M, Estándar
     2  hace  9 días 02:00 UTC  ENTREGADO         PAN-JEA-AZU-30 + ACC-GOR-NEG-U, Express  (20:00 del día anterior en Guatemala)
     3  hace  8 días 14:00 UTC  CANCELADO         4 x CAM-BAS-BLA-M con VERANO25 (la cancelación libera el cupón)
     4  hace  6 días 16:00 UTC  ENTREGADO         4 x CAM-BAS-BLA-M + ACC-GOR-ROJ-U con VERANO25, Estándar
     5  hace  4 días 18:00 UTC  DEVUELTO_PARCIAL  3 x CAM-BAS-AZU-L + 2 x ACC-GOR-ROJ-U; devuelve 1 x CAM-BAS-AZU-L
     6  hace  2 días 09:00 UTC  EN_PREPARACION    PAN-JOG-NEG-L + PAN-JEA-NEG-34, Express
     7  hace  1 día  10:00 UTC  PAGADO            CAM-BAS-NEG-M + PAN-JEA-AZU-32, Recoger en tienda
   Las fechas son relativas al día de ejecución. Cada pedido pasa por los SPs (carrito directo como sa; reservar,
   pagar, cambiar estado, cancelar y devolver por los SPs). Los result sets que devuelven los SPs salen en la
   consola de sqlcmd; no afectan los datos. */
BEGIN TRANSACTION;

-- Los triggers de inmutabilidad se deshabilitan solo para reescribir fechas; se vuelven a habilitar antes del COMMIT.
DISABLE TRIGGER dbo.TR_Bitacora_ImpedirCambios ON dbo.Bitacora;
DISABLE TRIGGER dbo.TR_Inventario_ImpedirCambiosKardex ON dbo.MovimientoInventario;

DECLARE @Hoy DATETIME2(3) = CONVERT(DATETIME2(3), CONVERT(DATE, SYSUTCDATETIME()));
DECLARE @IDCliente INT = (SELECT IDUsuario FROM dbo.Usuario WHERE Correo = N'cliente3@shopcart.gt');
DECLARE @IDOperador INT = (SELECT IDUsuario FROM dbo.Usuario WHERE Correo = N'operador@shopcart.gt');
DECLARE @IDDireccion INT = (SELECT MIN(IDDireccion) FROM dbo.Direccion WHERE IDUsuario = @IDCliente);

DECLARE @Pedido TABLE (
    Orden       INT           NOT NULL PRIMARY KEY,
    DiasAtras   INT           NOT NULL,
    MinutoDia   INT           NOT NULL,   -- minutos desde las 00:00 UTC
    Cupon       NVARCHAR(30)  NULL,
    Envio       NVARCHAR(100) NOT NULL
);
DECLARE @Linea TABLE (
    Orden      INT          NOT NULL,
    SKU        NVARCHAR(50) NOT NULL,
    Cantidad   INT          NOT NULL,
    Devolver   INT          NULL
);
-- Pasos después de crear el pedido: Accion ESTADO (CambiarEstado), CANCELAR o DEVOLVER; MinutosDespues se
-- cuenta desde la creación del pedido.
DECLARE @Paso TABLE (
    Orden          INT           NOT NULL,
    Secuencia      INT           NOT NULL,
    Accion         NVARCHAR(10)  NOT NULL,
    Estado         NVARCHAR(30)  NULL,
    MinutosDespues INT           NOT NULL,
    Comentario     NVARCHAR(300) NOT NULL,
    PRIMARY KEY (Orden, Secuencia)
);

INSERT INTO @Pedido (Orden, DiasAtras, MinutoDia, Cupon, Envio)
VALUES (1, 12,  930, NULL,       N'Estándar'),
       (2,  9,  120, NULL,       N'Express'),
       (3,  8,  840, N'VERANO25', N'Recoger en tienda'),
       (4,  6,  960, N'VERANO25', N'Estándar'),
       (5,  4, 1080, NULL,       N'Estándar'),
       (6,  2,  540, NULL,       N'Express'),
       (7,  1,  600, NULL,       N'Recoger en tienda');

INSERT INTO @Linea (Orden, SKU, Cantidad, Devolver)
VALUES (1, N'CAM-BAS-NEG-M',  2, NULL),
       (1, N'PAN-JOG-GRI-M',  1, NULL),
       (2, N'PAN-JEA-AZU-30', 1, NULL),
       (2, N'ACC-GOR-NEG-U',  1, NULL),
       (3, N'CAM-BAS-BLA-M',  4, NULL),
       (4, N'CAM-BAS-BLA-M',  4, NULL),
       (4, N'ACC-GOR-ROJ-U',  1, NULL),
       (5, N'CAM-BAS-AZU-L',  3, 1),
       (5, N'ACC-GOR-ROJ-U',  2, NULL),
       (6, N'PAN-JOG-NEG-L',  1, NULL),
       (6, N'PAN-JEA-NEG-34', 1, NULL),
       (7, N'CAM-BAS-NEG-M',  1, NULL),
       (7, N'PAN-JEA-AZU-32', 1, NULL);

INSERT INTO @Paso (Orden, Secuencia, Accion, Estado, MinutosDespues, Comentario)
VALUES (1, 1, N'ESTADO',   N'EN_PREPARACION', 180,  N'Pedido en preparación'),
       (1, 2, N'ESTADO',   N'DESPACHADO',     1440, N'Entregado a la transportista'),
       (1, 3, N'ESTADO',   N'ENTREGADO',      2880, N'Entregado al cliente'),
       (2, 1, N'ESTADO',   N'EN_PREPARACION', 180,  N'Pedido en preparación'),
       (2, 2, N'ESTADO',   N'DESPACHADO',     1440, N'Entregado a la transportista'),
       (2, 3, N'ESTADO',   N'ENTREGADO',      2880, N'Entregado al cliente'),
       (3, 1, N'CANCELAR', NULL,              120,  N'Cambié de opinión'),
       (4, 1, N'ESTADO',   N'EN_PREPARACION', 180,  N'Pedido en preparación'),
       (4, 2, N'ESTADO',   N'DESPACHADO',     1440, N'Entregado a la transportista'),
       (4, 3, N'ESTADO',   N'ENTREGADO',      2880, N'Entregado al cliente'),
       (5, 1, N'ESTADO',   N'EN_PREPARACION', 180,  N'Pedido en preparación'),
       (5, 2, N'ESTADO',   N'DESPACHADO',     1440, N'Entregado a la transportista'),
       (5, 3, N'ESTADO',   N'ENTREGADO',      2880, N'Entregado al cliente'),
       (5, 4, N'DEVOLVER', NULL,              4320, N'Talla incorrecta'),
       (6, 1, N'ESTADO',   N'EN_PREPARACION', 180,  N'Pedido en preparación');

DECLARE @Orden INT = 0, @Secuencia INT;
DECLARE @Fecha DATETIME2(3), @FechaPaso DATETIME2(3);
DECLARE @Cupon NVARCHAR(30), @Envio NVARCHAR(100), @IDCupon INT, @IDEnvio INT, @IDCarrito INT, @IDPedido INT;
DECLARE @Clave UNIQUEIDENTIFIER, @Accion NVARCHAR(10), @Estado NVARCHAR(30), @Minutos INT, @Comentario NVARCHAR(300);
DECLARE @Lineas NVARCHAR(MAX);
DECLARE @MaxRes INT, @MaxHist INT, @MaxMov BIGINT, @MaxBit BIGINT, @MaxDev INT;

WHILE 1 = 1
BEGIN
    SELECT TOP (1) @Orden = Orden,
           @Fecha = DATEADD(MINUTE, MinutoDia, DATEADD(DAY, -DiasAtras, @Hoy)),
           @Cupon = Cupon, @Envio = Envio
    FROM @Pedido
    WHERE Orden > @Orden
    ORDER BY Orden;

    IF @@ROWCOUNT = 0
        BREAK;

    SELECT @IDCupon = IDCupon FROM dbo.Cupon WHERE Codigo = @Cupon;
    SELECT @IDEnvio = IDMetodoEnvio FROM dbo.MetodoEnvio WHERE Nombre = @Envio;

    IF @IDEnvio IS NULL OR (@Cupon IS NOT NULL AND @IDCupon IS NULL)
        THROW 50000, N'Semilla: falta un método de envío o un cupón de los pedidos de ejemplo.', 1;

    SET @IDCupon = CASE WHEN @Cupon IS NULL THEN NULL ELSE @IDCupon END;
    SET @Clave = CONVERT(UNIQUEIDENTIFIER, CONCAT(N'5eed0000-0000-4000-8000-0000000000', RIGHT(CONCAT(N'00', @Orden), 2)));

    -- Carrito del cliente con su cupón y sus líneas
    INSERT INTO dbo.Carrito (IDUsuario, IDCupon, FechaCreacion, FechaUltimaActividad)
    VALUES (@IDCliente, @IDCupon, @Fecha, @Fecha);

    SET @IDCarrito = SCOPE_IDENTITY();

    INSERT INTO dbo.CarritoDetalle (IDCarrito, IDVariante, Cantidad, FechaAgregado)
    SELECT @IDCarrito, v.IDVariante, l.Cantidad, @Fecha
    FROM @Linea AS l
    INNER JOIN dbo.Variante AS v ON v.SKU = l.SKU
    WHERE l.Orden = @Orden
    ORDER BY v.IDVariante;

    IF @@ROWCOUNT <> (SELECT COUNT(*) FROM @Linea WHERE Orden = @Orden)
        THROW 50000, N'Semilla: un SKU de los pedidos de ejemplo no existe.', 1;

    -- Reservar y pagar
    SELECT @MaxRes = ISNULL(MAX(IDReservaExistencia), 0) FROM dbo.ReservaExistencia;
    SELECT @MaxHist = ISNULL(MAX(IDHistorialEstadoPedido), 0) FROM dbo.HistorialEstadoPedido;
    SELECT @MaxMov = ISNULL(MAX(IDMovimientoInventario), 0) FROM dbo.MovimientoInventario;
    SELECT @MaxBit = ISNULL(MAX(IDBitacora), 0) FROM dbo.Bitacora;

    EXEC dbo.SP_Inventario_ReservarExistencia @IDUsuarioSolicitante = @IDCliente, @IDDireccion = @IDDireccion,
                                              @IDMetodoEnvio = @IDEnvio;

    EXEC dbo.SP_Pedidos_CrearPedido @IDUsuarioSolicitante = @IDCliente, @ClaveIdempotencia = @Clave,
                                    @IDDireccion = @IDDireccion, @IDMetodoEnvio = @IDEnvio,
                                    @MetodoPago = N'TARJETA', @TitularTarjeta = N'Diego Ramírez',
                                    @UltimosTarjeta = '4242';

    SELECT @IDPedido = IDPedido FROM dbo.Pedido WHERE ClaveIdempotencia = @Clave;

    -- Fecha de creación: pedido, pago, uso de cupón, reserva confirmada, historial, kardex y bitácora del pago
    UPDATE dbo.Pedido SET FechaCreacion = @Fecha WHERE IDPedido = @IDPedido;
    UPDATE dbo.Pago SET Fecha = @Fecha WHERE IDPedido = @IDPedido;
    UPDATE dbo.UsoCupon SET Fecha = @Fecha WHERE IDPedido = @IDPedido;
    UPDATE dbo.ReservaExistencia
    SET FechaCreacion = DATEADD(MINUTE, -5, @Fecha), FechaExpiracion = DATEADD(MINUTE, 10, @Fecha)
    WHERE IDReservaExistencia > @MaxRes;
    UPDATE dbo.HistorialEstadoPedido SET Fecha = @Fecha WHERE IDHistorialEstadoPedido > @MaxHist;
    UPDATE dbo.MovimientoInventario SET Fecha = @Fecha WHERE IDMovimientoInventario > @MaxMov;
    UPDATE dbo.Bitacora SET Fecha = @Fecha WHERE IDBitacora > @MaxBit;
    UPDATE dbo.Carrito SET FechaUltimaActividad = @Fecha WHERE IDCarrito = @IDCarrito;

    -- Pasos posteriores
    SET @Secuencia = 0;
    WHILE 1 = 1
    BEGIN
        SELECT TOP (1) @Secuencia = Secuencia, @Accion = Accion, @Estado = Estado,
               @Minutos = MinutosDespues, @Comentario = Comentario
        FROM @Paso
        WHERE Orden = @Orden AND Secuencia > @Secuencia
        ORDER BY Secuencia;

        IF @@ROWCOUNT = 0
            BREAK;

        SET @FechaPaso = DATEADD(MINUTE, @Minutos, @Fecha);

        SELECT @MaxHist = ISNULL(MAX(IDHistorialEstadoPedido), 0) FROM dbo.HistorialEstadoPedido;
        SELECT @MaxMov = ISNULL(MAX(IDMovimientoInventario), 0) FROM dbo.MovimientoInventario;
        SELECT @MaxBit = ISNULL(MAX(IDBitacora), 0) FROM dbo.Bitacora;
        SELECT @MaxDev = ISNULL(MAX(IDDevolucion), 0) FROM dbo.Devolucion;

        IF @Accion = N'ESTADO'
            EXEC dbo.SP_Pedidos_CambiarEstado @IDUsuarioSolicitante = @IDOperador, @IDPedido = @IDPedido,
                                              @CodigoEstado = @Estado, @Comentario = @Comentario;
        ELSE IF @Accion = N'CANCELAR'
            EXEC dbo.SP_Pedidos_Cancelar @IDUsuarioSolicitante = @IDCliente, @IDPedido = @IDPedido,
                                         @Motivo = @Comentario;
        ELSE
        BEGIN
            SET @Lineas = (SELECT pd.IDPedidoDetalle AS idPedidoDetalle, l.Devolver AS cantidad
                           FROM @Linea AS l
                           INNER JOIN dbo.PedidoDetalle AS pd ON pd.IDPedido = @IDPedido AND pd.SKU = l.SKU
                           WHERE l.Orden = @Orden AND l.Devolver IS NOT NULL
                           ORDER BY pd.IDPedidoDetalle
                           FOR JSON PATH);

            EXEC dbo.SP_Pedidos_RegistrarDevolucion @IDUsuarioSolicitante = @IDOperador, @IDPedido = @IDPedido,
                                                    @Motivo = @Comentario, @Lineas = @Lineas;
        END;

        UPDATE dbo.HistorialEstadoPedido SET Fecha = @FechaPaso WHERE IDHistorialEstadoPedido > @MaxHist;
        UPDATE dbo.MovimientoInventario SET Fecha = @FechaPaso WHERE IDMovimientoInventario > @MaxMov;
        UPDATE dbo.Bitacora SET Fecha = @FechaPaso WHERE IDBitacora > @MaxBit;
        UPDATE dbo.Devolucion SET Fecha = @FechaPaso WHERE IDDevolucion > @MaxDev;
    END;
END;

-- El inventario inicial de las variantes vendidas pasa a 30 días atrás: el kardex queda en orden cronológico.
UPDATE dbo.MovimientoInventario
SET Fecha = DATEADD(DAY, -30, @Hoy)
WHERE Motivo = N'Inventario inicial (datos semilla)'
  AND IDVariante IN (SELECT IDVariante FROM dbo.PedidoDetalle);

ENABLE TRIGGER dbo.TR_Bitacora_ImpedirCambios ON dbo.Bitacora;
ENABLE TRIGGER dbo.TR_Inventario_ImpedirCambiosKardex ON dbo.MovimientoInventario;

-- Comprobación: cada saldo coincide con su fuente.
IF EXISTS (
    SELECT 1
    FROM dbo.Variante AS v
    OUTER APPLY (SELECT SUM(Signo * Cantidad) AS Saldo FROM dbo.MovimientoInventario WHERE IDVariante = v.IDVariante) AS k
    OUTER APPLY (SELECT SUM(Cantidad) AS Reservada FROM dbo.ReservaExistencia WHERE IDVariante = v.IDVariante AND Estado = N'ACTIVA') AS r
    WHERE v.ExistenciaFisica <> ISNULL(k.Saldo, 0)
       OR v.ExistenciaReservada <> ISNULL(r.Reservada, 0)
)
    THROW 50000, N'Semilla: una existencia no coincide con el kardex o con las reservas.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.Cupon AS c
    WHERE c.Codigo <> N'AGOTADO5'
      AND c.UsosActuales <> (SELECT COUNT(*) FROM dbo.UsoCupon WHERE IDCupon = c.IDCupon)
)
    THROW 50000, N'Semilla: UsosActuales de un cupón no coincide con UsoCupon.', 1;

COMMIT TRANSACTION;
GO

-- ===== 100_sucursales.sql =====
/*
    100_sucursales.sql
    Esquema, datos y ajuste de pedidos para la funcionalidad de sucursales de retiro.

    Es un script INCREMENTAL: se aplica sobre una base creada con 001-090 sin borrar datos, y también forma
    parte de una instalación nueva (corre después de 090). Es idempotente: cada paso comprueba si ya se
    hizo, así que puede ejecutarse cualquier número de veces. docker-init.sh lo ejecuta siempre, incluso
    cuando la base ya existe. Se recomienda un respaldo antes de actualizar (BACKUP DATABASE).

    Una sola transacción con XACT_ABORT ON: si algo falla no queda nada a medias.

    Pasos:
      1. Tabla Sucursal.
      2. MetodoEnvio.RequiereSucursal y su UNIQUE (destino de la FK compuesta de Pedido).
      3. Método "Recoger en sucursal": renombra "Recoger en tienda" (conserva su ID y sus pedidos) o lo inserta.
      4. Sucursales de ejemplo (una por Nombre, solo si no existen).
      5. Pedido.IDSucursal y Pedido.RetiroEnSucursal.
      6. Pedido.IDDireccion admite NULL (retiro en sucursal).
      7. Pedidos existentes: RetiroEnSucursal sale del método; los retiros que no tenían sucursal pasan a
         "Sucursal Zona 10" con IDDireccion = NULL. DireccionEntrega no se toca: es la copia histórica.
      8. RetiroEnSucursal NOT NULL.
      9. FK_Pedido_MetodoEnvio compuesta (IDMetodoEnvio, RetiroEnSucursal).
     10. FK_Pedido_Sucursal, CK_Pedido_Entrega e IX_Pedido_IDSucursal.

    TR_Pedidos_ValidarTransicion no interviene: no se actualiza IDEstadoPedido.
    Las columnas recién agregadas se referencian con EXEC(N'…'), porque el lote se compila entero antes de
    ejecutarse y todavía no existen.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Sucursal donde el cliente puede recoger su pedido (método de envío con RequiereSucursal = 1).
    --    Se desactiva en lugar de borrarse cuando ya tiene pedidos; el pedido guarda además una copia
    --    textual de su dirección en DireccionEntrega.
    IF OBJECT_ID(N'dbo.Sucursal', N'U') IS NULL
    BEGIN
        EXEC(N'
        CREATE TABLE dbo.Sucursal (
            IDSucursal        INT IDENTITY(1,1) NOT NULL,
            Nombre            NVARCHAR(100)     NOT NULL,
            Telefono          NVARCHAR(20)      NOT NULL,
            Linea1            NVARCHAR(200)     NOT NULL,
            Linea2            NVARCHAR(200)     NULL,
            Municipio         NVARCHAR(100)     NOT NULL,
            Departamento      NVARCHAR(100)     NOT NULL,
            CodigoPostal      NVARCHAR(10)      NULL,
            Horario           NVARCHAR(200)     NULL,
            Activo            BIT               NOT NULL CONSTRAINT DF_Sucursal_Activo DEFAULT (1),
            FechaCreacion     DATETIME2(3)      NOT NULL CONSTRAINT DF_Sucursal_FechaCreacion DEFAULT (SYSUTCDATETIME()),
            FechaModificacion DATETIME2(3)      NOT NULL CONSTRAINT DF_Sucursal_FechaModificacion DEFAULT (SYSUTCDATETIME()),
            CONSTRAINT PK_Sucursal PRIMARY KEY (IDSucursal),
            CONSTRAINT UQ_Sucursal_Nombre UNIQUE (Nombre)
        );');
    END;

    -- 2. MetodoEnvio.RequiereSucursal: 1 = el cliente recoge el pedido en una sucursal y no necesita dirección.
    IF COL_LENGTH(N'dbo.MetodoEnvio', N'RequiereSucursal') IS NULL
    BEGIN
        EXEC(N'ALTER TABLE dbo.MetodoEnvio ADD RequiereSucursal BIT NOT NULL
                   CONSTRAINT DF_MetodoEnvio_RequiereSucursal DEFAULT (0);');
    END;

    -- Destino de la FK compuesta de Pedido: RetiroEnSucursal siempre coincide con el método elegido.
    IF NOT EXISTS (SELECT 1 FROM sys.key_constraints
                   WHERE name = N'UQ_MetodoEnvio_IDMetodoEnvio_RequiereSucursal'
                     AND parent_object_id = OBJECT_ID(N'dbo.MetodoEnvio'))
    BEGIN
        EXEC(N'ALTER TABLE dbo.MetodoEnvio ADD CONSTRAINT UQ_MetodoEnvio_IDMetodoEnvio_RequiereSucursal
                   UNIQUE (IDMetodoEnvio, RequiereSucursal);');
    END;

    -- 3. Método de envío con retiro: se renombra el de la versión anterior para conservar su ID y sus pedidos.
    IF EXISTS (SELECT 1 FROM dbo.MetodoEnvio WHERE Nombre = N'Recoger en tienda')
       AND NOT EXISTS (SELECT 1 FROM dbo.MetodoEnvio WHERE Nombre = N'Recoger en sucursal')
    BEGIN
        UPDATE dbo.MetodoEnvio SET Nombre = N'Recoger en sucursal' WHERE Nombre = N'Recoger en tienda';
    END;

    EXEC(N'
    UPDATE dbo.MetodoEnvio SET RequiereSucursal = 1
    WHERE Nombre = N''Recoger en sucursal'' AND RequiereSucursal = 0;

    IF NOT EXISTS (SELECT 1 FROM dbo.MetodoEnvio WHERE Nombre = N''Recoger en sucursal'')
        INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimados, RequiereSucursal)
        VALUES (N''Recoger en sucursal'', 0.00, 0, 1);');

    -- 4. Sucursales de retiro: departamento y municipio existen en el catálogo del frontend
    --    (guatemala-locations.json). Sucursal Antigua está inactiva: no se ofrece en el checkout.
    --    Los teléfonos llevan solo dígitos, porque la API rechaza los guiones.
    IF NOT EXISTS (SELECT 1 FROM dbo.Sucursal WHERE Nombre = N'Sucursal Zona 10')
        INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario, Activo)
        VALUES (N'Sucursal Zona 10', N'24001010', N'6a Avenida 12-34, Zona 10', N'Edificio Plaza Fontabella, local 5',
                N'Guatemala', N'Guatemala', N'01010', N'Lunes a sábado de 9:00 a 19:00', 1);

    IF NOT EXISTS (SELECT 1 FROM dbo.Sucursal WHERE Nombre = N'Sucursal Zona 1')
        INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario, Activo)
        VALUES (N'Sucursal Zona 1', N'24001001', N'7a Avenida 8-25, Zona 1', NULL,
                N'Guatemala', N'Guatemala', N'01001', N'Lunes a sábado de 9:00 a 18:00', 1);

    IF NOT EXISTS (SELECT 1 FROM dbo.Sucursal WHERE Nombre = N'Sucursal Mixco')
        INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario, Activo)
        VALUES (N'Sucursal Mixco', N'24001020', N'Calzada Roosevelt 15-60, Zona 3 de Mixco', N'Centro Comercial Mixco, local 12',
                N'Mixco', N'Guatemala', N'01057', N'Todos los días de 10:00 a 20:00', 1);

    IF NOT EXISTS (SELECT 1 FROM dbo.Sucursal WHERE Nombre = N'Sucursal Antigua')
        INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario, Activo)
        VALUES (N'Sucursal Antigua', N'24001030', N'4a Calle Poniente 14', NULL,
                N'Antigua Guatemala', N'Sacatepéquez', N'03001', N'Lunes a viernes de 9:00 a 17:00', 0);

    -- 5. Pedido: sucursal de retiro y copia de MetodoEnvio.RequiereSucursal (RetiroEnSucursal queda NULL
    --    hasta el paso 7 para poder rellenarla en las filas existentes).
    IF COL_LENGTH(N'dbo.Pedido', N'IDSucursal') IS NULL
        EXEC(N'ALTER TABLE dbo.Pedido ADD IDSucursal INT NULL;');   -- NULL cuando el pedido es a domicilio

    IF COL_LENGTH(N'dbo.Pedido', N'RetiroEnSucursal') IS NULL
        EXEC(N'ALTER TABLE dbo.Pedido ADD RetiroEnSucursal BIT NULL;');

    -- 6. IDDireccion admite NULL (cuando el cliente recoge en sucursal). Su FK compuesta se recrea.
    IF COLUMNPROPERTY(OBJECT_ID(N'dbo.Pedido'), N'IDDireccion', N'AllowsNull') = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM sys.foreign_keys
                   WHERE name = N'FK_Pedido_Direccion' AND parent_object_id = OBJECT_ID(N'dbo.Pedido'))
            ALTER TABLE dbo.Pedido DROP CONSTRAINT FK_Pedido_Direccion;

        ALTER TABLE dbo.Pedido ALTER COLUMN IDDireccion INT NULL;
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
                   WHERE name = N'FK_Pedido_Direccion' AND parent_object_id = OBJECT_ID(N'dbo.Pedido'))
    BEGIN
        -- La dirección de entrega es del mismo cliente del pedido.
        ALTER TABLE dbo.Pedido ADD CONSTRAINT FK_Pedido_Direccion
            FOREIGN KEY (IDDireccion, IDUsuario) REFERENCES dbo.Direccion (IDDireccion, IDUsuario);
    END;

    -- 7. Pedidos existentes.
    EXEC(N'
    UPDATE p SET p.RetiroEnSucursal = m.RequiereSucursal
    FROM dbo.Pedido AS p
    INNER JOIN dbo.MetodoEnvio AS m ON m.IDMetodoEnvio = p.IDMetodoEnvio
    WHERE p.RetiroEnSucursal IS NULL;');

    -- Los retiros sin sucursal (pedidos hechos antes de esta funcionalidad) pasan a Sucursal Zona 10 y pierden
    -- la dirección; DireccionEntrega conserva la copia histórica.
    DECLARE @IDSucursalZona10 INT = (SELECT IDSucursal FROM dbo.Sucursal WHERE Nombre = N'Sucursal Zona 10');
    DECLARE @RetirosPorMigrar INT;
    EXEC sp_executesql
        N'SELECT @n = COUNT(*) FROM dbo.Pedido WHERE RetiroEnSucursal = 1 AND IDSucursal IS NULL;',
        N'@n INT OUTPUT', @n = @RetirosPorMigrar OUTPUT;

    IF @RetirosPorMigrar > 0 AND @IDSucursalZona10 IS NULL
        THROW 50000, N'100_sucursales: hay pedidos de retiro por migrar y no existe la sucursal "Sucursal Zona 10".', 1;

    IF @RetirosPorMigrar > 0
        EXEC sp_executesql
            N'UPDATE dbo.Pedido SET IDSucursal = @s, IDDireccion = NULL
              WHERE RetiroEnSucursal = 1 AND IDSucursal IS NULL;',
            N'@s INT', @s = @IDSucursalZona10;

    -- 8. Todo pedido ya tiene su valor.
    IF COLUMNPROPERTY(OBJECT_ID(N'dbo.Pedido'), N'RetiroEnSucursal', N'AllowsNull') = 1
        EXEC(N'ALTER TABLE dbo.Pedido ALTER COLUMN RetiroEnSucursal BIT NOT NULL;');

    -- 9. Con una sucursal el pedido usa un método que la requiere, y a domicilio uno que no.
    IF EXISTS (SELECT 1 FROM sys.foreign_key_columns
               WHERE constraint_object_id = OBJECT_ID(N'dbo.FK_Pedido_MetodoEnvio')
               GROUP BY constraint_object_id HAVING COUNT(*) = 1)
        ALTER TABLE dbo.Pedido DROP CONSTRAINT FK_Pedido_MetodoEnvio;

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
                   WHERE name = N'FK_Pedido_MetodoEnvio' AND parent_object_id = OBJECT_ID(N'dbo.Pedido'))
        EXEC(N'ALTER TABLE dbo.Pedido ADD CONSTRAINT FK_Pedido_MetodoEnvio
                   FOREIGN KEY (IDMetodoEnvio, RetiroEnSucursal)
                   REFERENCES dbo.MetodoEnvio (IDMetodoEnvio, RequiereSucursal);');

    -- 10. Destino y restricciones.
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
                   WHERE name = N'FK_Pedido_Sucursal' AND parent_object_id = OBJECT_ID(N'dbo.Pedido'))
        EXEC(N'ALTER TABLE dbo.Pedido ADD CONSTRAINT FK_Pedido_Sucursal
                   FOREIGN KEY (IDSucursal) REFERENCES dbo.Sucursal (IDSucursal);');

    -- Exactamente un destino: dirección del cliente (domicilio) o sucursal (retiro).
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_Pedido_Entrega' AND parent_object_id = OBJECT_ID(N'dbo.Pedido'))
        EXEC(N'ALTER TABLE dbo.Pedido ADD CONSTRAINT CK_Pedido_Entrega CHECK (
                   (RetiroEnSucursal = 0 AND IDDireccion IS NOT NULL AND IDSucursal IS NULL)
                   OR (RetiroEnSucursal = 1 AND IDSucursal IS NOT NULL AND IDDireccion IS NULL));');

    IF NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = N'IX_Pedido_IDSucursal' AND object_id = OBJECT_ID(N'dbo.Pedido'))
        EXEC(N'CREATE INDEX IX_Pedido_IDSucursal ON dbo.Pedido (IDSucursal) WHERE IDSucursal IS NOT NULL;');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

-- ===== 101_sp_sucursales.sql =====
/*
    101_sp_sucursales.sql
    Stored procedures de las sucursales de retiro. Script incremental: se aplica sobre una base creada con
    001-090 (después de 100_sucursales.sql, que crea el esquema) y también forma parte de una instalación nueva.
    Es idempotente: solo usa CREATE OR ALTER.

    Contiene los SPs nuevos y la versión actual de los que cambiaron:
      * SP_Checkout_ResolverEntrega (nuevo; va primero porque lo invocan los demás).
      * SP_Checkout_ListarMetodosEnvio, SP_Inventario_ReservarExistencia, SP_Pedidos_CrearPedido y
        SP_Pedidos_ObtenerPorId (modificados: aceptan @IDSucursal o devuelven la sucursal).
      * SP_Catalogo_ListarSucursales y SP_Sucursales_* (nuevos).

    Una sucursal es el destino de un pedido con un método de envío que requiere sucursal
    (MetodoEnvio.RequiereSucursal = 1, "Recoger en sucursal"). El pedido guarda IDSucursal y una copia
    textual de su dirección en DireccionEntrega (SP_Checkout_ResolverEntrega), así que editar o desactivar
    una sucursal no altera pedidos ya hechos.

    Reglas de las sucursales:
      * El catálogo público solo muestra sucursales activas. Una inactiva no se ofrece en el checkout.
      * Los SPs que escriben reciben @IDUsuarioSolicitante (sale del JWT; el backend exige el rol
        Administrador, igual que con las categorías), validan antes de escribir, bloquean la sucursal con
        UPDLOCK, ROWLOCK y registran la Bitacora (Modulo 'Sucursales', Entidad 'Sucursal') en la misma
        transacción.
      * Un nombre repetido no tiene THROW propio: termina en 2627 (UQ_Sucursal_Nombre) → DUPLICADO,
        como el nombre de categoría.
      * Una sucursal con pedidos no se elimina (50051); se desactiva. Los pedidos nuevos no pueden
        crearse contra una sucursal que se está eliminando porque CrearPedido solo lee Sucursal sin
        bloquearla: la FK FK_Pedido_Sucursal rechazaría el INSERT (el pedido se revertiría completo).
      * Orden de bloqueo: Sucursal (única tabla que bloquea). No toca variantes ni reservas.

    Listado: @Pagina (desde 1), @TamanoPagina (1 a 100) y @Orden 'campo:asc|desc' sobre una lista blanca
    con CASE (nunca concatenado). Devuelve las filas y luego un result set con Total.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (SP_Usuarios_ValidarSolicitante)
      50051  EN_USO
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

-- Sin endpoint: decide a dónde se entrega un pedido y cuánto cuesta el envío. Lo llaman
-- SP_Inventario_ReservarExistencia y SP_Pedidos_CrearPedido dentro de su transacción (sin TRAN propio, como
-- SP_Usuarios_ValidarSolicitante). No escribe ni bloquea: solo lee MetodoEnvio, Sucursal y Direccion.
--   @IDMetodoEnvio   método de envío activo; si no, 50004
--   @IDDireccion     OUTPUT. Con método a domicilio: dirección activa del solicitante (NULL → 50001; ajena,
--                    inactiva o inexistente → 50004). Con retiro en sucursal se ignora y sale NULL.
--   @IDSucursal      OUTPUT. Con retiro en sucursal: sucursal activa (NULL → 50001; inexistente o inactiva → 50004).
--                    Con envío a domicilio se ignora y sale NULL.
--   @RequiereSucursal, @CostoEnvio  OUTPUT: los del método.
--   @DireccionEntrega OUTPUT: copia textual (máx. 800).
--       domicilio: "Nombre, línea 1, línea 2, municipio, departamento CP. Tel: … Ref: …"
--       retiro:    "Recoger en <sucursal>: línea 1, línea 2, municipio, departamento CP. Tel: … Horario: …"
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_ResolverEntrega
    @IDUsuarioSolicitante INT,
    @IDMetodoEnvio        INT,
    @IDDireccion          INT           OUTPUT,
    @IDSucursal           INT           OUTPUT,
    @RequiereSucursal     BIT           OUTPUT,
    @CostoEnvio           DECIMAL(12,2) OUTPUT,
    @DireccionEntrega     NVARCHAR(800) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SET @RequiereSucursal = NULL;
    SET @CostoEnvio = NULL;
    SET @DireccionEntrega = NULL;

    SELECT @RequiereSucursal = RequiereSucursal, @CostoEnvio = Costo
    FROM dbo.MetodoEnvio
    WHERE IDMetodoEnvio = @IDMetodoEnvio AND Activo = 1;

    IF @RequiereSucursal IS NULL
        THROW 50004, N'El método de envío no existe o no está disponible.', 1;

    IF @RequiereSucursal = 1
    BEGIN
        SET @IDDireccion = NULL;

        IF @IDSucursal IS NULL
            THROW 50001, N'Elige la sucursal donde recogerás tu pedido.', 1;

        SELECT @DireccionEntrega = LEFT(CONCAT(
                   N'Recoger en ', s.Nombre, N': ', s.Linea1, ISNULL(N', ' + s.Linea2, N''), N', ', s.Municipio, N', ',
                   s.Departamento, ISNULL(N' ' + s.CodigoPostal, N''), N'. Tel: ', s.Telefono,
                   ISNULL(N'. Horario: ' + s.Horario, N'')), 800)
        FROM dbo.Sucursal AS s
        WHERE s.IDSucursal = @IDSucursal AND s.Activo = 1;

        IF @DireccionEntrega IS NULL
            THROW 50004, N'La sucursal no existe o no está disponible.', 1;
    END
    ELSE
    BEGIN
        SET @IDSucursal = NULL;

        IF @IDDireccion IS NULL
            THROW 50001, N'Elige una dirección de entrega.', 1;

        SELECT @DireccionEntrega = LEFT(CONCAT(
                   d.NombreDestinatario, N', ', d.Linea1, ISNULL(N', ' + d.Linea2, N''), N', ', d.Municipio, N', ',
                   d.Departamento, ISNULL(N' ' + d.CodigoPostal, N''), N'. Tel: ', d.Telefono,
                   ISNULL(N'. Ref: ' + d.Referencias, N'')), 800)
        FROM dbo.Direccion AS d
        WHERE d.IDDireccion = @IDDireccion AND d.IDUsuario = @IDUsuarioSolicitante AND d.Activo = 1;

        IF @DireccionEntrega IS NULL
            THROW 50004, N'La dirección no existe.', 1;
    END;
END;
GO

/* =========================================================
   Checkout
   ========================================================= */

-- GET /api/metodos-envio: métodos de envío activos, del más barato al más caro.
-- Fila: IDMetodoEnvio INT, Nombre NVARCHAR(100), Costo DECIMAL(12,2), DiasEstimados TINYINT, RequiereSucursal BIT
-- (1 = el cliente elige una sucursal en lugar de una dirección).
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_ListarMetodosEnvio
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        IDMetodoEnvio,
        Nombre,
        Costo,
        DiasEstimados,
        RequiereSucursal
    FROM dbo.MetodoEnvio
    WHERE Activo = 1
    ORDER BY Costo, Nombre;
END;
GO

-- POST /api/checkout/iniciar: reserva la existencia de cada línea del carrito del cliente por
-- Configuracion.MinutosReserva (15 si falta o no es un entero entre 1 y 1440) y devuelve el resumen.
--   @IDMetodoEnvio  método de envío activo; si no, 50004
--   @IDDireccion    con un método a domicilio: dirección del propio cliente y activa (falta → 50001; si no, 50004).
--                   Con un método que requiere sucursal se ignora.
--   @IDSucursal     con un método que requiere sucursal: sucursal activa (falta → 50001; si no, 50004).
--                   Con un método a domicilio se ignora.
-- Validaciones, en orden: solicitante (50004/50012), método y destino (SP_Checkout_ResolverEntrega: 50004/50001),
-- carrito vacío (50001),
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
    @IDDireccion          INT = NULL,
    @IDMetodoEnvio        INT,
    @IDSucursal           INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3);
    DECLARE @RequiereSucursal BIT, @CostoEnvio DECIMAL(12,2), @DireccionEntrega NVARCHAR(800);
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

        EXEC dbo.SP_Checkout_ResolverEntrega @IDUsuarioSolicitante, @IDMetodoEnvio, @IDDireccion OUTPUT,
                                             @IDSucursal OUTPUT, @RequiereSucursal OUTPUT, @CostoEnvio OUTPUT,
                                             @DireccionEntrega OUTPUT;

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

-- POST /api/checkout/pagar: pago simulado y creación atómica del pedido.
--   @ClaveIdempotencia  header Idempotency-Key (UUID)
--   @IDDireccion, @IDSucursal, @IDMetodoEnvio  los elegidos en "iniciar" (no se guardan en la reserva; el body de pagar
--                       los lleva). Con un método que requiere sucursal (MetodoEnvio.RequiereSucursal = 1) solo cuenta
--                       @IDSucursal y @IDDireccion se ignora (el pedido queda con IDDireccion NULL); con un método a
--                       domicilio ocurre lo contrario. Se normaliza ANTES de calcular las huellas, leyendo el método
--                       sin filtrar Activo (así una repetición sigue siendo válida si luego se desactiva el método).
--                       Falta lo que corresponde → 50001; sucursal o dirección inválida → 50004 (SP_Checkout_ResolverEntrega).
--   @MetodoPago         solo 'TARJETA' (si no, 50001)
--   @TitularTarjeta     obligatorio; la tabla Pago no guarda datos de tarjeta (solo TarjetaGuardada, si se pide)
--   @UltimosTarjeta     4 dígitos; '0000' es el rechazo simulado (50020)
--   @IDTarjetaGuardada  opcional: paga con una tarjeta guardada del solicitante. Su titular y últimos 4 reemplazan
--                       a @TitularTarjeta y @UltimosTarjeta ANTES de la huella y de la regla 0000, así que esa lógica
--                       no cambia. Ajena o inexistente → 50004; junto con @GuardarTarjeta = 1 → 50001.
--   @TipoTarjeta, @MarcaTarjeta  CREDITO|DEBITO y VISA|MASTERCARD|AMEX|OTRA; obligatorios solo con @GuardarTarjeta = 1 (50001)
--   @GuardarTarjeta     1 guarda la tarjeta nueva DESPUÉS de aprobar el pago, en la misma transacción y solo si
--                       Repetido = 0 (una repetición con la misma clave no guarda nada). Si el cliente ya la tiene
--                       (UQ_TarjetaGuardada_Tarjeta) no hace nada; si es su primera, queda predeterminada. Se inserta
--                       aquí y no con SP_Tarjetas_Crear: un SP anidado con su propio TRAN/CATCH revertiría el pedido.
--                       Bitácora CREAR de la tarjeta (Modulo 'Tarjetas').
--   La huella no incluye tarjeta guardada, tipo, marca ni guardar (sigue siendo T=<ultimos4>).
-- Idempotencia: HuellaSolicitud = SHA-256 en hexadecimal (mayúsculas) de un texto canónico calculado aquí:
--   D=<IDDireccion>;E=<IDMetodoEnvio>[;S=<IDSucursal>];P=<MetodoPago>;T=<UltimosTarjeta>;C=<IDCupon o vacío>;L=<IDVariante>x<Cantidad>,…
-- (";S=<IDSucursal>" solo aparece cuando hay sucursal, así la huella de un envío a domicilio no cambia)
-- con las líneas ordenadas por IDVariante. Un bloqueo de aplicación exclusivo por clave (sp_getapplock,
-- al inicio de la transacción) serializa las peticiones simultáneas con la misma clave: la segunda espera,
-- ve el pedido ya confirmado y lo devuelve; no depende de capturar el 2627 de UQ_Pedido_ClaveIdempotencia.
-- Si esperar más de 15 s → 50021 (reintenta). Si la clave ya existe:
--   · es de otro usuario → 50021 (sin revelar el pedido ajeno);
--   · si el cliente tiene un carrito ACTIVO con líneas se compara la huella de (parámetros + ese carrito y su cupón);
--     si no, la de (parámetros + las líneas y el cupón del pedido, porque su carrito se convirtió con él);
--   · igual a la guardada → devuelve el pedido existente con Repetido = 1 (el backend responde 200); distinta → 50021.
-- Clave nueva: requiere carrito con líneas y una reserva ACTIVA no vencida que cubra exactamente cada una
-- (FU_Checkout_EstadoReserva), si no 50031; línea no vendible → 50001; cupón revalidado con FU_Cupones_Validar
-- bajo bloqueo del cupón (50060–50067, incluido 50065 por cliente); tarjeta 0000 → 50020 antes de escribir nada,
-- por lo que la reserva sigue vigente (todo se revierte).
-- En una transacción: Pedido (NumeroPedido SC-<año>-<IDPedido a 6 dígitos>, DireccionEntrega = copia textual
-- "Nombre, línea 1, línea 2, municipio, departamento CP. Tel: … Ref: …" o, con retiro, "Recoger en <sucursal>: …"
-- (máx. 800), IDSucursal y RetiroEnSucursal, PedidoDetalle con SKU,
-- nombre, descripción, precio unitario y descuento de línea congelados, kardex SALIDA_VENTA por línea (baja
-- ExistenciaFisica y ExistenciaReservada), reservas CONFIRMADA, UsoCupon y UsosActuales + 1 (UPDATE condicional;
-- 0 filas → 50064), Pago APROBADO (referencia simulada SIM-<hex>), HistorialEstadoPedido inicial (PAGADO) a nombre
-- del cliente, carrito CONVERTIDO y bitácora CREAR del pedido.
-- El precio es el vigente al pagar (si cambió desde "iniciar", el pedido congela el nuevo).
-- Resultado (una fila): IDPedido INT, NumeroPedido NVARCHAR(20), Estado NVARCHAR(30) (código actual),
-- Total DECIMAL(12,2), Repetido BIT, IDTarjetaGuardada INT (la tarjeta usada, la recién guardada o la que ya
-- existía al guardar; NULL si no se usó ni se guardó ninguna, y en una repetición con @GuardarTarjeta).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_CrearPedido
    @IDUsuarioSolicitante INT,
    @ClaveIdempotencia    UNIQUEIDENTIFIER,
    @IDDireccion          INT           = NULL,
    @IDMetodoEnvio        INT,
    @MetodoPago           NVARCHAR(20),
    @TitularTarjeta       NVARCHAR(150),
    @UltimosTarjeta       CHAR(4),
    @IDTarjetaGuardada    INT           = NULL,
    @TipoTarjeta          NVARCHAR(10)  = NULL,
    @MarcaTarjeta         NVARCHAR(20)  = NULL,
    @GuardarTarjeta       BIT           = 0,
    @IDSucursal           INT           = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3);
    DECLARE @Recurso NVARCHAR(255), @Resultado INT;
    DECLARE @IDPedido INT, @IDUsuarioPedido INT, @HuellaGuardada CHAR(64), @IDCuponPedido INT;
    DECLARE @Repetido BIT = 0;
    DECLARE @IDCarrito INT, @IDCuponCarrito INT, @IDCuponAplicado INT;
    DECLARE @Error INT, @Mensaje NVARCHAR(2048), @Skus NVARCHAR(MAX);
    DECLARE @Lineas NVARCHAR(MAX), @Huella CHAR(64);
    DECLARE @IDVariante INT, @Bloqueada INT;
    DECLARE @CostoEnvio DECIMAL(12,2), @RequiereSucursal BIT;
    DECLARE @Subtotal DECIMAL(12,2), @Descuento DECIMAL(12,2), @Total DECIMAL(12,2), @MontoIVA DECIMAL(12,2);
    DECLARE @IDEstadoPagado INT, @IDTipoVenta INT, @SignoVenta SMALLINT;
    DECLARE @NumeroPedido NVARCHAR(20), @Direccion NVARCHAR(800), @Nuevo NVARCHAR(MAX);
    DECLARE @IDTarjetaResultado INT, @NuevaTarjeta NVARCHAR(MAX), @Predeterminar BIT;
    DECLARE @Bloqueo TABLE (IDVariante INT NOT NULL PRIMARY KEY);
    DECLARE @Linea TABLE (
        IDCarritoDetalle    INT           NOT NULL PRIMARY KEY,
        IDVariante          INT           NOT NULL,
        Cantidad            INT           NOT NULL,
        PrecioUnitario      DECIMAL(12,2) NOT NULL,
        Importe             DECIMAL(12,2) NOT NULL,
        DescuentoLinea      DECIMAL(12,2) NOT NULL,
        ImporteNeto         DECIMAL(12,2) NOT NULL,
        SKU                 NVARCHAR(50)  NOT NULL,
        NombreProducto      NVARCHAR(150) NOT NULL,
        DescripcionVariante NVARCHAR(200) NOT NULL,
        Vendible            BIT           NOT NULL
    );

    SET @MetodoPago = UPPER(NULLIF(TRIM(@MetodoPago), N''));
    SET @TitularTarjeta = NULLIF(TRIM(@TitularTarjeta), N'');
    SET @TipoTarjeta = UPPER(NULLIF(TRIM(@TipoTarjeta), N''));
    SET @MarcaTarjeta = UPPER(NULLIF(TRIM(@MarcaTarjeta), N''));
    SET @GuardarTarjeta = ISNULL(@GuardarTarjeta, 0);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar los datos de la petición
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @ClaveIdempotencia IS NULL
            THROW 50001, N'La clave de idempotencia es obligatoria.', 1;

        IF @MetodoPago IS NULL OR @MetodoPago <> N'TARJETA'
            THROW 50001, N'El método de pago solo puede ser TARJETA.', 1;

        -- Tarjeta guardada: su titular y últimos 4 fijan los del pago antes de la huella y de la regla 0000.
        IF @IDTarjetaGuardada IS NOT NULL
        BEGIN
            IF @GuardarTarjeta = 1
                THROW 50001, N'No se puede guardar una tarjeta cuando se paga con una tarjeta guardada.', 1;

            SELECT @TitularTarjeta = Titular, @UltimosTarjeta = Ultimos4, @IDTarjetaResultado = IDTarjetaGuardada
            FROM dbo.TarjetaGuardada
            WHERE IDTarjetaGuardada = @IDTarjetaGuardada AND IDUsuario = @IDUsuarioSolicitante;

            IF @IDTarjetaResultado IS NULL
                THROW 50004, N'La tarjeta guardada no existe.', 1;
        END;

        IF @GuardarTarjeta = 1
        BEGIN
            IF @TipoTarjeta IS NULL OR @TipoTarjeta NOT IN (N'CREDITO', N'DEBITO')
                THROW 50001, N'Para guardar la tarjeta, el tipo debe ser CREDITO o DEBITO.', 1;

            IF @MarcaTarjeta IS NULL OR @MarcaTarjeta NOT IN (N'VISA', N'MASTERCARD', N'AMEX', N'OTRA')
                THROW 50001, N'Para guardar la tarjeta, la marca debe ser VISA, MASTERCARD, AMEX u OTRA.', 1;
        END;

        IF @TitularTarjeta IS NULL
            THROW 50001, N'El titular de la tarjeta es obligatorio.', 1;

        IF @UltimosTarjeta IS NULL OR @UltimosTarjeta NOT LIKE N'[0-9][0-9][0-9][0-9]'
            THROW 50001, N'Los últimos 4 dígitos de la tarjeta deben ser numéricos.', 1;

        -- 2. Serializar las peticiones con la misma clave (primero en el orden de bloqueo)
        SET @Recurso = CONCAT(N'ShopCart.Pago.', CONVERT(NVARCHAR(36), @ClaveIdempotencia));

        EXEC @Resultado = sp_getapplock @Resource = @Recurso, @LockMode = N'Exclusive',
                                        @LockOwner = N'Transaction', @LockTimeout = 15000;

        IF @Resultado < 0
            THROW 50021, N'Otra petición con la misma Idempotency-Key sigue en curso; reintenta en unos segundos.', 1;

        -- Normaliza el destino antes de las huellas: el método fija si cuenta la dirección o la sucursal.
        -- No filtra Activo: una repetición debe seguir dando el pedido aunque el método ya se haya desactivado.
        SELECT @RequiereSucursal = RequiereSucursal FROM dbo.MetodoEnvio WHERE IDMetodoEnvio = @IDMetodoEnvio;

        IF @RequiereSucursal = 1
            SET @IDDireccion = NULL;
        ELSE IF @RequiereSucursal = 0
            SET @IDSucursal = NULL;

        -- 3. ¿La clave ya se usó?
        SELECT @IDPedido = IDPedido, @IDUsuarioPedido = IDUsuario, @HuellaGuardada = HuellaSolicitud,
               @IDCuponPedido = IDCupon
        FROM dbo.Pedido
        WHERE ClaveIdempotencia = @ClaveIdempotencia;

        IF @IDPedido IS NOT NULL
        BEGIN
            IF @IDUsuarioPedido <> @IDUsuarioSolicitante
                THROW 50021, N'La Idempotency-Key ya se usó con otra solicitud.', 1;

            EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 0, @IDCarrito OUTPUT;

            IF @IDCarrito IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.CarritoDetalle WHERE IDCarrito = @IDCarrito)
            BEGIN
                SELECT @Lineas = STRING_AGG(CONCAT(cd.IDVariante, N'x', cd.Cantidad), N',') WITHIN GROUP (ORDER BY cd.IDVariante)
                FROM dbo.CarritoDetalle AS cd
                WHERE cd.IDCarrito = @IDCarrito;

                SELECT @IDCuponCarrito = IDCupon FROM dbo.Carrito WHERE IDCarrito = @IDCarrito;
            END
            ELSE
            BEGIN
                SELECT @Lineas = STRING_AGG(CONCAT(pd.IDVariante, N'x', pd.Cantidad), N',') WITHIN GROUP (ORDER BY pd.IDVariante)
                FROM dbo.PedidoDetalle AS pd
                WHERE pd.IDPedido = @IDPedido;

                SET @IDCuponCarrito = @IDCuponPedido;
            END;

            SET @Huella = CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONCAT(
                N'D=', @IDDireccion, N';E=', @IDMetodoEnvio,
                CASE WHEN @IDSucursal IS NULL THEN N'' ELSE CONCAT(N';S=', @IDSucursal) END, N';P=', @MetodoPago, N';T=', @UltimosTarjeta,
                N';C=', ISNULL(CONVERT(NVARCHAR(20), @IDCuponCarrito), N''), N';L=', @Lineas)), 2);

            IF @Huella <> @HuellaGuardada
                THROW 50021, N'La Idempotency-Key ya se usó con un carrito o unos datos de pago distintos.', 1;

            SET @Repetido = 1;
        END
        ELSE
        BEGIN
            -- 4. Destino y método de envío (domicilio o sucursal; da el costo y la copia de la dirección)
            EXEC dbo.SP_Checkout_ResolverEntrega @IDUsuarioSolicitante, @IDMetodoEnvio, @IDDireccion OUTPUT,
                                                 @IDSucursal OUTPUT, @RequiereSucursal OUTPUT, @CostoEnvio OUTPUT,
                                                 @Direccion OUTPUT;

            -- 5. Bloquear el carrito, el cupón y las variantes (en ese orden)
            EXEC dbo.SP_Carrito_BuscarActivo @IDUsuarioSolicitante, NULL, 1, @IDCarrito OUTPUT;

            IF @IDCarrito IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.CarritoDetalle WHERE IDCarrito = @IDCarrito)
                THROW 50031, N'No tienes una reserva vigente; inicia el pago de nuevo.', 1;

            SELECT @IDCuponCarrito = IDCupon FROM dbo.Carrito WHERE IDCarrito = @IDCarrito;

            IF @IDCuponCarrito IS NOT NULL
                SELECT @Bloqueada = IDCupon
                FROM dbo.Cupon WITH (UPDLOCK, ROWLOCK)
                WHERE IDCupon = @IDCuponCarrito;

            INSERT INTO @Bloqueo (IDVariante)
            SELECT IDVariante FROM dbo.CarritoDetalle WHERE IDCarrito = @IDCarrito;

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

            -- 6. Reserva vigente que cubra exactamente el carrito
            IF NOT EXISTS (SELECT 1 FROM dbo.FU_Checkout_EstadoReserva(@IDCarrito) WHERE Vigente = 1)
                THROW 50031, N'Tu reserva venció o ya no coincide con tu carrito; inicia el pago de nuevo.', 1;

            -- 7. Líneas vendibles
            IF @IDCuponCarrito IS NOT NULL
            BEGIN
                SELECT @Error = CodigoError, @Mensaje = MensajeError
                FROM dbo.FU_Cupones_Validar(@IDCuponCarrito, @IDUsuarioSolicitante, @IDCarrito);

                IF @Error IS NOT NULL
                    THROW @Error, @Mensaje, 1;

                SET @IDCuponAplicado = @IDCuponCarrito;
            END;

            INSERT INTO @Linea (IDCarritoDetalle, IDVariante, Cantidad, PrecioUnitario, Importe, DescuentoLinea,
                                ImporteNeto, SKU, NombreProducto, DescripcionVariante, Vendible)
            SELECT f.IDCarritoDetalle, f.IDVariante, f.Cantidad, f.PrecioUnitario, f.Importe, f.DescuentoLinea,
                   f.ImporteNeto, v.SKU, p.Nombre, ISNULL(dv.Descripcion, N'Sin atributos'),
                   CONVERT(BIT, CASE WHEN v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END)
            FROM dbo.FU_Cupones_CalculoDescuento(@IDCarrito, @IDCuponAplicado) AS f
            INNER JOIN dbo.Variante AS v ON v.IDVariante = f.IDVariante
            INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
            INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
            OUTER APPLY dbo.FU_Catalogo_DescripcionVariante(f.IDVariante) AS dv;

            IF EXISTS (SELECT 1 FROM @Linea WHERE Vendible = 0)
            BEGIN
                SELECT @Skus = STRING_AGG(SKU, N', ') WITHIN GROUP (ORDER BY IDVariante)
                FROM @Linea WHERE Vendible = 0;

                SET @Mensaje = CONCAT(N'Estos productos ya no están disponibles para la venta; quítalos del carrito: ',
                                      LEFT(@Skus, 1500), N'.');
                THROW 50001, @Mensaje, 1;
            END;

            IF EXISTS (
                SELECT 1 FROM @Linea AS l
                INNER JOIN dbo.Variante AS v ON v.IDVariante = l.IDVariante
                WHERE l.Cantidad > v.ExistenciaFisica
            )
                THROW 50030, N'La existencia física ya no alcanza para el pedido; inicia el pago de nuevo.', 1;

            -- 8. Montos (las mismas funciones que muestran el resumen)
            SELECT @Subtotal = Subtotal, @Descuento = Descuento, @CostoEnvio = CostoEnvio,
                   @Total = Total, @MontoIVA = MontoIVA
            FROM dbo.FU_Carrito_CalcularTotales(@IDCarrito, @CostoEnvio);

            -- 9. Pago simulado: se rechaza antes de escribir nada, la reserva sigue vigente
            IF @UltimosTarjeta = N'0000'
                THROW 50020, N'El pago fue rechazado por el emisor de la tarjeta.', 1;

            SELECT @Lineas = STRING_AGG(CONCAT(IDVariante, N'x', Cantidad), N',') WITHIN GROUP (ORDER BY IDVariante)
            FROM @Linea;

            SET @Huella = CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONCAT(
                N'D=', @IDDireccion, N';E=', @IDMetodoEnvio,
                CASE WHEN @IDSucursal IS NULL THEN N'' ELSE CONCAT(N';S=', @IDSucursal) END, N';P=', @MetodoPago, N';T=', @UltimosTarjeta,
                N';C=', ISNULL(CONVERT(NVARCHAR(20), @IDCuponCarrito), N''), N';L=', @Lineas)), 2);

            SELECT @IDEstadoPagado = IDEstadoPedido FROM dbo.EstadoPedido WHERE Codigo = N'PAGADO';

            SELECT @IDTipoVenta = IDTipoMovimientoInventario, @SignoVenta = Signo
            FROM dbo.TipoMovimientoInventario
            WHERE Codigo = N'SALIDA_VENTA';

            IF @IDEstadoPagado IS NULL OR @IDTipoVenta IS NULL
                THROW 50000, N'Faltan catálogos (estado PAGADO o tipo SALIDA_VENTA); ejecuta 085_datos_catalogos.sql.', 1;

            SET @Ahora = SYSUTCDATETIME();

            -- 10. Cupón: UPDATE condicional atómico del límite total
            IF @IDCuponAplicado IS NOT NULL
            BEGIN
                UPDATE dbo.Cupon
                SET UsosActuales = UsosActuales + 1
                WHERE IDCupon = @IDCuponAplicado
                  AND UsosActuales < LimiteUsosTotal;

                IF @@ROWCOUNT = 0
                    THROW 50064, N'El cupón ya alcanzó su límite de usos.', 1;
            END;

            -- 11. Pedido y detalle. El número definitivo necesita el IDPedido: se inserta con uno provisional
            --     derivado de la clave (único) y se completa enseguida, dentro de la misma transacción.
            INSERT INTO dbo.Pedido (NumeroPedido, ClaveIdempotencia, HuellaSolicitud, IDUsuario, IDEstadoPedido,
                                    IDDireccion, IDSucursal, RetiroEnSucursal, IDMetodoEnvio, IDCupon, DireccionEntrega,
                                    Subtotal, Descuento, CostoEnvio, MontoIVA, Total, FechaCreacion)
            VALUES (LEFT(REPLACE(CONVERT(NVARCHAR(36), @ClaveIdempotencia), N'-', N''), 20), @ClaveIdempotencia,
                    @Huella, @IDUsuarioSolicitante, @IDEstadoPagado, @IDDireccion, @IDSucursal, @RequiereSucursal,
                    @IDMetodoEnvio, @IDCuponAplicado, @Direccion, @Subtotal, @Descuento, @CostoEnvio, @MontoIVA,
                    @Total, @Ahora);

            SET @IDPedido = SCOPE_IDENTITY();

            SET @NumeroPedido = CONCAT(N'SC-', YEAR(@Ahora), N'-',
                CASE WHEN @IDPedido < 1000000 THEN RIGHT(CONCAT(N'000000', @IDPedido), 6)
                     ELSE CONVERT(NVARCHAR(10), @IDPedido) END);

            UPDATE dbo.Pedido SET NumeroPedido = @NumeroPedido WHERE IDPedido = @IDPedido;

            INSERT INTO dbo.PedidoDetalle (IDPedido, IDVariante, SKU, NombreProducto, DescripcionVariante, Cantidad,
                                           PrecioUnitario, DescuentoLinea, Subtotal)
            SELECT @IDPedido, IDVariante, SKU, NombreProducto, DescripcionVariante, Cantidad,
                   PrecioUnitario, DescuentoLinea, ImporteNeto
            FROM @Linea
            ORDER BY IDCarritoDetalle;

            -- 12. Kardex y saldos: baja la existencia física y la reservada en la misma cantidad
            INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimientoInventario, Signo, IDUsuario, IDPedido,
                                                  Cantidad, ExistenciaAnterior, ExistenciaNueva, Motivo, Fecha)
            SELECT l.IDVariante, @IDTipoVenta, @SignoVenta, @IDUsuarioSolicitante, @IDPedido,
                   l.Cantidad, v.ExistenciaFisica, v.ExistenciaFisica + @SignoVenta * l.Cantidad,
                   CONCAT(N'Venta del pedido ', @NumeroPedido), @Ahora
            FROM @Linea AS l
            INNER JOIN dbo.Variante AS v ON v.IDVariante = l.IDVariante
            ORDER BY l.IDVariante;

            UPDATE v
            SET ExistenciaFisica = v.ExistenciaFisica + @SignoVenta * l.Cantidad,
                ExistenciaReservada = v.ExistenciaReservada - l.Cantidad
            FROM dbo.Variante AS v
            INNER JOIN @Linea AS l ON l.IDVariante = v.IDVariante;

            UPDATE dbo.ReservaExistencia
            SET Estado = N'CONFIRMADA'
            WHERE IDCarrito = @IDCarrito
              AND Estado = N'ACTIVA';

            -- 13. Uso del cupón, pago, historial y carrito
            IF @IDCuponAplicado IS NOT NULL
                INSERT INTO dbo.UsoCupon (IDCupon, IDUsuario, IDPedido, Fecha)
                VALUES (@IDCuponAplicado, @IDUsuarioSolicitante, @IDPedido, @Ahora);

            INSERT INTO dbo.Pago (IDPedido, MetodoPago, Monto, Estado, ReferenciaTransaccion, Fecha)
            VALUES (@IDPedido, @MetodoPago, @Total, N'APROBADO',
                    CONCAT(N'SIM-', UPPER(REPLACE(CONVERT(NVARCHAR(36), NEWID()), N'-', N''))), @Ahora);

            INSERT INTO dbo.HistorialEstadoPedido (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario, Fecha)
            VALUES (@IDPedido, NULL, @IDEstadoPagado, @IDUsuarioSolicitante, N'Pedido creado y pago aprobado', @Ahora);

            -- Guardar la tarjeta (solo con el pago aprobado y la clave nueva). UPDLOCK, HOLDLOCK serializa dos
            -- pagos simultáneos del mismo cliente: no se duplica la tarjeta ni quedan dos predeterminadas.
            IF @GuardarTarjeta = 1
            BEGIN
                SELECT @IDTarjetaResultado = IDTarjetaGuardada
                FROM dbo.TarjetaGuardada WITH (UPDLOCK, HOLDLOCK)
                WHERE IDUsuario = @IDUsuarioSolicitante AND Marca = @MarcaTarjeta
                  AND Tipo = @TipoTarjeta AND Ultimos4 = @UltimosTarjeta;

                IF @IDTarjetaResultado IS NULL
                BEGIN
                    IF EXISTS (SELECT 1 FROM dbo.TarjetaGuardada WITH (UPDLOCK, HOLDLOCK) WHERE IDUsuario = @IDUsuarioSolicitante)
                        SET @Predeterminar = 0;
                    ELSE
                        SET @Predeterminar = 1;

                    INSERT INTO dbo.TarjetaGuardada (IDUsuario, Titular, Ultimos4, Tipo, Marca, Predeterminada, FechaCreacion)
                    VALUES (@IDUsuarioSolicitante, @TitularTarjeta, @UltimosTarjeta, @TipoTarjeta, @MarcaTarjeta,
                            @Predeterminar, @Ahora);

                    SET @IDTarjetaResultado = SCOPE_IDENTITY();

                    SELECT @NuevaTarjeta = Json FROM dbo.FU_Tarjetas_TarjetaJson(@IDTarjetaResultado);

                    INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo, Fecha)
                    VALUES (@IDUsuarioSolicitante, N'Tarjetas', N'TarjetaGuardada', @IDTarjetaResultado, N'CREAR',
                            NULL, @NuevaTarjeta, @Ahora);
                END;
            END;

            UPDATE dbo.Carrito
            SET Estado = N'CONVERTIDO',
                FechaUltimaActividad = @Ahora
            WHERE IDCarrito = @IDCarrito;

            -- 14. Bitácora
            SELECT @Nuevo = Json FROM dbo.FU_Pedidos_PedidoJson(@IDPedido, 1);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo, Fecha)
            VALUES (@IDUsuarioSolicitante, N'Pedidos', N'Pedido', @IDPedido, N'CREAR', NULL, @Nuevo, @Ahora);
        END;

        COMMIT TRANSACTION;

        -- 15. Resultado
        SELECT
            p.IDPedido,
            p.NumeroPedido,
            ep.Codigo AS Estado,
            p.Total,
            @Repetido AS Repetido,
            @IDTarjetaResultado AS IDTarjetaGuardada
        FROM dbo.Pedido AS p
        INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
        WHERE p.IDPedido = @IDPedido;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- GET /api/pedidos/:id: detalle del pedido. Un Cliente que pide el pedido de otro, o un pedido inexistente → 50004.
-- También es el resultado de SP_Pedidos_CambiarEstado y SP_Pedidos_Cancelar. Tres result sets:
--   1. Encabezado (una fila): IDPedido INT, NumeroPedido NVARCHAR(20), IDUsuario INT, Cliente NVARCHAR(201),
--      CorreoCliente NVARCHAR(150), Estado NVARCHAR(30) (código), NombreEstado NVARCHAR(100), EsFinal BIT,
--      IDDireccion INT NULL, IDSucursal INT NULL, Sucursal NVARCHAR(100) NULL (nombre actual), RetiroEnSucursal BIT,
--      DireccionEntrega NVARCHAR(800) (copia al momento de la compra; con retiro empieza con "Recoger en"), IDMetodoEnvio INT,
--      MetodoEnvio NVARCHAR(100), DiasEstimados TINYINT, IDCupon INT NULL, CodigoCupon NVARCHAR(30) NULL,
--      Subtotal, Descuento, CostoEnvio, MontoIVA, Total, MontoReembolsado (DECIMAL(12,2)),
--      IDPago INT, MetodoPago NVARCHAR(20), MontoPago DECIMAL(12,2), EstadoPago NVARCHAR(20),
--      ReferenciaTransaccion NVARCHAR(100), FechaPago DATETIME2(3), FechaCreacion DATETIME2(3)
--   2. Líneas con precios congelados: IDPedidoDetalle INT, IDVariante INT, SKU NVARCHAR(50),
--      NombreProducto NVARCHAR(150), DescripcionVariante NVARCHAR(200), Cantidad INT, PrecioUnitario,
--      DescuentoLinea, Subtotal (DECIMAL(12,2)), CantidadDevuelta INT, CantidadDevolvible INT
--   3. Transiciones posibles desde el estado actual para el rol del solicitante: CodigoEstado NVARCHAR(30),
--      NombreEstado NVARCHAR(100), Via NVARCHAR(10) ('ESTADO' | 'CANCELAR' | 'DEVOLUCION', ver
--      SP_Pedidos_ListarTransiciones)
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerPorId
    @IDUsuarioSolicitante INT,
    @IDPedido             INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Rol NVARCHAR(30), @IDDuenio INT, @IDEstadoActual INT;

    SELECT @Rol = r.Nombre
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuarioSolicitante;

    IF @Rol IS NULL
        THROW 50004, N'El usuario solicitante no existe.', 1;

    SELECT @IDDuenio = IDUsuario, @IDEstadoActual = IDEstadoPedido
    FROM dbo.Pedido
    WHERE IDPedido = @IDPedido;

    IF @IDDuenio IS NULL OR (@Rol = N'Cliente' AND @IDDuenio <> @IDUsuarioSolicitante)
        THROW 50004, N'El pedido no existe.', 1;

    -- 1. Encabezado
    SELECT
        p.IDPedido,
        p.NumeroPedido,
        p.IDUsuario,
        CONCAT(u.Nombre, N' ', u.Apellido) AS Cliente,
        u.Correo AS CorreoCliente,
        ep.Codigo AS Estado,
        ep.Nombre AS NombreEstado,
        ep.EsFinal,
        p.IDDireccion,
        p.IDSucursal,
        s.Nombre AS Sucursal,
        p.RetiroEnSucursal,
        p.DireccionEntrega,
        p.IDMetodoEnvio,
        me.Nombre AS MetodoEnvio,
        me.DiasEstimados,
        p.IDCupon,
        cu.Codigo AS CodigoCupon,
        p.Subtotal,
        p.Descuento,
        p.CostoEnvio,
        p.MontoIVA,
        p.Total,
        CONVERT(DECIMAL(12,2), ISNULL(dv.Monto, 0)) AS MontoReembolsado,
        pg.IDPago,
        pg.MetodoPago,
        pg.Monto AS MontoPago,
        pg.Estado AS EstadoPago,
        pg.ReferenciaTransaccion,
        pg.Fecha AS FechaPago,
        p.FechaCreacion
    FROM dbo.Pedido AS p
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = p.IDUsuario
    INNER JOIN dbo.EstadoPedido AS ep ON ep.IDEstadoPedido = p.IDEstadoPedido
    INNER JOIN dbo.MetodoEnvio AS me ON me.IDMetodoEnvio = p.IDMetodoEnvio
    LEFT JOIN dbo.Sucursal AS s ON s.IDSucursal = p.IDSucursal
    LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = p.IDCupon
    LEFT JOIN dbo.Pago AS pg ON pg.IDPedido = p.IDPedido
    OUTER APPLY (
        SELECT SUM(d.MontoReembolso) AS Monto
        FROM dbo.Devolucion AS d
        WHERE d.IDPedido = p.IDPedido
    ) AS dv
    WHERE p.IDPedido = @IDPedido;

    -- 2. Líneas
    SELECT
        d.IDPedidoDetalle,
        d.IDVariante,
        d.SKU,
        d.NombreProducto,
        d.DescripcionVariante,
        d.Cantidad,
        d.PrecioUnitario,
        d.DescuentoLinea,
        d.Subtotal,
        d.CantidadDevuelta,
        d.Cantidad - d.CantidadDevuelta AS CantidadDevolvible
    FROM dbo.PedidoDetalle AS d
    WHERE d.IDPedido = @IDPedido
    ORDER BY d.IDPedidoDetalle;

    -- 3. Transiciones posibles para el rol del solicitante
    SELECT
        ed.Codigo AS CodigoEstado,
        ed.Nombre AS NombreEstado,
        CASE ed.Codigo
            WHEN N'CANCELADO'        THEN N'CANCELAR'
            WHEN N'DEVUELTO_PARCIAL' THEN N'DEVOLUCION'
            WHEN N'DEVUELTO'         THEN N'DEVOLUCION'
            ELSE N'ESTADO'
        END AS Via
    FROM dbo.TransicionEstadoPedido AS t
    INNER JOIN dbo.EstadoPedido AS ed ON ed.IDEstadoPedido = t.IDEstadoDestino
    INNER JOIN dbo.Rol AS r ON r.IDRol = t.IDRol
    WHERE t.IDEstadoOrigen = @IDEstadoActual
      AND r.Nombre = @Rol
    ORDER BY ed.IDEstadoPedido;
END;
GO

-- GET /api/catalogo/sucursales (público, sin solicitante): sucursales activas ordenadas por nombre.
-- Fila: IDSucursal INT, Nombre NVARCHAR(100), Telefono NVARCHAR(20), Linea1 NVARCHAR(200),
-- Linea2 NVARCHAR(200) NULL, Municipio NVARCHAR(100), Departamento NVARCHAR(100), CodigoPostal NVARCHAR(10) NULL,
-- Horario NVARCHAR(200) NULL.
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarSucursales
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        IDSucursal,
        Nombre,
        Telefono,
        Linea1,
        Linea2,
        Municipio,
        Departamento,
        CodigoPostal,
        Horario
    FROM dbo.Sucursal
    WHERE Activo = 1
    ORDER BY Nombre, IDSucursal;
END;
GO

-- GET /api/sucursales: lista paginada, incluye inactivas.
--   @Q       busca en nombre, municipio y departamento (comodines de LIKE escapados)
--   @Activo  filtra por estado
--   @Orden   nombre | municipio | departamento | activo | cantidadPedidos, con :asc o :desc. Default nombre:asc.
-- Result sets: 1. filas de la página; 2. Total INT.
-- Fila: IDSucursal INT, Nombre, Telefono, Linea1, Linea2 NULL, Municipio, Departamento, CodigoPostal NULL,
-- Horario NULL, Activo BIT, CantidadPedidos INT, FechaCreacion DATETIME2(3), FechaModificacion DATETIME2(3) (UTC).
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_Listar
    @IDUsuarioSolicitante INT,
    @Q                    NVARCHAR(100) = NULL,
    @Activo               BIT           = NULL,
    @Pagina               INT           = 1,
    @TamanoPagina         INT           = 20,
    @Orden                NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'nombre:asc');

    EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'nombre:asc', N'nombre:desc', N'municipio:asc', N'municipio:desc',
                      N'departamento:asc', N'departamento:desc', N'activo:asc', N'activo:desc',
                      N'cantidadPedidos:asc', N'cantidadPedidos:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa nombre, municipio, departamento, activo o cantidadPedidos con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Q);

    DECLARE @Fila TABLE (
        IDSucursal        INT           NOT NULL PRIMARY KEY,
        Nombre            NVARCHAR(100) NOT NULL,
        Telefono          NVARCHAR(20)  NOT NULL,
        Linea1            NVARCHAR(200) NOT NULL,
        Linea2            NVARCHAR(200) NULL,
        Municipio         NVARCHAR(100) NOT NULL,
        Departamento      NVARCHAR(100) NOT NULL,
        CodigoPostal      NVARCHAR(10)  NULL,
        Horario           NVARCHAR(200) NULL,
        Activo            BIT           NOT NULL,
        CantidadPedidos   INT           NOT NULL,
        FechaCreacion     DATETIME2(3)  NOT NULL,
        FechaModificacion DATETIME2(3)  NOT NULL
    );

    INSERT INTO @Fila (IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario,
                       Activo, CantidadPedidos, FechaCreacion, FechaModificacion)
    SELECT
        s.IDSucursal, s.Nombre, s.Telefono, s.Linea1, s.Linea2, s.Municipio, s.Departamento, s.CodigoPostal,
        s.Horario, s.Activo,
        (SELECT COUNT(*) FROM dbo.Pedido AS p WHERE p.IDSucursal = s.IDSucursal),
        s.FechaCreacion, s.FechaModificacion
    FROM dbo.Sucursal AS s
    WHERE (@Activo IS NULL OR s.Activo = @Activo)
      AND (@Patron IS NULL OR s.Nombre LIKE @Patron OR s.Municipio LIKE @Patron OR s.Departamento LIKE @Patron)
    OPTION (RECOMPILE);

    SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario, Activo,
           CantidadPedidos, FechaCreacion, FechaModificacion
    FROM @Fila
    ORDER BY
        CASE WHEN @Orden = N'nombre:asc'            THEN Nombre          END ASC,
        CASE WHEN @Orden = N'nombre:desc'           THEN Nombre          END DESC,
        CASE WHEN @Orden = N'municipio:asc'         THEN Municipio       END ASC,
        CASE WHEN @Orden = N'municipio:desc'        THEN Municipio       END DESC,
        CASE WHEN @Orden = N'departamento:asc'      THEN Departamento    END ASC,
        CASE WHEN @Orden = N'departamento:desc'     THEN Departamento    END DESC,
        CASE WHEN @Orden = N'activo:asc'            THEN Activo          END ASC,
        CASE WHEN @Orden = N'activo:desc'           THEN Activo          END DESC,
        CASE WHEN @Orden = N'cantidadPedidos:asc'   THEN CantidadPedidos END ASC,
        CASE WHEN @Orden = N'cantidadPedidos:desc'  THEN CantidadPedidos END DESC,
        Nombre ASC,
        IDSucursal ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- GET /api/sucursales/:id. También es el resultado de los SPs que crean o modifican sucursales.
-- Una fila con las columnas de SP_Sucursales_Listar. Inexistente → 50004.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_ObtenerPorId
    @IDSucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Sucursal WHERE IDSucursal = @IDSucursal)
        THROW 50004, N'La sucursal no existe.', 1;

    SELECT
        s.IDSucursal,
        s.Nombre,
        s.Telefono,
        s.Linea1,
        s.Linea2,
        s.Municipio,
        s.Departamento,
        s.CodigoPostal,
        s.Horario,
        s.Activo,
        (SELECT COUNT(*) FROM dbo.Pedido AS p WHERE p.IDSucursal = s.IDSucursal) AS CantidadPedidos,
        s.FechaCreacion,
        s.FechaModificacion
    FROM dbo.Sucursal AS s
    WHERE s.IDSucursal = @IDSucursal;
END;
GO

-- POST /api/sucursales: nombre, teléfono, línea 1, municipio y departamento son obligatorios (50001).
-- Nombre repetido → 2627 (UQ_Sucursal_Nombre) → DUPLICADO. La sucursal nace activa. Devuelve el detalle.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_Crear
    @IDUsuarioSolicitante INT,
    @Nombre               NVARCHAR(100),
    @Telefono             NVARCHAR(20),
    @Linea1               NVARCHAR(200),
    @Linea2               NVARCHAR(200) = NULL,
    @Municipio            NVARCHAR(100),
    @Departamento         NVARCHAR(100),
    @CodigoPostal         NVARCHAR(10)  = NULL,
    @Horario              NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDSucursal INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Nombre = NULLIF(TRIM(@Nombre), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');
    SET @Linea1 = NULLIF(TRIM(@Linea1), N'');
    SET @Linea2 = NULLIF(TRIM(@Linea2), N'');
    SET @Municipio = NULLIF(TRIM(@Municipio), N'');
    SET @Departamento = NULLIF(TRIM(@Departamento), N'');
    SET @CodigoPostal = NULLIF(TRIM(@CodigoPostal), N'');
    SET @Horario = NULLIF(TRIM(@Horario), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL
            THROW 50001, N'El nombre de la sucursal es obligatorio.', 1;

        IF @Telefono IS NULL
            THROW 50001, N'El teléfono de la sucursal es obligatorio.', 1;

        IF @Linea1 IS NULL
            THROW 50001, N'La dirección de la sucursal es obligatoria.', 1;

        IF @Municipio IS NULL
            THROW 50001, N'El municipio de la sucursal es obligatorio.', 1;

        IF @Departamento IS NULL
            THROW 50001, N'El departamento de la sucursal es obligatorio.', 1;

        -- 3. Escribir. Nombre repetido → 2627 → DUPLICADO.
        INSERT INTO dbo.Sucursal (Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Horario, Activo)
        VALUES (@Nombre, @Telefono, @Linea1, @Linea2, @Municipio, @Departamento, @CodigoPostal, @Horario, 1);

        SET @IDSucursal = SCOPE_IDENTITY();

        -- 4. Bitácora
        SET @Nuevo = (SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal,
                             Horario, Activo
                      FROM dbo.Sucursal WHERE IDSucursal = @IDSucursal
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Sucursales', N'Sucursal', @IDSucursal, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Sucursales_ObtenerPorId @IDSucursal = @IDSucursal;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/sucursales/:id: reemplaza todos los campos editables (NULL borra Linea2, CodigoPostal y Horario).
-- No cambia el estado (ver CambiarEstado). Inexistente → 50004; nombre repetido → 2627 → DUPLICADO.
-- Devuelve el detalle.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_Actualizar
    @IDUsuarioSolicitante INT,
    @IDSucursal           INT,
    @Nombre               NVARCHAR(100),
    @Telefono             NVARCHAR(20),
    @Linea1               NVARCHAR(200),
    @Linea2               NVARCHAR(200) = NULL,
    @Municipio            NVARCHAR(100),
    @Departamento         NVARCHAR(100),
    @CodigoPostal         NVARCHAR(10)  = NULL,
    @Horario              NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    SET @Nombre = NULLIF(TRIM(@Nombre), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');
    SET @Linea1 = NULLIF(TRIM(@Linea1), N'');
    SET @Linea2 = NULLIF(TRIM(@Linea2), N'');
    SET @Municipio = NULLIF(TRIM(@Municipio), N'');
    SET @Departamento = NULLIF(TRIM(@Departamento), N'');
    SET @CodigoPostal = NULLIF(TRIM(@CodigoPostal), N'');
    SET @Horario = NULLIF(TRIM(@Horario), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Nombre IS NULL
            THROW 50001, N'El nombre de la sucursal es obligatorio.', 1;

        IF @Telefono IS NULL
            THROW 50001, N'El teléfono de la sucursal es obligatorio.', 1;

        IF @Linea1 IS NULL
            THROW 50001, N'La dirección de la sucursal es obligatoria.', 1;

        IF @Municipio IS NULL
            THROW 50001, N'El municipio de la sucursal es obligatorio.', 1;

        IF @Departamento IS NULL
            THROW 50001, N'El departamento de la sucursal es obligatorio.', 1;

        -- 2. Bloquear y leer el valor anterior
        SET @Anterior = (SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal,
                                Horario, Activo
                         FROM dbo.Sucursal WITH (UPDLOCK, ROWLOCK)
                         WHERE IDSucursal = @IDSucursal
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior IS NULL
            THROW 50004, N'La sucursal no existe.', 1;

        -- 3. Escribir. Nombre repetido → 2627 → DUPLICADO.
        UPDATE dbo.Sucursal
        SET Nombre = @Nombre,
            Telefono = @Telefono,
            Linea1 = @Linea1,
            Linea2 = @Linea2,
            Municipio = @Municipio,
            Departamento = @Departamento,
            CodigoPostal = @CodigoPostal,
            Horario = @Horario,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDSucursal = @IDSucursal;

        -- 4. Bitácora
        SET @Nuevo = (SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal,
                             Horario, Activo
                      FROM dbo.Sucursal WHERE IDSucursal = @IDSucursal
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Sucursales', N'Sucursal', @IDSucursal, N'MODIFICAR', @Anterior, @Nuevo);

        COMMIT TRANSACTION;

        EXEC dbo.SP_Sucursales_ObtenerPorId @IDSucursal = @IDSucursal;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/sucursales/:id/estado. Desactivar la quita del checkout sin tocar los pedidos ya hechos.
-- Si ya está en ese estado no escribe ni registra nada. @Activo NULL → 50001; inexistente → 50004.
-- Devuelve el detalle.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDSucursal           INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT;
    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        SELECT @ActivoActual = Activo
        FROM dbo.Sucursal WITH (UPDLOCK, ROWLOCK)
        WHERE IDSucursal = @IDSucursal;

        IF @ActivoActual IS NULL
            THROW 50004, N'La sucursal no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            SET @Anterior = (SELECT IDSucursal, Nombre, Activo FROM dbo.Sucursal
                             WHERE IDSucursal = @IDSucursal
                             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            UPDATE dbo.Sucursal
            SET Activo = @Activo,
                FechaModificacion = SYSUTCDATETIME()
            WHERE IDSucursal = @IDSucursal;

            SET @Nuevo = (SELECT IDSucursal, Nombre, Activo FROM dbo.Sucursal
                          WHERE IDSucursal = @IDSucursal
                          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Sucursales', N'Sucursal', @IDSucursal,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        EXEC dbo.SP_Sucursales_ObtenerPorId @IDSucursal = @IDSucursal;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/sucursales/:id: borrado físico, solo si ningún pedido la usó → 50051 (desactívala en su lugar).
-- La sucursal queda bloqueada con UPDLOCK. La comprobación lee con READCOMMITTEDLOCK: con
-- READ_COMMITTED_SNAPSHOT una lectura normal no vería un pedido insertado por otra transacción aún sin
-- confirmar. No devuelve result set.
CREATE OR ALTER PROCEDURE dbo.SP_Sucursales_Eliminar
    @IDUsuarioSolicitante INT,
    @IDSucursal           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SET @Anterior = (SELECT IDSucursal, Nombre, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal,
                                Horario, Activo
                         FROM dbo.Sucursal WITH (UPDLOCK, ROWLOCK)
                         WHERE IDSucursal = @IDSucursal
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior IS NULL
            THROW 50004, N'La sucursal no existe.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Pedido WITH (READCOMMITTEDLOCK) WHERE IDSucursal = @IDSucursal)
            THROW 50051, N'La sucursal tiene pedidos y no puede eliminarse; desactívala.', 1;

        DELETE FROM dbo.Sucursal WHERE IDSucursal = @IDSucursal;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Sucursales', N'Sucursal', @IDSucursal, N'ELIMINAR', @Anterior, NULL);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

PRINT N'Base de datos $(DbName) creada correctamente.';
GO
