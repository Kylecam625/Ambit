#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  Ambit — Start everything with one command
# ─────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

IDENTITY_PID=""

cleanup() {
  echo ""
  echo -e "${DIM}Shutting down...${NC}"
  if [ -n "$IDENTITY_PID" ] && kill -0 "$IDENTITY_PID" 2>/dev/null; then
    kill "$IDENTITY_PID" 2>/dev/null
    wait "$IDENTITY_PID" 2>/dev/null || true
  fi
  echo -e "${DIM}Done.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# ── Pre-flight checks ─────────────────────────────────────

if [ ! -d "$ROOT_DIR/identity_service/node_modules" ] || [ ! -d "$ROOT_DIR/ambit/node_modules" ]; then
  echo -e "${YELLOW}Dependencies not installed.${NC} Run ${BOLD}./setup.sh${NC} first."
  exit 1
fi

if [ ! -f "$ROOT_DIR/.env.local" ] && [ ! -f "$ROOT_DIR/.env" ]; then
  echo -e "${YELLOW}No .env.local found.${NC} Run ${BOLD}./setup.sh${NC} first."
  exit 1
fi

# ── Start identity service (background) ──────────────────

echo ""
echo -e "${BOLD}${CYAN}Starting Ambit...${NC}"
echo ""

echo -e "  ${DIM}Starting identity service on port 5176...${NC}"
(cd "$ROOT_DIR/identity_service" && node src/server.js) &
IDENTITY_PID=$!

# Give the identity service a moment to start
sleep 1

if ! kill -0 "$IDENTITY_PID" 2>/dev/null; then
  echo -e "  ${RED}✖${NC} Identity service failed to start"
  exit 1
fi

echo -e "  ${GREEN}✔${NC} Identity service running ${DIM}(http://localhost:5176)${NC}"

# ── Start Ambit (foreground) ─────────────────────────────

echo -e "  ${DIM}Starting Ambit on port 3000...${NC}"
echo ""

# Open browser after a short delay (in background)
(
  sleep 3
  if command -v open &>/dev/null; then
    open "http://localhost:3000" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:3000" 2>/dev/null || true
  fi
) &

echo -e "  ${GREEN}Ambit will open at:${NC} ${BOLD}http://localhost:3000${NC}"
echo -e "  ${DIM}Press Ctrl+C to stop everything.${NC}"
echo ""

cd "$ROOT_DIR/ambit" && npm run dev
