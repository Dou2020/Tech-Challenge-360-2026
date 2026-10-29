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
