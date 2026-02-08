#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  Spotify Setup — Get your refresh token
# ─────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

REDIRECT_URI="http://127.0.0.1:3000/callback"

echo ""
echo -e "${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Spotify Setup for Ambit          ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Step 1:${NC} Go to ${CYAN}https://developer.spotify.com/dashboard${NC}"
echo "  Click \"Create App\" and fill in:"
echo ""
echo "    App name:     Ambit"
echo "    Description:  Ambit music control"
echo -e "    Redirect URI: ${BOLD}${REDIRECT_URI}${NC}"
echo ""
echo "  Then go to your app's Settings to find your Client ID and Client Secret."
echo ""

read -rp "  Spotify Client ID: " CLIENT_ID
read -rp "  Spotify Client Secret: " CLIENT_SECRET

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo ""
  echo -e "  ${YELLOW}Both Client ID and Client Secret are required.${NC}"
  exit 1
fi

# Build the auth URL
SCOPES="user-read-playback-state%20user-modify-playback-state%20user-read-currently-playing"
AUTH_URL="https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${REDIRECT_URI}', safe=''))"  2>/dev/null || echo "${REDIRECT_URI}" | sed 's/:/%3A/g; s/\//%2F/g')&scope=${SCOPES}"

echo ""
echo -e "  ${BOLD}Step 2:${NC} Opening your browser..."
echo "  Log in to Spotify and click \"Agree\"."
echo ""
echo -e "  ${DIM}(If the browser doesn't open, copy this URL manually:)${NC}"
echo -e "  ${DIM}${AUTH_URL}${NC}"
echo ""

# Open the browser
if command -v open &>/dev/null; then
  open "$AUTH_URL" 2>/dev/null || true
elif command -v xdg-open &>/dev/null; then
  xdg-open "$AUTH_URL" 2>/dev/null || true
fi

echo -e "  ${BOLD}Step 3:${NC} After you approve, you'll be redirected to a URL that looks like:"
echo ""
echo -e "    ${DIM}http://localhost:3000/callback?code=AQBx5...long_string${NC}"
echo ""
echo "  The page won't load (that's fine). Just copy the ENTIRE URL from your browser's address bar."
echo ""

read -rp "  Paste the full redirect URL here: " REDIRECT_RESPONSE

# Extract the code from the URL
CODE=$(echo "$REDIRECT_RESPONSE" | sed -n 's/.*code=\([^&]*\).*/\1/p')

if [ -z "$CODE" ]; then
  echo ""
  echo -e "  ${YELLOW}Couldn't find the code in that URL. Make sure you copied the full URL.${NC}"
  exit 1
fi

echo ""
echo -e "  ${DIM}Exchanging code for refresh token...${NC}"

# Exchange the code for tokens
RESPONSE=$(curl -s -X POST "https://accounts.spotify.com/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=${CODE}" \
  -d "redirect_uri=${REDIRECT_URI}" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}")

REFRESH_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null || echo "")

if [ -z "$REFRESH_TOKEN" ]; then
  echo ""
  echo -e "  ${YELLOW}Failed to get refresh token. Spotify's response:${NC}"
  echo "  $RESPONSE"
  exit 1
fi

echo -e "  ${GREEN}✔${NC} Got refresh token!"
echo ""

# Add to .env file
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE=""

if [ -f "$ROOT_DIR/.env.local" ]; then
  ENV_FILE="$ROOT_DIR/.env.local"
elif [ -f "$ROOT_DIR/.env" ]; then
  ENV_FILE="$ROOT_DIR/.env"
fi

if [ -n "$ENV_FILE" ]; then
  echo "" >> "$ENV_FILE"
  echo "# Spotify integration" >> "$ENV_FILE"
  echo "SPOTIFY_CLIENT_ID=$CLIENT_ID" >> "$ENV_FILE"
  echo "SPOTIFY_CLIENT_SECRET=$CLIENT_SECRET" >> "$ENV_FILE"
  echo "SPOTIFY_REFRESH_TOKEN=$REFRESH_TOKEN" >> "$ENV_FILE"

  echo -e "  ${GREEN}✔${NC} Added Spotify credentials to $(basename "$ENV_FILE")"
else
  echo "  Add these to your .env.local file:"
  echo ""
  echo "  SPOTIFY_CLIENT_ID=$CLIENT_ID"
  echo "  SPOTIFY_CLIENT_SECRET=$CLIENT_SECRET"
  echo "  SPOTIFY_REFRESH_TOKEN=$REFRESH_TOKEN"
fi

echo ""
echo -e "${BOLD}${GREEN}Spotify setup complete!${NC}"
echo ""
echo "  Restart Ambit and ask it to play some music."
echo ""
