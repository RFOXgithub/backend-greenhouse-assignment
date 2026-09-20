# Interview Preparation — Smart Greenhouse Backend

Dokumen ini mengikuti implementasi yang ada di repository. Bagian “next step” adalah usulan pengembangan, bukan fitur yang sudah tersedia.

## Project Understanding

### 1. Apa tujuan utama project ini?

**Question:** What problem does this backend solve?

**Short Answer:** Backend menerima reading suhu dan kelembapan melalui REST, menyimpannya di PostgreSQL, lalu menerima command ON/OFF dan menerbitkannya ke topic MQTT perangkat. Selain fungsi utama, backend menjaga validasi, audit status command, health dependency, dan error response yang konsisten.

**Detailed Answer:** Sistem memisahkan interface client dari komunikasi perangkat. Client menggunakan HTTP yang mudah diintegrasikan, sedangkan perangkat menerima command melalui MQTT yang ringan dan decoupled. Reading tersimpan sebagai event. Command disimpan terlebih dahulu sebagai `PENDING`, diterbitkan dengan QoS 1, lalu ditandai `PUBLISHED` atau `FAILED`. Dengan demikian, database menjadi sumber audit untuk input sensor dan intent kontrol, walaupun belum menjadi bukti bahwa perangkat benar-benar mengeksekusi command.

### 2. Apa yang secara eksplisit tidak diimplementasikan?

**Question:** Which capabilities are outside the current implementation?

**Short Answer:** Tidak ada authentication/authorization, WebSocket/SSE, inbound sensor via MQTT, device registry, read/history endpoint, device execution acknowledgement, transactional outbox, atau migration version ledger.

**Detailed Answer:** Saya akan menyebut batas ini secara jelas agar tidak overclaim. Real-time hanya terjadi pada delivery MQTT outbound. `PUBLISHED` adalah hasil callback publish, bukan status actuator. Mosquitto lokal menerima anonymous client dan tidak menggunakan TLS. Migration hanya menjalankan `001_init.sql` saat startup. Semua hal tersebut cukup untuk scope assignment lokal, tetapi perlu ditingkatkan untuk production.

## Backend

### 3. Mengapa memakai layered architecture?

**Question:** Why separate route, schema, service, and repository layers?

**Short Answer:** Pemisahan membuat setiap layer memiliki satu tanggung jawab: route untuk HTTP, schema untuk kontrak, service untuk workflow, dan repository untuk SQL. Ini mengurangi coupling dan memperjelas lokasi perubahan serta error handling.

**Detailed Answer:** Route tidak perlu mengetahui detail SQL atau MQTT. Service dapat mengatur urutan persist lalu publish. Repository membungkus error database menjadi `DatabaseOperationError`, sehingga error handler tidak bergantung pada error code driver. Untuk project kecil, jumlah file bertambah, tetapi boundary-nya bernilai karena satu request menyentuh dua dependency eksternal.

### 4. Mengapa memilih Fastify?

**Question:** Why Fastify instead of Express or another framework?

**Short Answer:** Fastify menyediakan schema-based validation, plugin lifecycle, structured logger, body limit, dan integrasi Swagger yang langsung cocok dengan kebutuhan API ini.

**Detailed Answer:** TypeBox mendefinisikan schema request, Fastify/AJV memvalidasinya tanpa coercion, dan schema juga dipakai OpenAPI. Error handler global dan plugin rate limit mudah dipasang. Express juga dapat melakukan hal yang sama, tetapi membutuhkan lebih banyak wiring dan pilihan library tambahan. Keputusan ini berdasarkan kecocokan fitur, bukan hanya benchmark performa.

### 5. Bagaimana aplikasi startup dan shutdown?

**Question:** Walk me through startup and graceful shutdown.

**Short Answer:** Startup mengecek database, menjalankan migration, memulai MQTT client, membangun Fastify, lalu listen. Pada SIGINT/SIGTERM, server berhenti menerima request, MQTT ditutup, pool database diakhiri, lalu process exit.

