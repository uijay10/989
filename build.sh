#!/usr/bin/env bash
set -e

pnpm --filter @workspace/web3hub run build
pnpm --filter @workspace/api-server run build
