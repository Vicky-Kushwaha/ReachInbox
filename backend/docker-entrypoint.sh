#!/bin/sh
set -e

if [ "$SERVICE_ROLE" = "worker" ]; then
  echo "[entrypoint] starting BullMQ worker..."
  exec node dist/queues/emailWorker.js
else
  echo "[entrypoint] running database migrations..."
  node dist/db/migrate.js
  echo "[entrypoint] starting API server..."
  exec node dist/index.js
fi
