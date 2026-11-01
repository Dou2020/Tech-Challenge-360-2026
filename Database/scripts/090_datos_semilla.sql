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
    AGOTADO5 nace con UsosActuales = LimiteUsosTotal sin filas en UsoCupon, porque aún no hay
    pedidos de ejemplo: es el único contador de la semilla que no sale de su tabla de origen.

    PENDIENTE: pedidos de ejemplo (con su detalle, pago, historial, kardex de venta y uso de
    cupón), cuando existan los SPs de pedidos (012_sp_pedidos.sql).
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
         N'Carla', N'Ruiz', NULL, 0)
     ) AS u (Orden, Rol, Correo, HashContrasena, Nombre, Apellido, Telefono, Activo)
INNER JOIN dbo.Rol AS r ON r.Nombre = u.Rol
ORDER BY u.Orden;

IF @@ROWCOUNT <> 5
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
         N'Mixco', N'Guatemala', N'01057', NULL)
     ) AS d (Orden, Correo, Alias, NombreDestinatario, Telefono, Linea1, Linea2, Municipio, Departamento, CodigoPostal, Referencias)
INNER JOIN dbo.Usuario AS us ON us.Correo = d.Correo
ORDER BY d.Orden;

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
