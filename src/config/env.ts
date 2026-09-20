import dotenv from "dotenv";

dotenv.config({ quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: required("DATABASE_URL"),
  mqttUrl: required("MQTT_URL"),
  mqttClientId: process.env.MQTT_CLIENT_ID ?? `greenhouse-api-${process.pid}`,
  mqttUsername: process.env.MQTT_USERNAME || undefined,
  mqttPassword: process.env.MQTT_PASSWORD || undefined,
  logLevel: process.env.LOG_LEVEL ?? "info",
};

if (!Number.isInteger(env.port) || env.port <= 0 || env.port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}