**Detailed Answer:** Kegagalan database atau migration mencegah aplikasi listen, sehingga container tidak terlihat ready secara palsu. MQTT connection bersifat asynchronous; endpoint status tetap 503 sampai client connected. Pada shutdown, urutannya adalah `app.close()`, `stopMqtt()`, lalu `pool.end()`. Improvement-nya adalah guard agar signal ganda tidak menjalankan shutdown paralel dan memberi timeout shutdown eksplisit.

## Database

### 6. Mengapa ada dua timestamp pada sensor reading?

**Question:** What is the difference between recorded_at and created_at?

**Short Answer:** `recorded_at` adalah waktu kejadian menurut pengirim, sedangkan `created_at` adalah waktu backend membuat record. Keduanya penting untuk membedakan event time dan ingestion time.

**Detailed Answer:** Sensor dapat mengirim data terlambat atau melakukan replay. Tanpa dua timestamp, latency dan keterlambatan tidak dapat dianalisis. Jika `recorded_at` tidak diberikan, service memakai waktu saat ini. Database menyimpan keduanya sebagai `TIMESTAMPTZ`, sehingga representasi waktunya tidak bergantung timezone lokal server.

### 7. Mengapa validasi diulang di database?

**Question:** Why use CHECK constraints when the API already validates input?

**Short Answer:** Database constraint menjaga integritas jika data masuk dari jalur lain, terjadi bug pada aplikasi, atau schema API berubah. Ini merupakan defense in depth.

**Detailed Answer:** `temperature`, `humidity`, format `device_id`, command, dan status memiliki constraint. Validasi API memberi feedback lebih cepat dan ramah, sedangkan database menjadi penjaga terakhir. Duplikasi aturan harus dikelola agar konsisten; pada project ini nilai batasnya sama antara TypeBox dan SQL migration.

### 8. Mengapa tidak ada foreign key device_id?

**Question:** Why is device_id not a foreign key?

**Short Answer:** Scope project tidak memiliki device registry. `device_id` diperlakukan sebagai external identifier sehingga reading dan command dapat diterima tanpa provisioning table.

**Detailed Answer:** Keputusan ini menyederhanakan assignment, tetapi tidak dapat menjamin device benar-benar terdaftar atau aktif. Di production saya akan membuat tabel `devices` dengan status, ownership, capabilities, dan topic policy, lalu memakai foreign key atau validasi registry sebelum command diterbitkan.

### 9. Apa fungsi index yang tersedia?

**Question:** How do the sensor indexes support expected queries?

**Short Answer:** Index `(device_id, recorded_at DESC)` mendukung riwayat terbaru per device, sedangkan index `recorded_at DESC` mendukung query lintas device berdasarkan waktu.

**Detailed Answer:** Source saat ini belum mempunyai GET history endpoint, tetapi index menunjukkan query pattern yang dipersiapkan. Pada volume besar saya akan mengevaluasi query plan, partitioning berdasarkan waktu, BRIN untuk append-heavy data, dan retention policy, bukan menambahkan index tanpa pengukuran.

## API

### 10. Bagaimana request divalidasi?

**Question:** Explain the request validation strategy.

**Short Answer:** TypeBox mendefinisikan tipe, enum, range, pola, dan `additionalProperties: false`; Fastify/AJV menjalankan validasi dengan type coercion dimatikan.

**Detailed Answer:** Sensor menerima device ID aman, temperature -50 sampai 100, humidity 0 sampai 100, dan optional ISO date-time. Device control hanya menerima literal ON atau OFF. Coercion dimatikan supaya string seperti `"27"` tidak diam-diam berubah menjadi number. Error validasi diterjemahkan menjadi HTTP 400 dengan kode stabil.

### 11. Mengapa memakai response error terstruktur?

**Question:** Why does the API use stable error codes?

**Short Answer:** Client dapat menangani kegagalan berdasarkan `error.code` tanpa parsing message yang dapat berubah atau dilokalkan.

**Detailed Answer:** Handler membedakan validation, malformed JSON, oversized body, database unavailable, MQTT unavailable, rate limit, not found, dan unknown error. Error dependency internal tidak dikirim langsung ke client, tetapi dicatat pada log. Satu improvement adalah mendefinisikan response schema di OpenAPI untuk seluruh status code.

