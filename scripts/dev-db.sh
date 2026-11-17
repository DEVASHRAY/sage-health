#!/usr/bin/env bash
# Local Postgres for development and the integration tests. No Docker needed.
#
#   scripts/dev-db.sh start    initialise (first run), start, and create the databases
#   scripts/dev-db.sh stop
#   scripts/dev-db.sh status
#
# SAGE_PG_DIR   where the cluster lives      (default: ~/.sage-pg)
# SAGE_PG_PORT  port on 127.0.0.1            (default: 54329)
# SAGE_PG_BIN   directory with initdb/pg_ctl (default: found on PATH, then /usr/lib/postgresql/16/bin)
#
# Postgres refuses to run as root, so when invoked as root every server command runs as the
# `postgres` OS user, which must be able to reach SAGE_PG_DIR.
set -euo pipefail

PG_DIR="${SAGE_PG_DIR:-$HOME/.sage-pg}"
PG_PORT="${SAGE_PG_PORT:-54329}"
PG_BIN="${SAGE_PG_BIN:-$(dirname "$(command -v pg_ctl || echo /usr/lib/postgresql/16/bin/pg_ctl)")}"
DATA="$PG_DIR/data"
DB_USER=sage

as_pg() {
  if [ "$(id -u)" -eq 0 ]; then
    su postgres -s /bin/sh -c "$*"
  else
    sh -c "$*"
  fi
}

start() {
  mkdir -p "$PG_DIR"
  if [ "$(id -u)" -eq 0 ]; then chown postgres "$PG_DIR"; fi
  if [ ! -f "$DATA/PG_VERSION" ]; then
    as_pg "'$PG_BIN/initdb' -D '$DATA' -U $DB_USER --auth=trust -E UTF8" >/dev/null
  fi
  if ! as_pg "'$PG_BIN/pg_ctl' -D '$DATA' status" >/dev/null 2>&1; then
    as_pg "'$PG_BIN/pg_ctl' -D '$DATA' -l '$PG_DIR/pg.log' -w start \
      -o '-p $PG_PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories='" >/dev/null
  fi
  for db in sage sage_test; do
    if ! psql -h 127.0.0.1 -p "$PG_PORT" -U $DB_USER -d postgres -tAc \
      "select 1 from pg_database where datname='$db'" | grep -q 1; then
      psql -h 127.0.0.1 -p "$PG_PORT" -U $DB_USER -d postgres -qc "create database $db"
    fi
  done
  echo "Postgres is up: postgresql://$DB_USER@127.0.0.1:$PG_PORT/sage (and /sage_test)"
}

case "${1:-}" in
  start) start ;;
  stop) as_pg "'$PG_BIN/pg_ctl' -D '$DATA' -m fast stop" ;;
  status) as_pg "'$PG_BIN/pg_ctl' -D '$DATA' status" ;;
  *)
    echo "usage: $0 start|stop|status" >&2
    exit 64
    ;;
esac
