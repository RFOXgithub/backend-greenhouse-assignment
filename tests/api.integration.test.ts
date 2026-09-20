import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";
import mqtt, { type MqttClient } from "mqtt";
import { describe, expect, it } from "vitest";

dotenv.config({ quiet: true });

const apiBaseUrl = process.env.TEST_API_URL ?? "http://127.0.0.1:8080";
const mqttUrl = process.env.TEST_MQTT_URL ?? "mqtt://127.0.0.1:1883";
const executeFile = promisify(execFile);

async function queryDatabase(sql: string): Promise<string> {
  const { stdout } = await executeFile("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    process.env.POSTGRES_USER ?? "postgres",
    "-d",
    process.env.POSTGRES_DB ?? "greenhouse",
    "-tA",
    "-c",
    sql,
  ]);
  return stdout.trim();
}

async function postJson(path: string, body: unknown) {
  return fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function connectMqtt(): Promise<MqttClient> {
  const client = mqtt.connect(mqttUrl, {
    clientId: `greenhouse-integration-test-${randomUUID()}`,
    reconnectPeriod: 0,
  });

  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("error", reject);
  });

  return client;
}

async function closeMqtt(client: MqttClient): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    client.end(false, {}, (error) => (error ? reject(error) : resolve())),
  );
}

describe("Smart Greenhouse API integration", () => {
  it("reports backend, PostgreSQL, and MQTT as healthy", async () => {
    const response = await fetch(`${apiBaseUrl}/status`);
    const body = (await response.json()) as {
      status: string;
      service: { status: string };
      database: { status: string };
      mqtt: { status: string };
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "healthy",
      service: { status: "up" },
      database: { status: "up" },
      mqtt: { status: "up" },
    });
  });

  it("stores a valid sensor reading in PostgreSQL", async () => {
    const deviceId = `sensor-test-${randomUUID()}`;
    const response = await postJson("/sensor-data", {
      device_id: deviceId,
      temperature: 27.5,
      humidity: 68.2,
    });
    const body = (await response.json()) as {
      success: boolean;
      data: { id: string; device_id: string };
    };

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.device_id).toBe(deviceId);

    const stored = await queryDatabase(
      `SELECT temperature || ',' || humidity FROM sensor_readings WHERE id = '${body.data.id}'`,
    );
    expect(stored).toBe("27.5,68.2");
  });

  it.each([
    ["missing required field", { device_id: "sensor-invalid", temperature: 20 }],
    [
      "wrong data type",
      { device_id: "sensor-invalid", temperature: "hot", humidity: 50 },
    ],
    [
      "out-of-range value",
      { device_id: "sensor-invalid", temperature: 20, humidity: 101 },
    ],
  ])("rejects sensor payload with %s", async (_name, payload) => {
    const response = await postJson("/sensor-data", payload);
    const body = (await response.json()) as {
      success: boolean;
      error: { code: string };
    };

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns a safe 400 response for malformed JSON", async () => {
    const response = await fetch(`${apiBaseUrl}/sensor-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"device_id":',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "MALFORMED_JSON" },
    });
  });

  it("rejects payloads above the configured 1 MiB limit", async () => {
    const response = await fetch(`${apiBaseUrl}/sensor-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "x".repeat(1024 * 1024) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("publishes a valid device command to the exact MQTT topic", async () => {
    const deviceId = `fan-test-${randomUUID()}`;
    const topic = `greenhouse/control/${deviceId}`;
    const client = await connectMqtt();

    try {
      await new Promise<void>((resolve, reject) => {
        client.subscribe(topic, { qos: 1 }, (error) =>
          error ? reject(error) : resolve(),
        );
      });
      const messagePromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Timed out waiting for MQTT command")),
          5_000,
        );
        client.once("message", (_topic, payload) => {
          clearTimeout(timeout);
          resolve(payload.toString());
        });
      });

      const response = await postJson("/device-control", {
        device_id: deviceId,
        command: "ON",
      });
      const body = (await response.json()) as {
        success: boolean;
        data: { id: string; topic: string; status: string };
      };
      const message = JSON.parse(await messagePromise) as {
        device_id: string;
        command: string;
      };

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ topic, status: "PUBLISHED" });
      expect(message).toMatchObject({ device_id: deviceId, command: "ON" });

      const stored = await queryDatabase(
        `SELECT status || ',' || mqtt_topic FROM device_commands WHERE id = '${body.data.id}'`,
      );
      expect(stored).toBe(`PUBLISHED,${topic}`);
    } finally {
      await closeMqtt(client);
    }
  });

  it.each([
    ["invalid command", { device_id: "fan-1", command: "OPEN" }],
    ["MQTT topic injection", { device_id: "fan/+/attack", command: "ON" }],
  ])("rejects device control with %s", async (_name, payload) => {
    const response = await postJson("/device-control", payload);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("accepts repeated readings as separate events", async () => {
    const deviceId = `sensor-repeat-${randomUUID()}`;
    const payload = { device_id: deviceId, temperature: 25, humidity: 50 };
    const first = await postJson("/sensor-data", payload);
    const second = await postJson("/sensor-data", payload);

    expect([first.status, second.status]).toEqual([201, 201]);
    const stored = await queryDatabase(
      `SELECT COUNT(*) FROM sensor_readings WHERE device_id = '${deviceId}'`,
    );
    expect(stored).toBe("2");
  });

  it("returns a structured 404 response", async () => {
    const response = await fetch(`${apiBaseUrl}/unknown-endpoint`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("enforces the global rate limit", async () => {
    let rateLimited = false;

    for (let index = 0; index < 110; index += 1) {
      const response = await fetch(`${apiBaseUrl}/status?rate_test=${index}`);
      if (response.status === 429) {
        rateLimited = true;
        break;
      }
    }

    expect(rateLimited).toBe(true);
  });
});
