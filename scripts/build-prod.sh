#!/usr/bin/env bash
set -e

echo "[build] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[build] Building frontend..."
cd artifacts/web3hub
BASE_PATH=/ pnpm run build
cd ../..

echo "[build] Building backend..."
cd artifacts/api-server
pnpm run build
cd ../..

echo "[build] Done."
