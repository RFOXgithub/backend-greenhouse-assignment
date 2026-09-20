import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import rateLimit from "@fastify/rate-limit";
import { sensorRoutes } from "./modules/sensor/sensor.route.js";
import { deviceRoutes } from "./modules/device/device.route.js";
import { healthRoutes } from "./modules/health/health.route.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { env } from "./config/env.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.logLevel,
    },
    bodyLimit: 1024 * 1024,
    ajv: {
      customOptions: {
        coerceTypes: false,
      },
    },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Smart Greenhouse Backend API",
        version: "1.0.0",
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await registerErrorHandler(app);

  await app.register(sensorRoutes);
  await app.register(deviceRoutes);
  await app.register(healthRoutes);

  return app;
}
