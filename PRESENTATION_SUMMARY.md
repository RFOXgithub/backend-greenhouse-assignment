# Smart Greenhouse Backend — Interview Quick Reference

## One-sentence pitch

A production-minded TypeScript backend that validates and stores greenhouse sensor readings, records device-control intent, and publishes auditable ON/OFF commands through MQTT.

## Architecture

`HTTP Client → Fastify Route → TypeBox/AJV Validation → Service → Repository → PostgreSQL`

Device control branches from the service to `MQTT Client → Mosquitto → Device Subscriber`. This is a layered monolith, not microservices. Routes own HTTP, services own workflow, repositories own SQL, and the MQTT module isolates broker access.

## Core data flows

1. **Sensor:** `POST /sensor-data` → validate → create UUID/timestamps → parameterized INSERT → `201`.
2. **Command:** `POST /device-control` → validate → INSERT `PENDING` → publish QoS 1 → UPDATE `PUBLISHED`; on publish failure, UPDATE `FAILED` → `503`.

Important: `PUBLISHED` means the MQTT publish callback succeeded. It does **not** prove that a physical device executed the command.

## Tech stack

Node.js 22, TypeScript strict mode, Fastify 5, TypeBox/AJV, PostgreSQL 17, MQTT.js, Mosquitto 2, Swagger/OpenAPI, Vitest, Docker multi-stage build, and Docker Compose.

## Important endpoints

| Method | Endpoint | Purpose | Main result |
| --- | --- | --- | --- |
| POST | `/sensor-data` | Store temperature/humidity event | `201` |
| POST | `/device-control` | Publish ON/OFF command | `200` or dependency `503` |
| GET | `/status` | Check API, DB query, MQTT connection | `200` / `503` |
| GET | `/docs` | Swagger UI | `200` |

## Database

* `sensor_readings`: UUID, device ID, temperature, humidity, event time, ingestion time.
* `device_commands`: UUID, request ID, device ID, command, topic, `PENDING/PUBLISHED/FAILED`, error, issue/publish times.
* CHECK constraints repeat critical validation. Sensor indexes support latest-per-device and time-based queries.
* No device registry/foreign key; device ID is an external identifier in the current scope.

## MQTT and real-time boundary

Topic: `greenhouse/control/{device_id}`. Publish uses QoS 1, `retain: false`, clean session, 2-second reconnect, and 5-second connect timeout. Device ID validation blocks `/`, `+`, and `#` topic injection. There is no WebSocket/SSE, inbound sensor MQTT subscription, or device acknowledgement.

## Validation, security, reliability

Type coercion disabled; extra fields rejected; sensor ranges enforced; command enum restricted; body limit 1 MiB; rate limit 100 requests/minute/IP; parameterized SQL; stable error codes; dependency details hidden from clients; DB pool timeout; health endpoint; graceful shutdown. Environment variables support MQTT credentials, but the local broker is anonymous and has no TLS. API authentication/authorization is not implemented.

## Testing evidence — verified 20 Sep 2026

* `npm ci`: 0 audit vulnerabilities.
* Strict TypeScript check: passed. Production build: passed.
* Vitest integration suite: **13/13 passed** against the running Docker stack.
* Coverage includes live DB persistence, exact MQTT topic/payload, command status, health, invalid types/ranges, malformed JSON, 1 MiB limit, topic injection, repeated readings, 404, and rate limiting.

## Key engineering decisions and interview-ready trade-offs

* **Persist before publish:** preserves audit trail during broker failure; still has a DB/MQTT dual-write gap.
* **QoS 1 + command ID:** improves delivery but duplicates remain possible; device idempotency is needed.
* **Retain false:** avoids executing stale commands after reconnect.
* **Layered boundaries + typed errors:** keep HTTP, workflow, SQL, and broker failures understandable.
* **Compose health gates:** provide repeatable local startup without physical hardware.
* **Next production steps:** authn/authz, MQTT ACL/TLS, transactional outbox/retry, device acknowledgement, versioned migrations, distributed rate limiting, metrics/tracing, backup/restore, and failure/load tests.

## Scope note

`assignment.md` and `jobdesc.md` were not present in the repository during analysis. Requirement mapping therefore uses `README.md`, source code, schema/configuration, and observed test behavior. Do not claim WebSocket, authentication, device execution confirmation, or production broker security.
