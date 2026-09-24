import { pool } from "../../db/pool.js";
import { DatabaseOperationError } from "../../db/errors.js";

export interface NewDeviceCommand {
  id: string;
  requestId: string;
  deviceId: string;
  command: "ON" | "OFF";
  topic: string;
  issuedAt: Date;
}

export async function insertDeviceCommand(input: NewDeviceCommand) {
  try {
    await pool.query(
      `INSERT INTO device_commands
         (id, request_id, device_id, command, mqtt_topic, status, issued_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)`,
      [
        input.id,
        input.requestId,
        input.deviceId,
        input.command,
        input.topic,
        input.issuedAt,
      ],
    );
  } catch (error) {
    throw new DatabaseOperationError(error);
  }
}

export async function markDeviceCommandPublished(id: string, publishedAt: Date) {
  try {
    await pool.query(
      `UPDATE device_commands
       SET status = 'PUBLISHED', published_at = $2
       WHERE id = $1 AND status = 'PENDING'`,
      [id, publishedAt],
    );
  } catch (error) {
    throw new DatabaseOperationError(error);
  }
}

export async function markDeviceCommandExecuted(
  id: string,
  deviceId: string,
  executedAt: Date,
): Promise<boolean> {
  try {
    const result = await pool.query(
      `UPDATE device_commands
       SET status = 'EXECUTED', executed_at = COALESCE(executed_at, $3)
       WHERE id = $1
         AND device_id = $2
         AND status IN ('PENDING', 'PUBLISHED', 'EXECUTED')
       RETURNING id`,
      [id, deviceId, executedAt],
    );
    return result.rowCount === 1;
  } catch (error) {
    throw new DatabaseOperationError(error);
  }
}

export async function markDeviceCommandFailed(id: string, message: string) {
  try {
    await pool.query(
      `UPDATE device_commands
       SET status = 'FAILED', error_message = $2
       WHERE id = $1`,
      [id, message.slice(0, 500)],
    );
  } catch (error) {
    throw new DatabaseOperationError(error);
  }
}
