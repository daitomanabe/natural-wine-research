#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/.run"
mkdir -p "$LOG_DIR"

function kill_with_children() {
  local pid="$1"

  local children=""
  set +e
  children="$(pgrep -P "$pid" || true)"
  set -e

  if [ -n "$children" ]; then
    echo "Kill children of $pid: $children"
    for child in $children; do
      kill -TERM "$child" 2>/dev/null || true
    done
  fi

  echo "Kill $pid"
  kill -TERM "$pid" 2>/dev/null || true

  sleep 0.6
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

function cleanup_project_processes() {
  echo "[cleanup] Removing natural-wine-research node/vite processes in current workspace"

  local candidate_pids=""
  set +e
  candidate_pids="$(ps -axo pid=,command= | awk -v root="$PROJECT_ROOT" '$0 ~ root && ($0 ~ /node .*node_modules\/\.bin\/vite/ || $0 ~ /node .*server\/index\.mjs/ || $0 ~ /npm run dev:full/ || $0 ~ /npm run dev:server/ || $0 ~ /npm run dev:client/ || $0 ~ /concurrently/) {print $1}')"
  set -e

  if [ -n "$candidate_pids" ]; then
    for pid in $candidate_pids; do
      kill_with_children "$pid"
    done
  fi

  for port in 3000 3001 3002 4000 8080 8787 8788 8789 8790 8888 9000 5173 5174 5175 4173; do
    set +e
    local pids="$(lsof -nP -tiTCP:$port -sTCP:LISTEN || true)"
    set -e

    if [ -z "$pids" ]; then
      continue
    fi

    for pid in $pids; do
      local cmd=""
      set +e
      cmd="$(ps -p "$pid" -o command= 2>/dev/null)"
      set -e

      if [[ "$cmd" == *"$PROJECT_ROOT"* ]]; then
        kill_with_children "$pid"
      fi
    done
  done
}

function pick_free_port() {
  for port in "$@"; do
    set +e
    lsof -nP -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    local is_free=$?
    set -e

    if [ "$is_free" -ne 0 ]; then
      echo "$port"
      return 0
    fi
  done

  echo "No free port available in candidates" >&2
  exit 1
}

function wait_for_http() {
  local url="$1"
  local timeout="${2:-30}"

  for _ in $(seq 1 "$timeout"); do
    set +e
    local code="$(curl -s --max-time 2 -o /dev/null -w "%{http_code}" "$url" || true)"
    set -e

    if [ "$code" = "200" ]; then
      return 0
    fi
    sleep 1
  done

  echo "Timeout waiting for $url" >&2
  return 1
}

cleanup_project_processes

WEB_PORT="$(pick_free_port 5173 3000 3001 3002 4000 8080 8888 9000 4173)"
API_PORT="$(pick_free_port 8787 8788 8789 8790)"

cleanup_stale_services() {
  if [ -f "$LOG_DIR/api.pid" ]; then
    local pid
    pid="$(cat "$LOG_DIR/api.pid" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill_with_children "$pid"
    fi
  fi

  if [ -f "$LOG_DIR/web.pid" ]; then
    local pid
    pid="$(cat "$LOG_DIR/web.pid" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill_with_children "$pid"
    fi
  fi
}

trap cleanup_stale_services EXIT INT TERM

API_PID=""
WEB_PID=""

echo "[start] API=$API_PORT WEB=$WEB_PORT"

cd "$PROJECT_ROOT"

API_PORT="$API_PORT" node --watch server/index.mjs >>"$LOG_DIR/api.log" 2>&1 &
API_PID=$!
echo "$API_PID" >"$LOG_DIR/api.pid"

"$PROJECT_ROOT/node_modules/.bin/vite" --host 0.0.0.0 --port "$WEB_PORT" >>"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
echo "$WEB_PID" >"$LOG_DIR/web.pid"

if ! wait_for_http "http://127.0.0.1:$API_PORT/api/health" 45; then
  echo "API did not become healthy." >&2
  echo "See logs: $LOG_DIR/api.log"
  exit 1
fi

if ! wait_for_http "http://127.0.0.1:$WEB_PORT" 45; then
  echo "Web did not become available." >&2
  echo "See logs: $LOG_DIR/web.log"
  exit 1
fi

echo "[ready] Web: http://127.0.0.1:$WEB_PORT"
echo "[ready] API: http://127.0.0.1:$API_PORT/api/health"

if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:$WEB_PORT"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:$WEB_PORT"
fi

wait
