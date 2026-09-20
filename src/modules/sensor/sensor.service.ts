import { randomUUID } from "node:crypto";
import { insertSensorReading } from "./sensor.repository.js";

export interface CreateSensorInput {
  device_id: string;
  temperature: number;
  humidity: number;
  recorded_at?: string;
}

export async function createSensorReading(input: CreateSensorInput) {
  const now = new Date();
  const recordedAt = input.recorded_at ? new Date(input.recorded_at) : now;

  const reading = {
    id: randomUUID(),
    deviceId: input.device_id,
    temperature: input.temperature,
    humidity: input.humidity,
    recordedAt,
    createdAt: now,
  };

  await insertSensorReading(reading);

  return {
    id: reading.id,
    device_id: reading.deviceId,
    temperature: reading.temperature,
    humidity: reading.humidity,
    recorded_at: reading.recordedAt.toISOString(),
    created_at: reading.createdAt.toISOString(),
  };
}
