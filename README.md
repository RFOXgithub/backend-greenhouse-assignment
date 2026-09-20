# Smart Greenhouse Backend

Backend REST API untuk menyimpan data sensor greenhouse dan mengirim perintah perangkat melalui MQTT. Aplikasi dibuat dengan Node.js, TypeScript, Fastify, PostgreSQL, dan Mosquitto.

## Fitur yang tersedia

- Menyimpan data suhu dan kelembapan ke PostgreSQL.
- Mengirim perintah `ON` atau `OFF` ke topik MQTT perangkat.
- Menyimpan riwayat dan status pengiriman perintah.
- Memeriksa koneksi API, PostgreSQL, dan MQTT.
- Dokumentasi API melalui Swagger UI.
- Validasi request, rate limit 100 request/menit/IP, dan batas body 1 MiB.

## Arsitektur, integrasi MQTT, dan penanganan error

### A. Arsitektur sistem

Aplikasi menggunakan arsitektur backend berlapis (*layered architecture*) agar tanggung jawab setiap bagian mudah dipahami dan diuji:

```text
Client / Swagger / curl
          |
          | HTTP request (JSON)
          v
Fastify REST API
  Route -> Schema validation -> Service -> Repository
                              |             |
                              |             v
                              |         PostgreSQL
                              v
                         MQTT client
                              |
                              v
                    Mosquitto broker lokal
                              |
                              v
              Subscriber / simulasi perangkat
```

- **Route** menerima request HTTP dan meneruskannya ke proses yang sesuai.
- **Schema validation** memastikan bentuk dan nilai input valid sebelum diproses.
- **Service** berisi alur bisnis, seperti menyusun perintah perangkat dan payload MQTT.
- **Repository** menyimpan data sensor serta riwayat perintah ke PostgreSQL.
- **MQTT client** mengirim perintah ke broker Mosquitto.

REST API dipilih sebagai antarmuka untuk aplikasi pengguna, sedangkan MQTT digunakan untuk komunikasi perintah perangkat karena ringan dan menggunakan pola *publish/subscribe*. PostgreSQL menyimpan data sensor dan status perintah agar riwayatnya tetap dapat dilacak. Seluruh komponen dapat dijalankan secara lokal melalui Docker Compose, sehingga pengujian tidak memerlukan perangkat fisik.

### B. Integrasi MQTT

Endpoint `POST /device-control` menerima `device_id` dan perintah `ON` atau `OFF`. Alur penerbitan perintahnya adalah:

1. API memvalidasi request dan membuat ID perintah serta waktu penerbitan.
2. Perintah disimpan ke PostgreSQL dengan status awal `PENDING`.
3. Service membentuk topic terstruktur `greenhouse/control/{device_id}`.
4. Payload JSON diterbitkan ke Mosquitto dengan **QoS 1** dan `retain: false`.
5. Jika publish berhasil, status database diubah menjadi `PUBLISHED`. Jika gagal, status diubah menjadi `FAILED` beserta pesan error.

Contoh untuk perangkat `fan-zone-1`:

```text
Topic: greenhouse/control/fan-zone-1
```

```json
{
  "command_id": "UUID perintah",
  "request_id": "ID request API",
  "device_id": "fan-zone-1",
  "command": "ON",
  "issued_at": "2026-09-20T10:00:00.000Z"
}
```

Koneksi broker diatur melalui `MQTT_URL`. Saat seluruh aplikasi berjalan di Docker, API menggunakan `mqtt://mosquitto:1883`. Saat API dijalankan langsung dari komputer, gunakan `mqtt://127.0.0.1:1883`. MQTT client mencoba menyambung kembali setiap 2 detik jika koneksi terputus dan menggunakan batas waktu koneksi 5 detik.

