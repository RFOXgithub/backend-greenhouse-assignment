# Slide 1 — Smart Greenhouse Backend

**Tujuan slide:**
Memperkenalkan project, konteks assignment, dan teknologi utama tanpa masuk terlalu cepat ke detail implementasi.

**Yang saya ucapkan:**
“Project yang saya presentasikan adalah Smart Greenhouse Backend. Sistem ini menangani dua kebutuhan utama: menerima data suhu dan kelembapan, lalu mengirim perintah ON atau OFF ke perangkat melalui MQTT. Saya membangunnya dengan Node.js, TypeScript, Fastify, PostgreSQL, dan Mosquitto. Fokus saya bukan hanya membuat endpoint berjalan, tetapi membuat alurnya dapat divalidasi, dilacak, diuji end-to-end, dan mudah dijalankan kembali melalui Docker.”

**Poin yang harus saya ingat:**

* Dua fungsi utama: sensor ingestion dan device control.
* Tekankan kualitas alur, bukan sekadar daftar teknologi.
* Durasi ideal: 30–40 detik.

**Kemungkinan pertanyaan interviewer:**

1. Apa kontribusi utama Anda pada project ini?
2. Mengapa memilih Fastify dan MQTT?

**Jawaban yang disarankan:**

* Saya merancang alur API, pemisahan layer, schema database, integrasi MQTT, error contract, Docker environment, dan integration test.
* Fastify memberi validasi schema dan performa yang baik; MQTT cocok untuk command perangkat karena ringan dan decoupled.

# Slide 2 — The Product in One Minute

**Tujuan slide:**
Membuat audience langsung memahami masalah, pengguna sistem, dan nilai utama backend.

**Yang saya ucapkan:**
“Secara sederhana, backend ini melakukan tiga hal. Pertama, menerima reading sensor melalui HTTP dan menyimpannya sebagai event. Kedua, menerima permintaan kontrol perangkat dan menerjemahkannya menjadi pesan MQTT. Ketiga, menyimpan status command sehingga prosesnya dapat ditelusuri. Client aplikasi berkomunikasi dengan REST API, sedangkan perangkat berlangganan topic MQTT masing-masing. Jadi backend menjadi boundary yang memvalidasi, menyimpan, dan meneruskan data secara konsisten.”

**Poin yang harus saya ingat:**

* Capture, control, trace.
* Client tidak berkomunikasi langsung dengan broker.
* Backend adalah validation dan audit boundary.

**Kemungkinan pertanyaan interviewer:**

1. Siapa pengguna langsung API ini?
2. Apakah sensor mengirim data lewat MQTT?

**Jawaban yang disarankan:**

* Pengguna langsungnya adalah client atau sistem integrasi yang mengirim reading dan command melalui REST.
* Tidak pada implementasi saat ini. Sensor ingestion menggunakan `POST /sensor-data`; MQTT hanya dipakai untuk command outbound.

# Slide 3 — Requirements Mapped to Working Code

**Tujuan slide:**
Menunjukkan hubungan requirement dengan implementasi dan bukti verifikasi yang nyata.

**Yang saya ucapkan:**
“Requirement inti yang terdokumentasi di repository saya petakan langsung ke implementasi. Penyimpanan sensor dilakukan oleh endpoint sensor sampai ke INSERT PostgreSQL. Kontrol perangkat menggunakan status PENDING sebelum publish, lalu berubah menjadi PUBLISHED atau FAILED. Validasi ada di schema API dan constraint database. Seluruh stack dapat dijalankan dengan Docker Compose, dan endpoint status mengecek database serta koneksi MQTT. Perlu saya sampaikan secara transparan bahwa file assignment.md dan jobdesc.md tidak ada di repository ini, sehingga pemetaan ini berdasarkan README dan perilaku yang sudah saya verifikasi.”

**Poin yang harus saya ingat:**

* Jelaskan requirement → code path → test evidence.
* Jangan mengatakan seluruh job description sudah dipenuhi.
* Sebutkan dokumen yang tidak tersedia secara singkat dan netral.

**Kemungkinan pertanyaan interviewer:**

