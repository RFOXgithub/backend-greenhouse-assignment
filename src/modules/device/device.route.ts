import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Static } from "@sinclair/typebox";
import { DeviceControlBodySchema } from "./device.schema.js";
import { controlDevice } from "./device.service.js";

export async function deviceRoutes(app: FastifyInstance) {
  app.post<{ Body: Static<typeof DeviceControlBodySchema> }>(
    "/device-control",
    {
      schema: {
        tags: ["Device"],
        body: DeviceControlBodySchema,
      },
    },
    async (request, reply) => {
      const rawRequestId = request.headers["x-request-id"];
      const requestId =
        typeof rawRequestId === "string" && rawRequestId.length <= 128
          ? rawRequestId
          : randomUUID();

      const data = await controlDevice(request.body, requestId);

      return reply.code(200).send({
        success: true,
        data,
        request_id: requestId,
      });
    },
  );
}
