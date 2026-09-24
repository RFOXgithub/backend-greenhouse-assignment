import { randomUUID } from "node:crypto";
import mqtt, { type MqttClient } from "mqtt";

const apiUrl = process.env.TEST_API_URL ?? "http://127.0.0.1:8080";
const brokerUrl = process.env.TEST_MQTT_URL ?? "mqtt://127.0.0.1:1883";
const deviceId = process.argv[2] ?? `fan-test-${randomUUID().slice(0, 8)}`;
const command = (process.argv[3] ?? "ON").toUpperCase();
const topic = `greenhouse/control/${deviceId}`;

if (!/^[A-Za-z0-9._-]{1,128}$/.test(deviceId)) {
  throw new Error("device_id hanya boleh berisi huruf, angka, titik, _ atau -");
}

if (command !== "ON" && command !== "OFF") {
  throw new Error("command harus ON atau OFF");
}

function waitForConnection(client: MqttClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout saat terhubung ke broker ${brokerUrl}`));
    }, 5_000);

    client.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    client.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function subscribe(client: MqttClient): Promise<void> {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, { qos: 1 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function waitForMessage(client: MqttClient): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Tidak ada pesan diterima di ${topic} dalam 5 detik`));
    }, 5_000);

    client.once("message", (receivedTopic, payload) => {
      clearTimeout(timeout);
      if (receivedTopic !== topic) {
        reject(new Error(`Topic tidak sesuai: ${receivedTopic}`));
        return;
      }
      resolve(payload.toString());
    });
  });
}

function closeClient(client: MqttClient): Promise<void> {
  return new Promise((resolve) => client.end(false, {}, () => resolve()));
}

async function main(): Promise<void> {
  const client = mqtt.connect(brokerUrl, {
    clientId: `greenhouse-mqtt-test-${randomUUID()}`,
    reconnectPeriod: 0,
    ...(process.env.MQTT_USERNAME && { username: process.env.MQTT_USERNAME }),
    ...(process.env.MQTT_PASSWORD && { password: process.env.MQTT_PASSWORD }),
  });

  try {
    console.log(`Menghubungkan subscriber ke ${brokerUrl} ...`);
    await waitForConnection(client);
    await subscribe(client);
    console.log(`Menunggu pesan pada topic ${topic}`);

    const messagePromise = waitForMessage(client);
    const response = await fetch(`${apiUrl}/device-control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, command }),
    });
    const responseBody: unknown = await response.json();

    if (!response.ok) {
      throw new Error(
        `API merespons HTTP ${response.status}: ${JSON.stringify(responseBody)}`,
      );
    }

    const payload = JSON.parse(await messagePromise) as {
      device_id?: string;
      command?: string;
      command_id?: string;
    };

    if (payload.device_id !== deviceId || payload.command !== command) {
      throw new Error(`Payload MQTT tidak sesuai: ${JSON.stringify(payload)}`);
    }

    console.log("\nMQTT TEST BERHASIL");
    console.log(`Topic   : ${topic}`);
    console.log(`Payload : ${JSON.stringify(payload, null, 2)}`);
    console.log(`API     : ${JSON.stringify(responseBody, null, 2)}`);
  } finally {
    await closeClient(client);
  }
}

main().catch((error: unknown) => {
  console.error("\nMQTT TEST GAGAL");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});


