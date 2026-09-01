#!/usr/bin/env bash
# Runs the E1 gate: does the seeded database produce the mockup's numbers?
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
. ./.env
set +a
psql "$DATABASE_URL" -X -q -f prisma/gate.sql
