# opencode-to-api Widgets & Shortcuts

Kumpulan shortcut/widget untuk akses cepat ke server `opencode-to-api` dari Termux Android.

## 📱 Termux:Widget (Home Screen)

### Prasyarat
1. Install **Termux:Widget** dari F-Droid/Play Store
2. Tambahkan widget ke home screen:
   - Long-press home screen → Widgets → Termux:Widget
   - Pilih script yang diinginkan

### Scripts Tersedia

| Script | Fungsi |
|--------|--------|
| `opapi-start.sh` | Start server + buka Web GUI di browser |
| `opapi-stop.sh` | Stop server |
| `opapi-status.sh` | Cek status (model count, egress, uptime) via toast/notifikasi |
| `opapi-verify.sh` | Jalankan `npm run verify:quick` di background |

### Setup Otomatis
```bash
# Link scripts ke ~/.shortcuts/ (untuk Termux:Widget)
mkdir -p ~/.shortcuts
ln -sf ~/opencode-to-api/widgets/opapi-start.sh ~/.shortcuts/
ln -sf ~/opencode-to-api/widgets/opapi-stop.sh ~/.shortcuts/
ln -sf ~/opencode-to-api/widgets/opapi-status.sh ~/.shortcuts/
ln -sf ~/opencode-to-api/widgets/opapi-verify.sh ~/.shortcuts/

# Make executable
chmod +x ~/.shortcuts/opapi-*.sh
```

---

## ⚡ Shell Aliases (Quick CLI)

Tambahkan ke `~/.bashrc` atau `~/.zshrc`:

```bash
# opencode-to-api aliases
alias opapi-start='cd ~/opencode-to-api && nohup node src/index.js > /tmp/opapi.log 2>&1 & echo $! > /tmp/opapi.pid && sleep 1 && curl -sf http://127.0.0.1:18080/health && termux-open-url http://127.0.0.1:18080/'
alias opapi-stop='kill $(cat /tmp/opapi.pid 2>/dev/null) 2>/dev/null || lsof -ti:18080 | xargs kill 2>/dev/null; rm -f /tmp/opapi.pid; termux-toast "opapi stopped"'
alias opapi-status='curl -sf http://127.0.0.1:18080/health | jq . 2>/dev/null || echo "Not running"'
alias opapi-logs='tail -f /tmp/opapi.log'
alias opapi-verify='cd ~/opencode-to-api && npm run verify:quick'
alias opapi-test='cd ~/opencode-to-api && npm test'
```

Lalu: `source ~/.bashrc`

---

## 🌐 PWA (Progressive Web App)

Web GUI mendukung instalasi sebagai aplikasi mandiri:

1. Buka `http://127.0.0.1:18080/` di Chrome/Edge/Firefox Android
2. Menu (⋮) → **Install app** / **Add to Home screen**
3. Aplikasi akan tersedia di app drawer & home screen

**Fitur PWA:**
- Offline caching via Service Worker
- Shortcuts cepat: Chat Playground, Egress & Relay, Config & Keys
- Fullscreen standalone mode
- Theme color branding

---

## 🔧 Manual Commands

```bash
# Start server (foreground)
cd ~/opencode-to-api && node src/index.js

# Start server (background)
cd ~/opencode-to-api && nohup node src/index.js > /tmp/opapi.log 2>&1 &

# Stop server
kill $(lsof -ti:18080)

# Health check
curl http://127.0.0.1:18080/health

# Quick verify
cd ~/opencode-to-api && npm run verify:quick

# Full test suite
cd ~/opencode-to-api && npm test

# View logs
tail -f /tmp/opapi.log
```

---

## 📂 File Locations

```
~/opencode-to-api/
├── widgets/
│   ├── opapi-start.sh      # Start + open GUI
│   ├── opapi-stop.sh       # Stop server
│   ├── opapi-status.sh     # Status toast/notification
│   ├── opapi-verify.sh     # Quick verify
│   └── README.md           # This file
├── src/web/
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service worker
│   └── index.html          # Web GUI (with PWA support)
└── src/router.js           # Added /manifest.json & /sw.js routes
```

---

## 🐛 Troubleshooting

**Widget tidak jalan?**
- Pastikan script executable: `chmod +x ~/.shortcuts/opapi-*.sh`
- Cek log: `cat /tmp/opapi.log`
- Pastikan Termux:Widget punya izin storage & notifikasi

**PWA tidak bisa install?**
- Harus diakses via HTTPS atau localhost (127.0.0.1)
- Chrome: Menu → Install app
- Firefox: Menu → Install

**Port 18080 busy?**
- Server auto-bump ke 18081-18100
- Cek: `lsof -ti:18080,18081,18082,18083,18084`