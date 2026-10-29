/*
    014_sp_bitacora.sql
    Stored procedures de bitácora, configuración y sistema.

    PENDIENTE: SP_Bitacora_*, SP_Configuracion_*.
    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
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