### 12. Apakah x-request-id menyediakan idempotency?

**Question:** Does x-request-id make device-control idempotent?

**Short Answer:** Tidak. Header hanya disalin bila string maksimal 128 karakter atau diganti UUID. Tidak ada unique constraint maupun lookup untuk mencegah command duplikat.

**Detailed Answer:** Jika client mengulang request dengan request ID yang sama, record baru dan `command_id` baru tetap dibuat lalu dipublish lagi. Untuk idempotency, saya akan menambah idempotency key per client, unique constraint, menyimpan response pertama, dan mengembalikan hasil yang sama untuk retry yang identik.

## MQTT / IoT

### 13. Mengapa MQTT cocok untuk command perangkat?

**Question:** Why use MQTT for device commands?

**Short Answer:** MQTT ringan, memakai publish/subscribe, memisahkan publisher dari subscriber, dan mendukung QoS serta reconnect—cocok untuk perangkat dengan koneksi terbatas.

**Detailed Answer:** Backend tidak perlu membuka koneksi langsung ke setiap device. Broker mengatur routing berdasarkan topic. Perangkat hanya subscribe ke topic-nya. Namun broker menjadi dependency penting dan harus diamankan dengan credential, ACL, TLS, monitoring, dan high availability pada production.

### 14. Apa arti QoS 1 dalam implementasi ini?

**Question:** What guarantee does QoS 1 provide here?

**Short Answer:** QoS 1 memberikan at-least-once delivery pada jalur client MQTT ke broker, sehingga duplikasi mungkin terjadi. Ia tidak menjamin perangkat mengeksekusi command.

**Detailed Answer:** Callback publish digunakan sebagai sinyal untuk menandai `PUBLISHED`. Dengan clean session dan subscriber yang mungkin offline, delivery semantics ke perangkat juga bergantung pada session subscriber. Payload memiliki `command_id`, sehingga desain device yang baik harus idempotent atau melakukan deduplication berdasarkan ID tersebut.

### 15. Mengapa retain dimatikan?

**Question:** Why publish commands with retain=false?

**Short Answer:** Command lama tidak boleh otomatis dikirim sebagai retained message ketika device baru reconnect karena dapat memicu aksi yang sudah tidak relevan.

**Detailed Answer:** Retained message cocok untuk latest known state, tetapi berisiko untuk imperative command seperti “turn on now.” Jika membutuhkan desired state, saya akan memisahkan topic state/config yang retained dari topic command yang non-retained.

### 16. Bagaimana mencegah topic injection?

**Question:** How does the backend prevent MQTT topic injection?

**Short Answer:** `device_id` hanya boleh berisi huruf, angka, titik, underscore, dan hyphen; karakter `/`, `+`, serta `#` ditolak sebelum topic dibuat.

**Detailed Answer:** Topic selalu dibentuk oleh backend dengan prefix tetap `greenhouse/control/`. Validasi dilakukan pada API dan untuk reading juga diperkuat constraint SQL. Di production, validasi aplikasi harus dilengkapi broker ACL agar client hanya boleh publish/subscribe pada namespace yang diizinkan.

## Event-Driven Architecture

### 17. Apa consistency risk antara database dan MQTT?

**Question:** What happens if MQTT succeeds but the database status update fails?

**Short Answer:** Device mungkin menerima command, tetapi database tetap PENDING atau update FAILED juga gagal. Ini adalah dual-write consistency gap.

**Detailed Answer:** Database dan MQTT tidak berada pada transaksi atomik yang sama. Solusi produksi yang saya pilih adalah transactional outbox: simpan command dan outbox record dalam satu transaksi, lalu worker publish, retry, dan memperbarui status secara idempotent. Reconciliation job juga dapat menemukan record PENDING yang terlalu lama.

### 18. Bagaimana merancang retry agar tidak berbahaya?

**Question:** How would you add retries without causing duplicate actuator actions?

**Short Answer:** Retry harus mempunyai command ID stabil, exponential backoff, batas percobaan, dead-letter state, dan deduplication/idempotency di device.

