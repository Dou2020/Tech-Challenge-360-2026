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
