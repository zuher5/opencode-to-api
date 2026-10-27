# OpenCode-to-API Standalone

Server API mandiri (*standalone*) yang kompatibel dengan protokol OpenAI (**OpenAI-compatible**), menyediakan akses ke model gratis dari **OpenCode Zen** dan **KiloCode Gateway**. Dirancang agar dapat berjalan langsung di **Termux Android** dan **Windows PowerShell** tanpa memerlukan CLI pihak ketiga atau dependensi eksternal yang rumit.

---

## Fitur Utama

- **Zero Dependency**: Murni dibangun dengan modul bawaan Node.js (Node 20+), tanpa instalasi paket eksternal npm yang berat.
- **Web GUI & Chat Playground**: Tersedia antarmuka web interaktif di `http://127.0.0.1:18080/` untuk chat testing langsung, pengaturan relay kustom, dan salin Local API Key.
- **Manajemen Relay Server**: Dukungan konfigurasi relay egress (toggle on/off, tambah relay kustom, switch relay aktif, dan auto failover dengan cooldown).
- **OpenAI-Compatible**:
  - `GET /v1/models`
  - `POST /v1/chat/completions` (mendukung streaming SSE dan non-streaming!)
  - `POST /v1/responses`
  - `GET /health` & `GET /v1/status`
- **Autentikasi Lokal**: API key default `sk-2004` (dapat dikonfigurasi lewat environment variable `LOCAL_API_KEY`). Mendukung autentikasi melalui header `Authorization: Bearer <key>`, header `x-api-key: <key>`, atau query string `?api_key=<key>`.
- **Port Auto-Bump**: Menggunakan port default `18080` dan otomatis mencoba port berikutnya (hingga `18100`) jika port sedang terpakai.
- **Katalog Otoritatif + Model Cache**: Daftar model kurasi (hasil verifikasi fungsional) adalah sumber kebenaran, sehingga model yang masih hidup tidak pernah hilang hanya karena katalog upstream belum mencantumkannya. Cache lokal dipakai untuk metadata kesegaran & startup instan, dengan sinkronisasi otomatis di background. Hasilnya identik antara start online dan offline (21 model).
- **Dual Upstream Handlers**:
  - **OpenCode Zen (Gate v2)**: Penerapan client fingerprinting (v2 gate `/inference/v1`, bit-exact identifier `OPENCODE_ID_MASK`, skema tool resmi verbatim `read` + `shell`, tool aliasing `*_pi` dengan pemulihan otomatis, CLI `<env>` environment fingerprint injection pada system prompt untuk mencegah fake 429 `FreeUsageLimitError`, re-mint session ID mingguan agar session tidak kadaluarsa >30 hari, serta incremental UTF-8 decoder & SSE event framing preservation).
  - **KiloCode Gateway**: Akses keyless resmi (200 request/jam/IP).
- **Format Streaming & Non-Streaming**: Mendukung format chunk SSE `[DONE]` serta agregasi otomatis stream menjadi respon JSON standar jika klien meminta `stream: false`.
- **Triage Upstream 429/403 + Cooldown Reaktif**: Kegagalan upstream diklasifikasikan dari body, bukan diteruskan mentah-mentah.
  - `429 FreeUsageLimitError` / `Rate limit exceeded` → cooldown **per-model** (90 s, ×2 eskalasi, cap 15 menit; `Retry-After` server dihormati hingga 1 jam).
  - `403 "abusive traffic from this IP address"` → cooldown **seluruh egress upstream** (5 menit, eskalasi) dengan hint untuk memakai/mengganti relay.
  - `403 FreeTierError` varian *shape gate* → diteruskan apa adanya tanpa cooldown (penolakan deterministik; kalau ini muncul berarti gate upstream berubah).
  - Request saat cooldown **fail-fast** (`429`/`503` + header `Retry-After`) tanpa menyentuh upstream, sehingga IP tidak makin dalam kena risk control.
  - Cooldown hanya dicatat dari jawaban egress langsung; saat relay aktif, failover relay yang menangani. Respon `2xx` mereset cooldown model dan flag egress.

---

## Model yang Didukung

**21 Model Terkurasi (8 OpenCode Zen + 13 KiloCode Gateway)**

> Pembaruan Katalog Terverifikasi:
> - **OpenCode Zen**: Menghadirkan `flint-40b-free` (200K Context), peningkatan batas context `deepseek-v4.1-flash-free` menjadi **320K** (max token 64K), serta pembersihan model yang sudah deprecated/tidak aktif.
> - **KiloCode Gateway**: Menghadirkan `recursive/flint-v1.0:free` (262K Context), serta pembersihan model yang sudah 404/tidak tersedia.

