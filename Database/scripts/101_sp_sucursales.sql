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
