import mqtt, { type MqttClient } from "mqtt";
import { env } from "../config/env.js";

let client: MqttClient | null = null;

export class MqttUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("MQTT_UNAVAILABLE", { cause });
    this.name = "MqttUnavailableError";
  }
}

export function startMqtt(): MqttClient {
  client = mqtt.connect(env.mqttUrl, {
    clientId: env.mqttClientId,
    ...(env.mqttUsername !== undefined && { username: env.mqttUsername }),
    ...(env.mqttPassword !== undefined && { password: env.mqttPassword }),
    clean: true,
    reconnectPeriod: 2_000,
    connectTimeout: 5_000,
  });

  client.on("connect", () => {
    console.info("MQTT connected");
  });

  client.on("reconnect", () => {
    console.warn("MQTT reconnecting");
  });

  client.on("error", (error) => {
    console.error("MQTT error", error.message);
  });

  client.on("close", () => {
    console.warn("MQTT disconnected");
  });

  return client;
}

export function getMqttClient(): MqttClient {
  if (!client) throw new Error("MQTT client not initialized");
  return client;
}

export function mqttConnected(): boolean {
  return Boolean(client?.connected);
}

export async function publishMqtt(
  topic: string,
  payload: string,
): Promise<void> {
  let mqttClient: MqttClient;

  try {
    mqttClient = getMqttClient();
  } catch (error) {
    throw new MqttUnavailableError(error);
  }

  if (!mqttClient.connected) {
    throw new MqttUnavailableError();
  }

  try {
    await new Promise<void>((resolve, reject) => {
      mqttClient.publish(topic, payload, { qos: 1, retain: false }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } catch (error) {
    throw new MqttUnavailableError(error);
  }
}

export async function stopMqtt(): Promise<void> {
  if (!client) return;

  await new Promise<void>((resolve) => {
    client!.end(false, {}, () => resolve());
  });
}
