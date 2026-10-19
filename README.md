# OpenCode-to-API Standalone

Server API mandiri (*standalone*) yang kompatibel dengan protokol OpenAI (**OpenAI-compatible**), menyediakan akses ke model gratis dari **OpenCode Zen** dan **KiloCode Gateway**. Dirancang agar dapat berjalan langsung di **Termux Android** dan **Windows PowerShell** tanpa memerlukan runtime Pi, OpenCode CLI, atau ekstensi pihak ketiga.

Proyek ini di-porting dan diadaptasi dari implementasi upstream [`mannnrachman/pi-bansos`](https://github.com/mannnrachman/pi-bansos).

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
- **Autentikasi Lokal Mandiri**: Menghasilkan API key lokal acak saat pertama kali berjalan dan menyimpannya secara aman di direktori konfigurasi.
- **Port Auto-Bump**: Menggunakan port default `18080` dan otomatis mencoba port berikutnya (hingga `18100`) jika port sedang terpakai.
- **Katalog & Model Cache**: Instant startup dengan pembacaan cache model lokal dan sinkronisasi otomatis di background.
- **Dual Upstream Handlers**:
  - **OpenCode Zen (Gate v2)**: Penerapan client fingerprinting (v2 gate `/inference/v1`, bit-exact identifier `OPENCODE_ID_MASK`, skema tool resmi verbatim `read` + `shell`, tool aliasing `*_pi` dengan pemulihan otomatis, incremental UTF-8 decoder & SSE event framing preservation).
  - **KiloCode Gateway**: Akses keyless resmi (200 request/jam/IP).
- **Format Streaming & Non-Streaming**: Mendukung format chunk SSE `[DONE]` serta agregasi otomatis stream menjadi respon JSON standar jika klien meminta `stream: false`.

---

## Model yang Didukung

**32 Model Terkurasi (16 OpenCode Zen + 16 KiloCode Gateway)**

### OpenCode Zen (16 Model)
- `muse-spark-1.3-contributor-free` (Responses API, Vision, Reasoning)
- `muse-spark-1.2-contributor-free` (Responses API, Vision, Reasoning)
- `step-5-preview-free` (Reasoning)
- `mimo-v2.6-flash-free` (Vision, Reasoning)
- `ling-3.0-flash-fin-free` (Reasoning)
- `nemotron-3-ultra-free` (1M Context, Reasoning)
- `nemotron-3.5-lightning-free` (Reasoning)
- `big-pickle` (Reasoning)
- `space-bunny-free` (1M Context, Vision, Reasoning)
- `ling-3.1-flash-free` (Reasoning)
- `longcat-2.5-preview-free` (1M Context, Reasoning)
- `deepseek-v4.1-flash-free` (Vision, Reasoning)
- `glm-5.3-flash-free` (Vision, Reasoning)
- `cat-jam-free` (1M Context, Reasoning)
- `ll-alpha-free` (Reasoning)
- `nemotron-3.5-super-vl-free` (1M Context, Vision, Reasoning)

### KiloCode Gateway (16 Model)
- `kilo-auto/free`
- `nvidia/nemotron-3-ultra-550b-a55b:free` (1M Context, Reasoning)
- `nvidia/nemotron-3-super-120b-a12b:free` (Reasoning)
- `dots-studio/dots-3-note-preview:free` (Vision, Reasoning)
- `cohere/north-mini-code:free`
- `poolside/laguna-xs-2.1:free` (Reasoning)
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` (Vision, Reasoning)
- `openrouter/free` (Pinned, Vision)
- `nvidia/nemotron-3.5-lightning:free` (1M Context, Reasoning)
- `nvidia/nemotron-3.5-content-safety:free` (Vision, Reasoning)
- `liquid/lfm-2.5-2.6b:free` (Reasoning)
- `poolside/laguna-s-2.1:free` (Reasoning)
- `thinkingmachines/inkling-small:free` (1M Context, Vision, Reasoning)
- `nvidia/nemotron-3.5-super-vl:free` (1M Context, Vision, Reasoning)
- `stealth/glyph-cluster` (Reasoning)
- `stealth/cat-jam` (1M Context, Reasoning)

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
  • Local API Key  : sk-local-xxxxxxxxxxxxxxxx
  • Active Models  : 32 models available
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
  -H "Authorization: Bearer <LOCAL_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kilo-auto/free",
    "messages": [{"role": "user", "content": "Jelaskan apa itu asynchronous programming!"}],
    "stream": true
  }'

# Non-Streaming
curl http://127.0.0.1:18080/v1/chat/completions \
  -H "Authorization: Bearer <LOCAL_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nemotron-3-ultra-free",
    "messages": [{"role": "user", "content": "Halo!"}],
    "stream": false
  }'
```

### Menggunakan Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:18080/v1",
    api_key="<LOCAL_API_KEY>"  # Gunakan key yang tampil di startup
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

## Lisensi & Atribusi

Proyek ini dilisensikan di bawah **MIT License**.
Implementasi logika upstream, parameter gate OpenCode Zen, dan katalog free model bersumber dari [`pi-bansos`](https://github.com/mannnrachman/pi-bansos) oleh mannrachman.
