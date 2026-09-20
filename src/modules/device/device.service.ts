import { randomUUID } from "node:crypto";
import { publishMqtt } from "../../mqtt/client.js";
import {
  insertDeviceCommand,
  markDeviceCommandFailed,
  markDeviceCommandPublished,
} from "./device.repository.js";

export interface DeviceControlInput {
  device_id: string;
  command: "ON" | "OFF";
}

export async function controlDevice(
  input: DeviceControlInput,
  requestId: string,
) {
  const id = randomUUID();
  const topic = `greenhouse/control/${input.device_id}`;
  const issuedAt = new Date();

  await insertDeviceCommand({
    id,
    requestId,
    deviceId: input.device_id,
    command: input.command,
    topic,
    issuedAt,
  });

  const payload = JSON.stringify({
    command_id: id,
    request_id: requestId,
    device_id: input.device_id,
    command: input.command,
    issued_at: issuedAt.toISOString(),
  });

  try {
    await publishMqtt(topic, payload);

    const publishedAt = new Date();

    await markDeviceCommandPublished(id, publishedAt);

    return {
      id,
      device_id: input.device_id,
      command: input.command,
      topic,
      status: "PUBLISHED",
      published_at: publishedAt.toISOString(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown MQTT error";

    await markDeviceCommandFailed(id, message);

    throw error;
  }
}