Mosquitto berperan sebagai broker lokal. Untuk pengujian tanpa perangkat fisik, `mosquitto_sub` dapat bertindak sebagai simulasi perangkat yang menerima pesan. Langkah pengujiannya tersedia pada bagian [Mengontrol perangkat](#mengontrol-perangkat).

### C. Penanganan error dan kasus khusus

API menggunakan format error JSON yang konsisten sehingga client dapat memeriksa `error.code` tanpa bergantung pada teks pesan:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed"
  }
}
```

| Kondisi | HTTP | Kode error | Penanganan |
| --- | ---: | --- | --- |
| Field tidak lengkap, tipe/nilai salah, atau field tambahan | 400 | `VALIDATION_ERROR` | Request ditolak sebelum masuk ke service. |
| Body bukan JSON yang valid | 400 | `MALFORMED_JSON` | Client diminta mengirim JSON yang valid. |
| Route tidak tersedia | 404 | `NOT_FOUND` | Respons menyertakan method dan URL yang tidak ditemukan. |
| Body melebihi 1 MiB | 413 | `PAYLOAD_TOO_LARGE` | Request dihentikan untuk melindungi resource server. |
| Lebih dari 100 request per menit per IP | 429 | `RATE_LIMIT_EXCEEDED` | Client diminta mencoba kembali nanti. |
| PostgreSQL tidak tersedia atau operasi database gagal | 503 | `DATABASE_UNAVAILABLE` | Detail internal tidak dibocorkan kepada client dan error dicatat di log. |
| Broker MQTT terputus atau publish gagal | 503 | `MQTT_UNAVAILABLE` | Riwayat perintah ditandai `FAILED`; MQTT client tetap mencoba reconnect. |
| Error lain yang tidak diperkirakan | 500 | `INTERNAL_ERROR` | Client menerima pesan umum, sedangkan detail error dicatat di log server. |

Kasus khusus yang divalidasi:

- `device_id` wajib berisi 1–128 karakter dan hanya boleh menggunakan huruf, angka, titik (`.`), garis bawah (`_`), atau tanda hubung (`-`). Aturan ini juga mencegah karakter wildcard atau pemisah topic MQTT seperti `/`, `+`, dan `#` disisipkan ke topic.
- `command` hanya menerima `ON` atau `OFF`.
- `temperature` hanya menerima nilai -50 sampai 100.
- `humidity` hanya menerima nilai 0 sampai 100.
- `recorded_at`, jika dikirim, wajib menggunakan format tanggal-waktu ISO 8601.
- Field yang tidak didefinisikan pada schema akan ditolak.
- Endpoint `GET /status` memeriksa koneksi API, PostgreSQL, dan MQTT untuk membantu mendeteksi dependency yang sedang tidak tersedia.

## Persyaratan

Pilih salah satu cara menjalankan aplikasi:

1. Docker: Docker Desktop atau Docker Engine yang sudah mendukung Docker Compose.
2. Lokal: Node.js 22+, PostgreSQL, dan MQTT broker.

## Menjalankan dengan Docker

Cara ini menjalankan API, PostgreSQL, dan Mosquitto sekaligus.

1. Salin file environment:

   PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Linux/macOS:

   ```bash
   cp .env.example .env
   ```

2. Jalankan semua service:

   ```bash
   docker compose up -d --build
   ```

3. Periksa status service:

   ```bash
   docker compose ps
   ```

   Tunggu hingga `api`, `postgres`, dan `mosquitto` berstatus `healthy`.

4. Buka:

   - API health: <http://localhost:8080/status>
   - Swagger UI: <http://localhost:8080/docs>

Melihat log:

```bash
docker compose logs -f api
```

Menghentikan service tanpa menghapus data PostgreSQL:

```bash
docker compose down
```

Untuk sekaligus menghapus volume database:

```bash
docker compose down -v
```

## Menjalankan API secara lokal

API lokal tetap membutuhkan PostgreSQL dan MQTT broker. Langkah berikut menggunakan container hanya untuk kedua dependency tersebut, sedangkan API dijalankan langsung dengan Node.js.

1. Instal dependency Node.js:

   ```bash
   npm ci
   ```

2. Salin file environment seperti pada bagian Docker.

3. Ubah hostname pada `.env` dari nama service Docker menjadi `127.0.0.1`:

   ```env
   DATABASE_URL=postgres://postgres:change_me@127.0.0.1:5432/greenhouse
   MQTT_URL=mqtt://127.0.0.1:1883
   ```

   Nilai `POSTGRES_PASSWORD` harus sama dengan password di `DATABASE_URL`.

