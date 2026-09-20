import { pool } from "../../db/pool.js";
import { DatabaseOperationError } from "../../db/errors.js";

export interface SensorReading {
  id: string;
  deviceId: string;
  temperature: number;
  humidity: number;
  recordedAt: Date;
  createdAt: Date;
}

export async function insertSensorReading(
  reading: SensorReading,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO sensor_readings
        (id, device_id, temperature, humidity, recorded_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        reading.id,
        reading.deviceId,
        reading.temperature,
        reading.humidity,
        reading.recordedAt,
        reading.createdAt,
      ],
    );
  } catch (error) {
    throw new DatabaseOperationError(error);
  }
}
