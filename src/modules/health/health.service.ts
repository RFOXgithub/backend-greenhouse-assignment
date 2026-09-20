import { pool } from "../../db/pool.js";
import { mqttConnected } from "../../mqtt/client.js";

export async function getHealth() {
  let databaseUp = false;
  let dbLatencyMs: number | null = null;

  const started = performance.now();

  try {
    await pool.query("SELECT 1");
    databaseUp = true;
    dbLatencyMs = Math.round(performance.now() - started);
  } catch {
    databaseUp = false;
  }

  const mqttUp = mqttConnected();
  const healthy = databaseUp && mqttUp;

  return {
    healthy,
    body: {
      status: healthy ? "healthy" : "unhealthy",
      service: { status: "up" },
      database: {
        status: databaseUp ? "up" : "down",
        latency_ms: dbLatencyMs,
      },
      mqtt: {
        status: mqttUp ? "up" : "down",
        connected: mqttUp,
      },
      timestamp: new Date().toISOString(),
    },
  };
}
