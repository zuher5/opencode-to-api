#!/data/data/com.termux/files/usr/bin/bash
# opencode-to-api widget status checker for Termux:Widget

HEALTH_URL="http://127.0.0.1:18080/health"

# Try to get health
RESPONSE=$(curl -sf "$HEALTH_URL" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
    termux-toast "opencode-to-api: NOT RUNNING"
    termux-notification \
        --title "opencode-to-api" \
        --content "Server is not running. Tap to start." \
        --id "opapi-status" \
        --action "termux-open-url file:///data/data/com.termux/files/home/opencode-to-api/widgets/opapi-start.sh"
    exit 1
fi

# Parse JSON (requires jq or use grep/sed)
MODELS=$(echo "$RESPONSE" | grep -o '"models":[0-9]*' | cut -d: -f2)
MODELS=${MODELS:-$(echo "$RESPONSE" | grep -o '"modelsCount":[0-9]*' | cut -d: -f2)}
MODELS=${MODELS:-0}

RELAY=$(echo "$RESPONSE" | grep -o '"active":"[^"]*"' | cut -d'"' -f4)
RELAY=${RELAY:-"direct"}

UPTIME=$(echo "$RESPONSE" | grep -o '"uptime":[0-9.]*' | cut -d: -f2)
UPTIME=${UPTIME:-0}
UPTIME_FMT=$(printf "%.0fs" "$UPTIME")

termux-toast "opencode-to-api: $MODELS models, $RELAY, up $UPTIME_FMT"

termux-notification \
    --title "opencode-to-api Status" \
    --content "Models: $MODELS | Egress: $RELAY | Uptime: $UPTIME_FMT" \
    --id "opapi-status" \
    --action "termux-open-url http://127.0.0.1:18080/"