### OpenCode Zen (8 Model)
- `beam-free`
- `mimo-v2.6-flash-free` (Vision, Reasoning)
- `nemotron-3.5-lightning-free` (Reasoning)
- `big-pickle` (Reasoning)
- `deepseek-v4.1-flash-free` (320K Context, 64K Max Output, Vision, Reasoning)
- `flint-40b-free` (200K Context, Reasoning — Baru)
- `glm-5.3-flash-free` (Vision, Reasoning)
- `nemotron-3.5-super-vl-free` (1M Context, Vision, Reasoning)

### KiloCode Gateway (13 Model)
- `kilo-auto/free`
- `recursive/flint-v1.0:free` (262K Context, Reasoning — Baru)
- `xingchen-agi/xing4.0-29b-a4b:free` (Reasoning)
- `nvidia/nemotron-3-ultra-550b-a55b:free` (1M Context, Reasoning)
- `nvidia/nemotron-3-super-120b-a12b:free` (Reasoning)
- `dots-studio/dots-3-note-preview:free` (Vision, Reasoning)
- `cohere/north-mini-code:free`
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` (Vision, Reasoning)
- `openrouter/free` (Vision)
- `nvidia/nemotron-3.5-lightning:free` (1M Context, Reasoning)
- `nvidia/nemotron-3.5-content-safety:free` (Vision, Reasoning)
- `poolside/laguna-s-2.1:free` (Reasoning)
- `nvidia/nemotron-3.5-super-vl:free` (1M Context, Vision, Reasoning)

---

## Panduan Instalasi & Penggunaan

### 1. Di Termux Android

Pastikan Node.js sudah terpasang:
```bash
pkg update && pkg install nodejs
```

Masuk ke direktori dan jalankan server:
```bash
cd ~/opencode-to-api
npm start
```

Server akan mencetak URL dan Local API Key saat startup:
```text
┌────────────────────────────────────────────────────────┐
│             OpenCode-to-API Standalone Server          │
│       OpenAI-Compatible Local Proxy for Free Models    │
└────────────────────────────────────────────────────────┘

🚀 Server successfully running!
  • Web Dashboard  : http://127.0.0.1:18080/
  • Local Endpoint : http://127.0.0.1:18080/v1
  • Health Check   : http://127.0.0.1:18080/health
  • Local API Key  : sk-2004
  • Active Models  : 21 models available
```

Buka `http://127.0.0.1:18080/` di browser (Chrome, Firefox, dsb.) untuk mengakses:
1. **Chat Tester**: UI percakapan realtime dengan streaming SSE, visualisasi token reasoning (*thinking process*), dan pengatur parameter.
2. **Relay Server**: Tambah URL worker relay sendiri (Vercel Edge / Cloudflare), aktifkan toggle relay, atau switch relay aktif.
3. **Config & Keys**: Salin Local API Key dan contoh perintah cURL.

### 2. Di Windows PowerShell

Pastikan Node.js (v20+) sudah terinstal di Windows:
```powershell
cd opencode-to-api
npm start
```

---

## Contoh Integrasi Klien

### Menggunakan cURL

```bash
# Chat Completions (Streaming)
curl http://127.0.0.1:18080/v1/chat/completions \
  -H "Authorization: Bearer sk-2004" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kilo-auto/free",
    "messages": [{"role": "user", "content": "Jelaskan apa itu asynchronous programming!"}],
    "stream": true
  }'

# Non-Streaming
curl http://127.0.0.1:18080/v1/chat/completions \
  -H "Authorization: Bearer sk-2004" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "beam-free",
    "messages": [{"role": "user", "content": "Halo!"}],
    "stream": false
  }'
```

### Menggunakan Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:18080/v1",
    api_key="sk-2004"  # Default; override dengan env LOCAL_API_KEY
)

response = client.chat.completions.create(
    model="kilo-auto/free",
    messages=[{"role": "user", "content": "Halo dari Python!"}]
)

print(response.choices[0].message.content)
```

---

## Menjalankan Pengujian (Testing)

Proyek ini dilengkapi dengan unit test dan mock upstream:
```bash
npm test
```

---

## Lisensi

Proyek ini dirilis dan dilisensikan di bawah **MIT License**. Bebas digunakan, dimodifikasi, dan didistribusikan untuk keperluan pribadi maupun pengembangan lebih lanjut.