4. Jalankan PostgreSQL dan Mosquitto:

   ```bash
   docker compose up -d postgres mosquitto
   ```

5. Jalankan API dalam mode development:

   ```bash
   npm run dev
   ```

Migrasi `migrations/001_init.sql` dijalankan otomatis ketika API dimulai. Tidak ada perintah migrasi manual.

Untuk menjalankan hasil build:

```bash
npm run build
npm start
```

Jika PostgreSQL dan MQTT sudah terpasang langsung di komputer, lewati langkah menjalankan container dan arahkan `DATABASE_URL` serta `MQTT_URL` ke service tersebut.

## Environment variables

| Variable | Wajib | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | Ya | Connection string PostgreSQL. Gunakan host `postgres` di Docker atau `127.0.0.1` saat API berjalan lokal. |
| `MQTT_URL` | Ya | URL broker. Gunakan `mqtt://mosquitto:1883` di Docker atau `mqtt://127.0.0.1:1883` saat lokal. |
| `HOST` | Tidak | Alamat bind API, default `0.0.0.0`. |
| `PORT` | Tidak | Port API, default `8080`. |
| `NODE_ENV` | Tidak | Mode runtime, default `development`. |
| `MQTT_CLIENT_ID` | Tidak | ID client MQTT. Jika kosong, aplikasi membuat ID sendiri. |
| `MQTT_USERNAME` | Tidak | Username MQTT jika broker memerlukan autentikasi. |
| `MQTT_PASSWORD` | Tidak | Password MQTT jika broker memerlukan autentikasi. |
| `LOG_LEVEL` | Tidak | Level log Fastify, default `info`. |
| `POSTGRES_DB` | Untuk Compose | Nama database yang dibuat container PostgreSQL. |
| `POSTGRES_USER` | Untuk Compose | User PostgreSQL yang dibuat container. |
| `POSTGRES_PASSWORD` | Untuk Compose | Password PostgreSQL yang dibuat container. |

Jangan commit file `.env` karena berisi konfigurasi lokal atau rahasia.

## Endpoint

| Method | Path | Fungsi |
| --- | --- | --- |
| `POST` | `/sensor-data` | Menyimpan data sensor. |
| `POST` | `/device-control` | Menyimpan dan menerbitkan perintah ke MQTT. |
| `GET` | `/status` | Memeriksa kondisi API, database, dan MQTT. |
| `GET` | `/docs` | Membuka Swagger UI. |

### Menyimpan data sensor

```bash
curl -X POST http://localhost:8080/sensor-data \
  -H "Content-Type: application/json" \
  -d '{"device_id":"sensor-zone-1","temperature":27.5,"humidity":68.2}'
```

`recorded_at` boleh ditambahkan dalam format tanggal-waktu ISO 8601. Nilai suhu yang diterima adalah -50 sampai 100 dan kelembapan 0 sampai 100.

### Mengontrol perangkat

```bash
curl -X POST http://localhost:8080/device-control \
  -H "Content-Type: application/json" \
  -d '{"device_id":"fan-zone-1","command":"ON"}'
```

Nilai `command` hanya dapat berupa `ON` atau `OFF`. Perintah diterbitkan ke topik `greenhouse/control/{device_id}` dengan QoS 1.

Untuk melihat pesan MQTT ketika menggunakan Docker:

```bash
docker compose exec mosquitto mosquitto_sub -h localhost -t "greenhouse/control/#" -v
```

## Pemeriksaan dan test

Pemeriksaan TypeScript dan build dapat dijalankan tanpa service aktif:

```bash
npm run typecheck
npm run build
```

Integration test membutuhkan stack Docker yang sedang aktif:

```bash
docker compose up -d --build
npm test
```

## Struktur singkat

```text
src/                    source code API
migrations/             schema PostgreSQL
deployments/mosquitto/  konfigurasi broker lokal
tests/                  integration test
compose.yaml            API, PostgreSQL, dan Mosquitto
Dockerfile              image API
```