1. Bagaimana Anda memastikan requirement benar-benar terpenuhi?
2. Apakah ada requirement yang belum dapat diverifikasi?

**Jawaban yang disarankan:**

* Saya melacak setiap fungsi ke route, service, repository, schema SQL, lalu menjalankan integration test.
* Ya. Karena assignment.md dan jobdesc.md tidak tersedia, saya tidak mengklaim compliance terhadap dokumen tersebut; hanya terhadap README dan source code.

# Slide 4 — Layered Architecture

**Tujuan slide:**
Menjelaskan struktur backend dan alasan pembagian tanggung jawab tiap layer.

**Yang saya ucapkan:**
“Arsitekturnya menggunakan pemisahan route, schema, service, dan repository. Route menangani kontrak HTTP. TypeBox dan AJV memvalidasi payload sebelum business flow berjalan. Service mengatur workflow seperti pembuatan UUID, timestamp, status command, dan payload MQTT. Repository hanya menangani query parameterized ke PostgreSQL. Integrasi MQTT juga ditempatkan di boundary terpisah. Bentuk ini membuat perubahan transport, workflow, atau storage lebih terlokalisasi, dan error dari dependency bisa diterjemahkan secara konsisten.”

**Poin yang harus saya ingat:**

* Route tipis, service mengorkestrasi, repository mengisolasi SQL.
* MQTT client merupakan adapter dependency tersendiri.
* Ini layered architecture, bukan microservices.

**Kemungkinan pertanyaan interviewer:**

1. Mengapa tidak langsung query database dari route?
2. Apakah pola ini tidak terlalu berlebihan untuk tiga endpoint?

**Jawaban yang disarankan:**

* Pemisahan menjaga HTTP concern dan persistence concern tidak bercampur, serta memudahkan pengujian dan perubahan.
* Untuk project kecil memang ada overhead file, tetapi boundary-nya tetap sederhana dan memperjelas failure handling yang melibatkan database serta MQTT.

# Slide 5 — Two Core Data Flows

**Tujuan slide:**
Menunjukkan urutan proses sensor dan command, termasuk perilaku pada kegagalan.

**Yang saya ucapkan:**
“Ada dua flow utama. Pada sensor ingestion, request divalidasi, service menambahkan UUID dan timestamp, repository menyimpan reading, lalu API memberi 201. Pada device control, intent disimpan lebih dulu dengan status PENDING. Setelah itu backend publish ke topic perangkat dengan QoS 1. Jika callback publish berhasil, status menjadi PUBLISHED; jika gagal, status dicatat FAILED dan API mengembalikan 503. Keputusan menyimpan intent sebelum publish penting agar command yang gagal tetap meninggalkan audit trail.”

**Poin yang harus saya ingat:**

* Sensor flow sinkron dan sederhana.
* Command disimpan sebelum efek eksternal.
* PUBLISHED bukan bukti aktuator sudah bergerak.

**Kemungkinan pertanyaan interviewer:**

1. Mengapa menyimpan PENDING sebelum publish?
2. Apa yang terjadi bila update PUBLISHED gagal setelah MQTT berhasil?

**Jawaban yang disarankan:**

* Agar permintaan tetap dapat dilacak ketika broker unavailable.
* Ini merupakan consistency gap saat ini. Untuk produksi saya akan memakai transactional outbox atau reconciliation worker agar state dapat dipulihkan.

# Slide 6 — Small API Surface, Strict Contracts

**Tujuan slide:**
Memperkenalkan endpoint penting, validasi, dan bentuk response tanpa membebani audience.

**Yang saya ucapkan:**
“API sengaja kecil. `POST /sensor-data` menyimpan reading dan mengembalikan 201. `POST /device-control` mengirim command dan mengembalikan hasil publish atau 503 bila dependency gagal. `GET /status` memeriksa service, database, dan MQTT. `GET /docs` menyediakan Swagger UI. Semua error memakai envelope yang stabil dengan `error.code`, sehingga client tidak perlu membaca teks pesan. Schema yang sama juga menjadi sumber dokumentasi OpenAPI.”

**Poin yang harus saya ingat:**

