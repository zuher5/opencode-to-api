#!/data/data/com.termux/files/usr/bin/bash
# opencode-to-api widget status checker for Termux:Widget

# Try to detect running port (18080-18100)
HEALTH_URL=""
for port in $(seq 18080 18100); do
    if curl -sf "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
        HEALTH_URL="http://127.0.0.1:$port/health"
        break
    fi
done

if [ -z "$HEALTH_URL" ]; then
    termux-toast "opencode-to-api: NOT RUNNING"
    termux-notification \
        --title "opencode-to-api" \
        --content "Server is not running. Tap to start." \
        --id "opapi-status" \
        --action "termux-open-url file:///data/data/com.termux/files/home/opencode-to-api/widgets/opapi-start.sh"
    exit 1
fi

RESPONSE=$(curl -sf "$HEALTH_URL" 2>/dev/null)

MODELS=$(echo "$RESPONSE" | grep -o '"models":[0-9]*' | cut -d: -f2)
MODELS=${MODELS:-$(echo "$RESPONSE" | grep -o '"modelsCount":[0-9]*' | cut -d: -f2)}
MODELS=${MODELS:-0}

RELAY=$(echo "$RESPONSE" | grep -o '"active":"[^"]*"' | cut -d'"' -f4)
RELAY=${RELAY:-"direct"}

UPTIME=$(echo "$RESPONSE" | grep -o '"uptime":[0-9.]*' | cut -d: -f2)
UPTIME=${UPTIME:-0}
UPTIME_FMT=$(printf "%.0fs" "$UPTIME")

PORT=$(echo "$HEALTH_URL" | grep -o ':18[0-9][0-9][0-9]' | cut -d: -f2)

termux-toast "opencode-to-api: $MODELS models, $RELAY, port $PORT, up $UPTIME_FMT"

termux-notification \
    --title "opencode-to-api Status" \
    --content "Models: $MODELS | Egress: $RELAY | Port: $PORT | Uptime: $UPTIME_FMT" \
    --id "opapi-status" \
    --action "termux-open-url http://127.0.0.1:$PORT/"