#!/data/data/com.termux/files/usr/bin/bash
# opencode-to-api widget starter for Termux:Widget
# Add this to ~/.shortcuts/ or use Termux:Widget to place on home screen

cd /data/data/com.termux/files/home/opencode-to-api || exit 1

# Ensure we're using the right node
export PATH="/data/data/com.termux/files/usr/bin:$PATH"

# Start server in background, capture PID
nohup node src/index.js > /tmp/opapi.log 2>&1 &
PID=$!
echo $PID > /tmp/opapi.pid

# Wait for server to be ready
for i in {1..10}; do
    if curl -sf http://127.0.0.1:18080/health >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

# Open Web GUI in default browser
termux-open-url "http://127.0.0.1:18080/"

# Show notification
termux-notification \
    --title "opencode-to-api" \
    --content "Server running on http://127.0.0.1:18080" \
    --id "opapi" \
    --ongoing \
    --action "termux-open-url http://127.0.0.1:18080/"