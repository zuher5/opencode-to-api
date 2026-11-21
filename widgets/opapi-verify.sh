#!/data/data/com.termux/files/usr/bin/bash
# opencode-to-api quick verify widget

cd /data/data/com.termux/files/home/opencode-to-api || exit 1

# Detect actual port
ACTUAL_PORT=18080
for port in $(seq 18080 18100); do
    if curl -sf "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
        ACTUAL_PORT=$port
        break
    fi
done

termux-toast "Running quick verify on port $ACTUAL_PORT..."

# Run verify:quick in background, show result via notification
nohup bash -c "
    cd /data/data/com.termux/files/home/opencode-to-api
    OUTPUT=\$(PORT=$ACTUAL_PORT npm run verify:quick 2>&1)
    SUMMARY=\$(echo \"\$OUTPUT\" | grep -E \"(OK|FAIL|Summary|usable|broken)\" | tail -5 | tr \"\n\" \"; \")
    termux-notification --title \"opapi verify\" --content \"\${SUMMARY:0:200}\" --id \"opapi-verify\"
    termux-toast \"Verify done: \$SUMMARY\"
" > "$TMPDIR/opapi-verify.log" 2>&1 &