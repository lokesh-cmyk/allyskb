#!/usr/bin/env bash
# CLI Tracker Setup Script
# Configures Claude Code to send usage data to your admin dashboard.
#
# Usage: ./cli-tracker-setup.sh

set -euo pipefail

CONFIG_DIR="${HOME}/.claude"
TOKEN_FILE="$CONFIG_DIR/cli-tracker-token"
URL_FILE="$CONFIG_DIR/cli-tracker-url"
HOOKS_DIR="$CONFIG_DIR/hooks"
SETTINGS_FILE="$CONFIG_DIR/settings.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SOURCE="$SCRIPT_DIR/cli-tracker-hook.sh"

echo "=== Claude Code CLI Tracker Setup ==="
echo ""

# Step 1: Get app URL
read -rp "Enter your app URL (e.g. https://allyskb-app.vercel.app/): " APP_URL
APP_URL="${APP_URL%/}" # Remove trailing slash

if [ -z "$APP_URL" ]; then
  echo "Error: App URL is required."
  exit 1
fi

# Step 2: Get API key
echo ""
echo "Create an API key at: ${APP_URL}/settings/api-keys"
echo ""
read -rp "Paste your API key here: " API_KEY

if [ -z "$API_KEY" ]; then
  echo "Error: API key is required."
  exit 1
fi

# Step 3: Save config
mkdir -p "$CONFIG_DIR"
echo -n "$API_KEY" > "$TOKEN_FILE"
echo -n "$APP_URL" > "$URL_FILE"
echo "Saved API key and URL to ~/.claude/"

# Step 4: Install hook script
mkdir -p "$HOOKS_DIR"
cp "$HOOK_SOURCE" "$HOOKS_DIR/cli-tracker.sh"
chmod +x "$HOOKS_DIR/cli-tracker.sh"
echo "Installed hook script to ~/.claude/hooks/cli-tracker.sh"

# Step 5: Configure Claude Code settings
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Add hook configuration using jq
HOOK_CONFIG='{"matcher":"*","hooks":[{"type":"command","command":"~/.claude/hooks/cli-tracker.sh","timeout":10}]}'

UPDATED=$(jq --argjson hook "$HOOK_CONFIG" '
  .hooks //= {} |
  .hooks.Stop //= [] |
  if (.hooks.Stop | map(select(.hooks[]?.command == "~/.claude/hooks/cli-tracker.sh")) | length) == 0
  then .hooks.Stop += [$hook]
  else .
  end
' "$SETTINGS_FILE")

echo "$UPDATED" > "$SETTINGS_FILE"
echo "Added Stop hook to ~/.claude/settings.json"

echo ""
echo "Setup complete! Claude Code will now track usage automatically."
echo "View your stats at: ${APP_URL}/admin/stats (CLI Usage tab)"
