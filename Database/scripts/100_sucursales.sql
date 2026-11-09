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