* Hanya empat endpoint yang relevan.
* Error code stabil untuk consumer.
* Tidak ada endpoint read/history pada scope ini.

**Kemungkinan pertanyaan interviewer:**

1. Mengapa device control mengembalikan 200, bukan 202?
2. Mengapa response schema tidak didefinisikan di route?

**Jawaban yang disarankan:**

* Implementasi menunggu callback publish sebelum merespons, sehingga 200 masih konsisten. Untuk workflow async/outbox, 202 lebih tepat.
* Request schema sudah kuat, tetapi response schema memang improvement yang saya prioritaskan untuk kontrak dan serialisasi yang lebih ketat.

# Slide 7 — PostgreSQL Design

**Tujuan slide:**
Menjelaskan dua entity utama, constraint, index, dan keputusan tidak membuat tabel device.

**Yang saya ucapkan:**
“Database memiliki dua tabel independen. `sensor_readings` menyimpan event pembacaan beserta waktu yang dilaporkan dan waktu dibuat. `device_commands` menyimpan request ID, topic, command, lifecycle status, dan error bila ada. Validasi penting diulang sebagai CHECK constraint supaya integritas tidak hanya bergantung pada API. Index pada device dan recorded_at mendukung pencarian time-series per device. Tidak ada foreign key ke tabel device karena device ID diperlakukan sebagai identifier eksternal dan scope project belum mencakup registry perangkat.”

**Poin yang harus saya ingat:**

* Bedakan `recorded_at` dan `created_at`.
* Constraint database adalah defense in depth.
* Device registry belum ada.

**Kemungkinan pertanyaan interviewer:**

1. Mengapa memakai DOUBLE PRECISION untuk sensor?
2. Bagaimana database akan berkembang saat data sangat besar?

**Jawaban yang disarankan:**

* Cukup untuk telemetry umum, tetapi bila presisi desimal bisnis harus eksak saya akan memilih NUMERIC.
* Saya akan menambah retention policy, partitioning berdasarkan waktu, index yang disesuaikan query, dan archival untuk data lama.

# Slide 8 — MQTT Event-Driven Delivery

**Tujuan slide:**
Menjelaskan peran publisher, broker, subscriber, topic, QoS, dan proteksi topic.

**Yang saya ucapkan:**
“Backend bertindak sebagai publisher, Mosquitto sebagai broker, dan perangkat sebagai subscriber. Topic dibentuk menjadi `greenhouse/control/{device_id}`. Publish menggunakan QoS 1, jadi backend meminta acknowledgement dari broker dan pesan dapat terkirim setidaknya sekali. Retain dimatikan agar perangkat baru tersambung tidak otomatis menerima command lama. Device ID dibatasi supaya karakter `/`, `+`, dan `#` tidak bisa dipakai untuk mengubah struktur atau wildcard topic. Client juga mencoba reconnect setiap dua detik dengan connect timeout lima detik.”

**Poin yang harus saya ingat:**

* QoS 1 = at least once, potensi duplikasi.
* `retain: false` menghindari stale command.
* Broker acknowledgement bukan device acknowledgement.

**Kemungkinan pertanyaan interviewer:**

1. Mengapa QoS 1, bukan 0 atau 2?
2. Bagaimana perangkat menangani pesan duplikat?

**Jawaban yang disarankan:**

* QoS 1 adalah kompromi reliability dan overhead yang baik untuk command sederhana.
* Payload membawa `command_id`; device seharusnya menyimpan ID terakhir atau membuat handler idempotent. Logic itu belum ada di repository ini.

# Slide 9 — Real-Time Delivery Boundaries

**Tujuan slide:**
Mencegah klaim berlebihan tentang real-time dan memperjelas arti status PUBLISHED.

**Yang saya ucapkan:**
“Real-time pada implementasi ini berada di jalur MQTT dari backend ke subscriber perangkat. Tidak ada WebSocket atau SSE untuk frontend, tidak ada subscription sensor inbound melalui MQTT, dan belum ada acknowledgement eksekusi dari device. Karena itu status PUBLISHED hanya berarti callback publish MQTT berhasil—bukan berarti kipas atau pompa sudah benar-benar menyala. Untuk menutup gap tersebut, perangkat perlu publish acknowledgement ke topic status, lalu backend menambahkan state seperti ACKNOWLEDGED atau EXECUTED.”

