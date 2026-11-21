#!/data/data/com.termux/files/usr/bin/bash
# opencode-to-api widget stopper for Termux:Widget

PID_FILE="/tmp/opapi.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        termux-notification --remove "opapi"
        termux-toast "opencode-to-api stopped (PID: $PID)"
    else
        termux-toast "opencode-to-api not running"
    fi
    rm -f "$PID_FILE"
else
    # Try to find and kill by port
    PID=$(lsof -ti:18080 2>/dev/null | head -1)
    if [ -n "$PID" ]; then
        kill "$PID"
        termux-toast "opencode-to-api stopped (PID: $PID)"
    else
        termux-toast "opencode-to-api not found"
    fi
fi