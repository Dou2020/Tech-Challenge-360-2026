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
