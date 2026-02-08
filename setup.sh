#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  Ambit — One-time setup
# ─────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

ok()   { echo -e "  ${GREEN}✔${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✖${NC} $1"; }
step() { echo -e "\n${BOLD}${CYAN}[$1]${NC} ${BOLD}$2${NC}"; }

echo ""
echo -e "${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         Ambit — First-Time Setup       ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════╝${NC}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# ── Step 1: Check for Node.js ──────────────────────────────

step "1/3" "Checking for Node.js..."

if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    ok "Node.js $NODE_VERSION found"
  else
    warn "Node.js $NODE_VERSION found, but v20+ is recommended"
    echo "       Things might still work, but if you hit issues, upgrade Node.js."
    echo "       https://nodejs.org/en/download"
  fi
else
  fail "Node.js is not installed."
  echo ""
  echo "  Ambit needs Node.js to run. Install it from:"
  echo ""
  echo "    https://nodejs.org/en/download"
  echo ""
  echo "  (Pick the LTS version, then re-run this script.)"
  exit 1
fi

if ! command -v npm &>/dev/null; then
  fail "npm is not installed (it usually comes with Node.js)."
  echo "  Reinstall Node.js from https://nodejs.org/en/download"
  exit 1
fi

# ── Step 2: Install dependencies ───────────────────────────

step "2/3" "Installing dependencies..."

echo "  Installing identity_service packages..."
(cd "$ROOT_DIR/identity_service" && npm install --loglevel=error) && ok "identity_service ready" || { fail "identity_service install failed"; exit 1; }

echo "  Installing ambit packages..."
(cd "$ROOT_DIR/ambit" && npm install --loglevel=error) && ok "ambit ready" || { fail "ambit install failed"; exit 1; }

# ── Step 3: Environment file ──────────────────────────────

step "3/3" "Setting up environment variables..."

ENV_FILE="$ROOT_DIR/.env.local"

if [ -f "$ENV_FILE" ]; then
  ok ".env.local already exists — skipping"
  echo ""
  echo "  (To reconfigure, delete .env.local and re-run this script.)"
else
  echo ""
  echo "  Ambit needs two API keys to work. You can get them from:"
  echo ""
  echo "    OpenAI:     https://platform.openai.com/api-keys"
  echo "    ElevenLabs: https://elevenlabs.io/app/settings/api-keys"
  echo ""
  echo "  (Press Enter to skip any key — you can always add them to .env.local later.)"
  echo ""

  read -rp "  OpenAI API key: " OPENAI_KEY
  read -rp "  ElevenLabs API key: " ELEVEN_KEY

  cp "$ROOT_DIR/.env.example" "$ENV_FILE"

  if [ -n "$OPENAI_KEY" ]; then
    # Replace the empty value after OPENAI_API_KEY=
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$OPENAI_KEY|" "$ENV_FILE"
    else
      sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$OPENAI_KEY|" "$ENV_FILE"
    fi
  fi

  if [ -n "$ELEVEN_KEY" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^ELEVENLABS_API_KEY=.*|ELEVENLABS_API_KEY=$ELEVEN_KEY|" "$ENV_FILE"
    else
      sed -i "s|^ELEVENLABS_API_KEY=.*|ELEVENLABS_API_KEY=$ELEVEN_KEY|" "$ENV_FILE"
    fi
  fi

  ok ".env.local created"

  if [ -z "$OPENAI_KEY" ] || [ -z "$ELEVEN_KEY" ]; then
    warn "Some keys were left empty. Edit .env.local to add them before running."
  fi
fi

# ── Done ───────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}Setup complete!${NC}"
echo ""
echo "  To start Ambit, run:"
echo ""
echo -e "    ${BOLD}./start.sh${NC}"
echo ""
