#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  exec node server.mjs
fi
ORBIT_BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ -x "$ORBIT_BUNDLED_NODE" ]; then
  exec "$ORBIT_BUNDLED_NODE" server.mjs
fi
printf 'Для запуска Orbit установите Node.js 20+ с https://nodejs.org\n'
read -r 'ORBIT_WAIT?Нажмите Enter, чтобы закрыть окно.'
