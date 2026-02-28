#!/usr/bin/env bash
# Claude Code CLI Usage Tracker Hook
# Fires on Stop events, reads session data, pushes to admin dashboard.
# Install via: cli-tracker-setup.sh

set -euo pipefail

CONFIG_DIR="${CLAUDE_HOME:-$HOME/.claude}"
TOKEN_FILE="$CONFIG_DIR/cli-tracker-token"
URL_FILE="$CONFIG_DIR/cli-tracker-url"
BUFFER_DIR="$CONFIG_DIR/usage-buffer"

# Read hook input from stdin
INPUT=$(cat)

# Extract session info from hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

# Read config
if [ ! -f "$TOKEN_FILE" ] || [ ! -f "$URL_FILE" ]; then
  exit 0
fi

API_TOKEN=$(cat "$TOKEN_FILE")
APP_URL=$(cat "$URL_FILE")

if [ -z "$API_TOKEN" ] || [ -z "$APP_URL" ]; then
  exit 0
fi

# Extract project name from CWD
PROJECT=""
if [ -n "$CWD" ]; then
  PROJECT=$(basename "$CWD")
fi

# Locate session file
ENCODED_CWD=$(echo "$CWD" | sed 's|/|%2F|g; s|:|%3A|g; s| |%20|g')
SESSION_FILE=""
for pattern in \
  "$CONFIG_DIR/projects/$ENCODED_CWD/sessions/$SESSION_ID.jsonl" \
  "$CONFIG_DIR/projects/${ENCODED_CWD}/sessions/${SESSION_ID}.jsonl"; do
  if [ -f "$pattern" ]; then
    SESSION_FILE="$pattern"
    break
  fi
done

# Parse session data
INPUT_TOKENS=0
OUTPUT_TOKENS=0
TURNS=0
TOOL_CALLS=0
MODEL=""
STARTED_AT=""

if [ -n "$SESSION_FILE" ] && [ -f "$SESSION_FILE" ]; then
  STATS=$(jq -s '
    {
      inputTokens: [.[] | select(.type == "assistant") | .usage.input_tokens // 0] | add // 0,
      outputTokens: [.[] | select(.type == "assistant") | .usage.output_tokens // 0] | add // 0,
      turns: [.[] | select(.type == "user_message" or .type == "human")] | length,
      toolCalls: [.[] | select(.type == "tool_result" or .type == "tool_use")] | length,
      model: ([.[] | select(.type == "assistant" and .model != null) | .model] | last // ""),
      startedAt: ([.[] | select(.timestamp != null) | .timestamp] | first // "")
    }
  ' "$SESSION_FILE" 2>/dev/null || echo '{}')

  INPUT_TOKENS=$(echo "$STATS" | jq -r '.inputTokens // 0')
  OUTPUT_TOKENS=$(echo "$STATS" | jq -r '.outputTokens // 0')
  TURNS=$(echo "$STATS" | jq -r '.turns // 0')
  TOOL_CALLS=$(echo "$STATS" | jq -r '.toolCalls // 0')
  MODEL=$(echo "$STATS" | jq -r '.model // ""')
  STARTED_AT=$(echo "$STATS" | jq -r '.startedAt // ""')
fi

LAST_ACTIVE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_BRANCH=$(cd "$CWD" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Build payload
PAYLOAD=$(jq -n \
  --arg sessionId "$SESSION_ID" \
  --arg project "$PROJECT" \
  --arg model "$MODEL" \
  --argjson inputTokens "$INPUT_TOKENS" \
  --argjson outputTokens "$OUTPUT_TOKENS" \
  --argjson turns "$TURNS" \
  --argjson toolCalls "$TOOL_CALLS" \
  --arg startedAt "$STARTED_AT" \
  --arg lastActiveAt "$LAST_ACTIVE" \
  --arg gitBranch "$GIT_BRANCH" \
  '{
    sessionId: $sessionId,
    project: $project,
    model: (if $model == "" then null else $model end),
    inputTokens: $inputTokens,
    outputTokens: $outputTokens,
    turns: $turns,
    toolCalls: $toolCalls,
    startedAt: (if $startedAt == "" then null else $startedAt end),
    lastActiveAt: $lastActiveAt,
    metadata: { gitBranch: (if $gitBranch == "" then null else $gitBranch end) }
  }')

# Try to send
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$APP_URL/api/cli-usage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "$PAYLOAD" \
  --connect-timeout 5 \
  --max-time 8 \
  2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  # Success — sync any buffered entries
  if [ -d "$BUFFER_DIR" ]; then
    for buf_file in "$BUFFER_DIR"/*.json; do
      [ -f "$buf_file" ] || continue
      BUF_PAYLOAD=$(cat "$buf_file")
      BUF_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$APP_URL/api/cli-usage" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_TOKEN" \
        -d "$BUF_PAYLOAD" \
        --connect-timeout 3 \
        --max-time 5 \
        2>/dev/null || echo -e "\n000")
      BUF_CODE=$(echo "$BUF_RESPONSE" | tail -1)
      if [ "$BUF_CODE" = "200" ] || [ "$BUF_CODE" = "201" ]; then
        rm -f "$buf_file"
      fi
    done
  fi
else
  # Failed — buffer locally
  mkdir -p "$BUFFER_DIR"
  echo "$PAYLOAD" > "$BUFFER_DIR/${SESSION_ID}.json"
fi

exit 0
