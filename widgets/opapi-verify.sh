#!/data/data/com.termux/files/usr/bin/bash
# opencode-to-api quick verify widget

cd /data/data/com.termux/files/home/opencode-to-api || exit 1

termux-toast "Running quick verify..."

# Run verify:quick in background, show result via notification
nohup bash -c '
    cd /data/data/com.termux/files/home/opencode-to-api
    OUTPUT=$(PORT=18080 npm run verify:quick 2>&1)
    SUMMARY=$(echo "$OUTPUT" | grep -E "(OK|FAIL|Summary|usable|broken)" | tail -5 | tr "\n" "; ")
    termux-notification --title "opapi verify" --content "${SUMMARY:0:200}" --id "opapi-verify"
    termux-toast "Verify done: $SUMMARY"
' > /tmp/opapi-verify.log 2>&1 &