**Poin yang harus saya ingat:**

* Jujur tentang fitur yang tidak ada.
* Real-time device delivery berbeda dari frontend push.
* Jelaskan rancangan lanjutan tanpa mengklaim sudah dibuat.

**Kemungkinan pertanyaan interviewer:**

1. Mengapa tidak memakai WebSocket?
2. Bagaimana menambahkan device acknowledgement?

**Jawaban yang disarankan:**

* Scope API saat ini belum membutuhkan push ke browser; polling status pun belum tersedia karena tidak ada read endpoint.
* Tambahkan topic `greenhouse/status/{device_id}`, correlation melalui `command_id`, subscriber backend, timeout, dan state transition yang idempotent.

# Slide 10 — Validation, Security & Reliability

**Tujuan slide:**
Menunjukkan kontrol nyata sekaligus menyampaikan gap keamanan produksi.

**Yang saya ucapkan:**
“Pertahanannya berlapis. Request divalidasi TypeBox/AJV tanpa type coercion dan field tambahan ditolak. Body dibatasi satu MiB, rate limit global 100 request per menit per IP, SQL memakai parameter, dan device ID mencegah topic injection. Untuk reliability, pool database mempunyai connection timeout, MQTT reconnect otomatis, status endpoint memeriksa dependency, dan shutdown menutup HTTP, MQTT, serta pool. Batasnya: API belum memiliki authentication atau authorization, dan konfigurasi Mosquitto lokal masih anonymous tanpa TLS. Jadi setup ini tepat untuk assignment dan local development, belum untuk internet-facing production.”

**Poin yang harus saya ingat:**

* Security control yang ada dan yang belum ada harus dipisahkan.
* Secret dibaca dari environment, tidak ditampilkan.
* Error internal dicatat, response client disederhanakan.

**Kemungkinan pertanyaan interviewer:**

1. Apa prioritas security pertama sebelum production?
2. Apakah rate limit saat ini bekerja pada banyak replica?

**Jawaban yang disarankan:**

* Tambahkan authn/authz, broker credential + ACL + TLS, secret manager, dan network restriction.
* Belum secara global; in-memory limiter per instance perlu dipindah ke shared store seperti Redis atau gateway.

# Slide 11 — Verification Evidence

**Tujuan slide:**
Memberikan bukti kualitas berdasarkan perintah dan skenario yang benar-benar dijalankan.

**Yang saya ucapkan:**
“Saya memverifikasi project pada 20 September 2026. TypeScript strict check dan production build berhasil. NPM audit melaporkan nol vulnerability pada dependency yang terpasang. Integration suite berisi 13 test dan semuanya lulus terhadap stack Docker aktif. Test tidak hanya mengecek status HTTP: sensor diverifikasi masuk ke PostgreSQL, command ditangkap subscriber MQTT pada topic yang tepat, lalu status database diverifikasi. Negative cases mencakup payload salah, malformed JSON, body terlalu besar, topic injection, rate limit, dan 404.”

**Poin yang harus saya ingat:**

* 13/13 adalah integration tests, bukan unit-test count.
* Database dan broker benar-benar disentuh.
* Jangan mengklaim load test atau failure injection yang tidak ada.

**Kemungkinan pertanyaan interviewer:**

1. Apa kekurangan test suite saat ini?
2. Mengapa integration test memanggil Docker CLI untuk query database?

**Jawaban yang disarankan:**

* Belum ada unit test service, broker/database outage test, concurrency test, contract test response, atau load test.
* Itu membuat verifikasi DB mudah pada local Compose, tetapi lebih portable jika memakai test container atau koneksi test DB langsung.

# Slide 12 — Containerized Runtime

**Tujuan slide:**
Menjelaskan cara menjalankan sistem, startup order, image hardening dasar, dan persistence lokal.