**Detailed Answer:** Worker tidak membuat command ID baru pada retry. Device menyimpan ID yang sudah diproses atau menerapkan operasi set-state yang idempotent. Setelah batas retry, command masuk FAILED/dead-letter untuk inspeksi. Metric harus membedakan retry, broker failure, acknowledgement timeout, dan permanent device rejection.

## WebSocket / Real-Time

### 19. Apakah project memakai WebSocket?

**Question:** How is real-time frontend communication implemented?

**Short Answer:** Tidak ada WebSocket atau SSE di source code. Real-time hanya berupa publish MQTT dari backend ke subscriber device.

**Detailed Answer:** Frontend push tidak boleh diklaim. Jika dashboard membutuhkan live reading, saya dapat menambahkan WebSocket/SSE hub dan event pipeline setelah persistence. Untuk multi-instance, event tidak cukup disimpan in-memory; perlu broker/shared pub-sub agar client di semua replica menerima update.

### 20. Bagaimana menambahkan acknowledgement perangkat?

**Question:** Design a device acknowledgement flow.

**Short Answer:** Device publish status dengan `command_id` ke topic acknowledgement; backend subscribe, validasi payload, lalu update state secara idempotent.

**Detailed Answer:** Saya akan gunakan topic seperti `greenhouse/status/{device_id}` dan state `ACKNOWLEDGED`, `EXECUTED`, atau `REJECTED`. Backend memverifikasi device ID dan command ID, mengabaikan duplicate event secara aman, menyimpan timestamp, dan menandai timeout bila acknowledgement tidak datang. UI dapat membaca atau menerima update status tersebut.

## Docker

### 21. Apa manfaat multi-stage Dockerfile?

**Question:** Why use a multi-stage image and a non-root user?

**Short Answer:** Builder membawa compiler dan dev dependency; runner hanya membawa output serta production dependency. Image lebih kecil dan attack surface lebih rendah. User `node` menghindari process berjalan sebagai root.

**Detailed Answer:** `npm ci` memastikan install mengikuti lockfile. Source TypeScript dikompilasi di builder. Runner menyalin `dist` dan migration saja, mengekspos port 8080, lalu menjalankan Node. Improvement berikutnya adalah image scanning, pinning digest, read-only filesystem, dan resource limit.

### 22. Bagaimana Compose mengatur readiness?

**Question:** How does Docker Compose coordinate service startup?

**Short Answer:** PostgreSQL dan Mosquitto memiliki health check. API memakai `depends_on` dengan `service_healthy`, lalu memiliki health check sendiri ke `/status`.

**Detailed Answer:** Ini mengurangi race saat local startup, tetapi aplikasi tetap harus toleran terhadap dependency yang turun setelah startup. MQTT client reconnect otomatis. Query database akan menghasilkan 503 jika gagal. Untuk orchestrator production, readiness dan liveness sebaiknya dipisah agar restart policy tidak salah menilai dependency outage.

## Security

### 23. Apa gap security terbesar?

**Question:** What must change before exposing this service publicly?

**Short Answer:** Tambahkan authentication/authorization API, credential dan ACL MQTT, TLS, secret management, network policy, serta distributed rate limiting.

**Detailed Answer:** Environment variable membantu konfigurasi tetapi bukan secret manager. Broker lokal `allow_anonymous true`. Endpoint device-control tidak membatasi siapa yang boleh mengontrol device. Production perlu identity client, mapping permission per device, TLS end-to-end, rotation secret, audit log, dan proxy/gateway yang benar termasuk trusted proxy configuration.

### 24. Apakah error handling membocorkan detail sensitif?

**Question:** How does the API avoid leaking internal errors?

**Short Answer:** Dependency dan unknown errors dipetakan ke pesan umum untuk client, sedangkan detail error dicatat pada log server.

**Detailed Answer:** Client menerima kode seperti `DATABASE_UNAVAILABLE` atau `MQTT_UNAVAILABLE`, bukan SQL message atau connection string. Validation detail memang dikembalikan agar request dapat diperbaiki; sebelum production saya akan meninjau bentuk detail AJV agar tidak mengungkap struktur yang tidak perlu.

