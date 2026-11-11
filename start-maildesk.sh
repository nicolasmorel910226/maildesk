#!/usr/bin/env bash
set -e
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null; then
  echo 'Install Node.js LTS version 22.13 or newer, then run this file again.'
  exit 1
fi
exec node scripts/launch.mjs