**Yang saya ucapkan:**
“Docker Compose menjalankan API, PostgreSQL 17, dan Mosquitto 2. API dibangun melalui multi-stage Dockerfile: dependency development dan compiler hanya berada di builder, sedangkan runner memasang production dependency dan berjalan sebagai user `node`. Compose menunggu database dan broker healthy sebelum memulai API. Saat startup, aplikasi mengecek database, menjalankan migration SQL yang idempotent, memulai MQTT client, lalu listen di port 8080. Volume menjaga data PostgreSQL ketika container dihentikan tanpa opsi penghapusan volume.”

**Poin yang harus saya ingat:**

* Multi-stage dan non-root runner.
* Dependency start diatur lewat health condition.
* Migration saat ini hanya satu file, belum ada migration ledger.

**Kemungkinan pertanyaan interviewer:**

1. Apakah auto-migration saat startup aman untuk banyak replica?
2. Apa yang hilang ketika `docker compose down -v` dijalankan?

**Jawaban yang disarankan:**

* Untuk satu instance dan idempotent DDL cukup, tetapi produksi sebaiknya memakai migration job terpisah dan version tracking/lock.
* Named volume PostgreSQL dihapus, sehingga seluruh data lokal database hilang.

# Slide 13 — Engineering Decisions & Trade-offs

**Tujuan slide:**
Menonjolkan problem solving serta kemampuan melihat trade-off dari keputusan teknis.

**Yang saya ucapkan:**
“Empat keputusan paling penting adalah: menyimpan intent sebelum publish agar kegagalan tetap tercatat; membatasi device ID agar topic aman; memakai typed dependency errors supaya response stabil dan detail internal tetap di log; serta membuat Compose dengan health check agar demo dapat direproduksi tanpa hardware. Trade-off terbesar ada pada dual write database dan MQTT. Solusi sekarang cukup untuk scope assignment, tetapi untuk produksi saya akan menggantinya dengan transactional outbox dan worker retry agar publish dapat dipulihkan tanpa ambiguity.”

**Poin yang harus saya ingat:**

* Kaitkan problem → decision → result → next step.
* Jangan menyebut outbox sudah diimplementasikan.
* Tekankan auditability dan reproducibility.

**Kemungkinan pertanyaan interviewer:**

1. Jelaskan transactional outbox untuk project ini.
2. Apa kelemahan error handling command sekarang?

**Jawaban yang disarankan:**

* Simpan command dan outbox event dalam satu transaksi DB; worker publish MQTT, mencatat hasil, dan retry dengan idempotency.
* Publish sukses tetapi update DB gagal dapat membuat status tidak sesuai; kegagalan saat menandai FAILED juga dapat menutupi error MQTT asli.

# Slide 14 — Outcome & Next Steps

**Tujuan slide:**
Menutup dengan hasil, batasan, dan roadmap produksi yang konkret.

**Yang saya ucapkan:**
“Kesimpulannya, project ini sudah menyediakan ingestion sensor yang tervalidasi, command device yang dapat diaudit, dan integrasi MQTT yang diuji bersama database. Implementasinya ringkas, tetapi mempunyai error contract, health check, rate limit, graceful shutdown, serta environment Docker yang repeatable. Untuk membawa sistem ke production, prioritas saya adalah authentication dan authorization, ACL/TLS broker, device acknowledgement, transactional outbox dengan retry, dan observability seperti metrics serta tracing. Terima kasih, saya siap membahas keputusan atau source code lebih detail.”

**Poin yang harus saya ingat:**

* Tutup dengan tiga hasil nyata.
* Roadmap harus relevan dengan gap yang ditemukan.
* Berhenti setelah “Questions?” dan beri ruang interviewer.

**Kemungkinan pertanyaan interviewer:**

1. Improvement mana yang akan Anda kerjakan pertama?
2. Bagian mana yang paling ingin Anda refactor?

**Jawaban yang disarankan:**

* Jika internet-facing, auth dan broker security lebih dulu; untuk reliability command, outbox dan acknowledgement berikutnya.
* Saya akan memisahkan command persistence dari publish dengan outbox, lalu menambah response schema dan migration tooling.