## Testing

### 25. Apa yang benar-benar diuji end-to-end?

**Question:** Describe the strongest integration test in the suite.

**Short Answer:** Test device-control subscribe ke exact MQTT topic, mengirim HTTP request, membaca payload dari broker, lalu memeriksa status dan topic yang tersimpan di PostgreSQL.

**Detailed Answer:** Ini mencakup REST route, validation, service orchestration, repository, database, MQTT client, broker, dan subscriber. Sensor test juga memverifikasi nilai yang benar-benar tersimpan. Suite berisi 13 test dan lulus seluruhnya pada verifikasi terakhir.

### 26. Test apa yang masih kurang?

**Question:** What would you test next?

**Short Answer:** Saya akan menambah outage/failure tests, unit test service, concurrency/idempotency tests, response contract tests, migration tests, dan load test.

**Detailed Answer:** Skenario kritis adalah broker down setelah PENDING tersimpan, database gagal setelah publish, reconnect, duplicate QoS message, simultaneous command, shutdown saat request aktif, dan rate limit pada multi-instance. Untuk CI, saya akan membuat environment ephemeral agar test tidak bergantung pada stack yang sudah berjalan manual.

## Error Handling

### 27. Apa kelemahan catch block pada device service?

**Question:** Can the current failure-marking logic hide the original error?

**Short Answer:** Ya. Jika publish gagal lalu update `FAILED` juga gagal, error database dapat menggantikan error MQTT asli. Jika publish berhasil tetapi update `PUBLISHED` gagal, catch juga mencoba menandai FAILED.

**Detailed Answer:** Ini menunjukkan keterbatasan dual write. Refactor minimalnya memisahkan try/catch publish dari update success, menyimpan causal context, dan tidak mengasumsikan update status selalu berhasil. Solusi yang lebih kuat tetap outbox + worker + reconciliation karena tidak mungkin membuat transaksi atomik langsung antara PostgreSQL dan MQTT.

## Scalability

### 28. Apakah backend dapat dijalankan multi-instance?

**Question:** What changes are needed for horizontal scaling?

**Short Answer:** HTTP layer relatif stateless, tetapi MQTT client ID harus unik, rate limit harus shared, migration dipisah, dan command publishing membutuhkan idempotency/outbox.

**Detailed Answer:** Default client ID memakai PID, tetapi `.env.example` menetapkan ID tetap; ID yang sama pada beberapa replica dapat saling disconnect di broker. Rate limit sekarang per-process. Auto-migration pada tiap replica berisiko walaupun DDL idempotent. Shared Redis/gateway, unique MQTT client ID, migration job, dan outbox worker diperlukan.

### 29. Bagaimana menangani pertumbuhan sensor data?

**Question:** How would you scale high-volume telemetry storage?

**Short Answer:** Mulai dari pengukuran query, batching, partitioning waktu, retention, dan archival; bila pola time-series dominan, evaluasi extension atau database khusus berdasarkan kebutuhan.

**Detailed Answer:** Index saat ini cocok untuk query terbaru per device, tetapi ingest tinggi dapat membuat index dan storage besar. Saya akan menetapkan SLO dan retention, partition per bulan/hari, kompresi atau agregasi, batch ingestion, dan memisahkan hot vs cold data. Perubahan teknologi hanya dilakukan setelah bottleneck terbukti.

## Production Readiness

### 30. Apa roadmap produksi yang paling realistis?

**Question:** Prioritize the next production-readiness steps.

**Short Answer:** Pertama amankan akses; kedua perkuat consistency command; ketiga tambah observability dan operability; keempat scale berdasarkan measurement.

**Detailed Answer:** Urutannya: authentication/authorization dan broker ACL/TLS; transactional outbox, retry, idempotency, serta device acknowledgement; versioned migration dan CI ephemeral; metrics, tracing, alert, structured correlation ID; backup/restore, resource limits, deployment probes, dan failure testing. Setelah ada traffic profile, barulah partitioning dan horizontal scaling dioptimalkan.
