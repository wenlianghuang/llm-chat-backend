#!/bin/sh
set -e

echo "Applying database migrations..."
pnpm exec prisma migrate deploy

echo "Starting API server..."
exec node dist/index.js
