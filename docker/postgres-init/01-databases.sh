#!/bin/sh
set -eu

desk_password="${DESK_DB_PASSWORD:-desk-local}"
langflow_password="${LANGFLOW_DB_PASSWORD:-langflow-local}"

psql --username postgres --set ON_ERROR_STOP=1 --set desk_password="$desk_password" --set langflow_password="$langflow_password" <<'SQL'
CREATE ROLE desk LOGIN PASSWORD :'desk_password';
CREATE DATABASE desk OWNER desk;
CREATE ROLE langflow LOGIN PASSWORD :'langflow_password';
CREATE DATABASE langflow OWNER langflow;
SQL
