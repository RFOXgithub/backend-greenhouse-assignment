import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { startMqtt, stopMqtt } from "./mqtt/client.js";

async function main() {
  await pool.query("SELECT 1");
  await migrate();

  startMqtt();

  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Graceful shutdown started");

    await app.close();
    await stopMqtt();
    await pool.end();

    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({
    host: env.host,
    port: env.port,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
