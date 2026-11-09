#!/usr/bin/env bash
# Crea la base de datos de ShopCart ejecutando scripts/*.sql en orden.
# Es el punto de entrada del servicio db-init de docker compose y también se puede ejecutar a mano.
#
# Si la base no existe, o con DB_RESET=true, la crea desde cero con todos los scripts en orden.
# Si ya existe la conserva (así `docker compose up` no borra los datos en cada arranque) y solo aplica los
# scripts incrementales: los de scripts/ con prefijo numérico >= 100 (100_sucursales.sql, 101_...). Son
# idempotentes, así que se pueden ejecutar en cada arranque y actualizan una base existente sin reset.
# Un cambio de esquema posterior a 090 va en un script nuevo >= 100, no en 002.
# Con DB_PRUEBAS=true ejecuta además pruebas/*.sql, que comprueban las restricciones de integridad
# y no dejan datos.
#
# Uso manual:
#   DB_SERVER=localhost,1433 DB_USER=sa DB_PASSWORD='...' APP_DB_PASSWORD='...' ./docker-init.sh
#
# Variables:
#   DB_SERVER        (requerida) servidor y puerto, p. ej. localhost,1433
#   DB_USER          (requerida) usuario administrador con el que se crean los objetos
#   DB_PASSWORD      (requerida) contraseña de DB_USER
#   APP_DB_PASSWORD  (requerida) contraseña del login de la aplicación
#   DB_NAME          (opcional)  nombre de la base; por defecto ShopCart
#   APP_DB_LOGIN     (opcional)  login de la aplicación; por defecto shopcart_app
#   DB_RESET         (opcional)  true para recrear la base aunque exista; por defecto false
#   DB_PRUEBAS       (opcional)  true para ejecutar pruebas/*.sql al terminar; por defecto false

set -euo pipefail

faltantes=()
for var in DB_SERVER DB_USER DB_PASSWORD APP_DB_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    faltantes+=("$var")
  fi
done
if (( ${#faltantes[@]} > 0 )); then
  echo "Error: faltan variables de entorno: ${faltantes[*]}" >&2
  echo "Ejemplo: DB_SERVER=localhost,1433 DB_USER=sa DB_PASSWORD='...' APP_DB_PASSWORD='...' $0" >&2
  exit 1
fi

DB_NAME="${DB_NAME:-ShopCart}"
APP_DB_LOGIN="${APP_DB_LOGIN:-shopcart_app}"
DB_RESET="${DB_RESET:-false}"
DB_PRUEBAS="${DB_PRUEBAS:-false}"

SQLCMD="$(command -v sqlcmd || true)"
for candidato in /opt/mssql-tools18/bin/sqlcmd /opt/mssql-tools/bin/sqlcmd; do
  if [[ -z "$SQLCMD" && -x "$candidato" ]]; then
    SQLCMD="$candidato"
  fi
done
if [[ -z "$SQLCMD" ]]; then
  echo "Error: no se encontró sqlcmd. Instala mssql-tools18 o usa docker compose." >&2
  exit 1
fi

DIRECTORIO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

shopt -s nullglob
scripts=("$DIRECTORIO"/scripts/*.sql)
if (( ${#scripts[@]} == 0 )); then
  echo "Error: no hay scripts en $DIRECTORIO/scripts" >&2
  exit 1
fi

# Scripts incrementales: prefijo numérico >= 100 (10# evita que 080 o 090 se lean como octal).
incrementales=()
for script in "${scripts[@]}"; do
  prefijo="$(basename "$script")"
  prefijo="${prefijo%%_*}"
  if [[ "$prefijo" =~ ^[0-9]+$ ]] && (( 10#$prefijo >= 100 )); then
    incrementales+=("$script")
  fi
done

ejecutar() {
  echo "-> $(basename "$1")"
  "$SQLCMD" -S "$DB_SERVER" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -I \
    -v DbName="$DB_NAME" AppLogin="$APP_DB_LOGIN" AppPassword="$APP_DB_PASSWORD" \
    -i "$1"
}

existe="$("$SQLCMD" -S "$DB_SERVER" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -h -1 -W \
  -Q "SET NOCOUNT ON; SELECT CASE WHEN DB_ID(N'$DB_NAME') IS NULL THEN 0 ELSE 1 END;" | tr -d '[:space:]')"

if [[ "$existe" == "1" && "$DB_RESET" != "true" ]]; then
  echo "La base $DB_NAME ya existe; se conserva. Usa DB_RESET=true para recrearla."
  if (( ${#incrementales[@]} > 0 )); then
    echo "Aplicando scripts incrementales…"
    for script in "${incrementales[@]}"; do
      ejecutar "$script"
    done
  fi
else
  echo "Servidor: $DB_SERVER | Base: $DB_NAME | Login de la aplicación: $APP_DB_LOGIN"

  # 001_crear_base_datos.sql elimina la base si existe y la crea de nuevo.
  for script in "${scripts[@]}"; do
    ejecutar "$script"
  done

  echo "Base de datos $DB_NAME creada correctamente."
fi

if [[ "$DB_PRUEBAS" == "true" ]]; then
  pruebas=("$DIRECTORIO"/pruebas/*.sql)
  if (( ${#pruebas[@]} == 0 )); then
    echo "Error: no hay pruebas en $DIRECTORIO/pruebas" >&2
    exit 1
  fi

  for prueba in "${pruebas[@]}"; do
    ejecutar "$prueba"
  done

  echo "Pruebas de la base $DB_NAME correctas."
fi
