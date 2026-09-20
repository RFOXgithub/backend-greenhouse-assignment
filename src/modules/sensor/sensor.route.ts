import type { FastifyInstance } from "fastify";
import type { Static } from "@sinclair/typebox";
import { SensorBodySchema } from "./sensor.schema.js";
import { createSensorReading } from "./sensor.service.js";
import "@fastify/swagger";

export async function sensorRoutes(app: FastifyInstance) {
  app.post<{ Body: Static<typeof SensorBodySchema> }>(
    "/sensor-data",
    {
      schema: {
        tags: ["Sensor"],
        body: SensorBodySchema,
      },
    },
    async (request, reply) => {
      const data = await createSensorReading(request.body);

      return reply.code(201).send({
        success: true,
        data,
      });
    },
  );
}
