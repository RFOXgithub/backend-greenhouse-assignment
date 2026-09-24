import { markDeviceCommandExecuted } from "./device.repository.js";

const acknowledgementTopicPattern =
  /^greenhouse\/status\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DeviceAcknowledgement {
  command_id: string;
  device_id: string;
  status: "EXECUTED";
  executed_at: string;
}

function parseAcknowledgement(
  topic: string,
  rawPayload: Buffer,
): DeviceAcknowledgement {
  const topicMatch = acknowledgementTopicPattern.exec(topic);
  if (!topicMatch) throw new Error("Invalid acknowledgement topic");

  const payload: unknown = JSON.parse(rawPayload.toString("utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Acknowledgement payload must be an object");
  }

  const value = payload as Record<string, unknown>;
  if (typeof value.command_id !== "string" || !uuidPattern.test(value.command_id)) {
    throw new Error("Invalid command_id");
  }
  if (typeof value.device_id !== "string" || value.device_id !== topicMatch[1]) {
    throw new Error("device_id does not match acknowledgement topic");
  }
  if (value.status !== "EXECUTED") {
    throw new Error("Acknowledgement status must be EXECUTED");
  }
  if (
    typeof value.executed_at !== "string" ||
    Number.isNaN(Date.parse(value.executed_at))
  ) {
    throw new Error("Invalid executed_at timestamp");
  }

  return {
    command_id: value.command_id,
    device_id: value.device_id,
    status: value.status,
    executed_at: value.executed_at,
  };
}

export async function handleDeviceAcknowledgement(
  topic: string,
  rawPayload: Buffer,
): Promise<void> {
  const acknowledgement = parseAcknowledgement(topic, rawPayload);
  const updated = await markDeviceCommandExecuted(
    acknowledgement.command_id,
    acknowledgement.device_id,
    new Date(acknowledgement.executed_at),
  );

  if (!updated) {
    throw new Error("Acknowledgement does not match an active device command");
  }

  console.info("MQTT device acknowledgement processed", {
    commandId: acknowledgement.command_id,
    deviceId: acknowledgement.device_id,
  });
}
