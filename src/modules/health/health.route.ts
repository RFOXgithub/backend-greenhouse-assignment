import type { FastifyInstance } from "fastify";
import { getHealth } from "./health.service.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/status", { schema: { tags: ["Health"] } }, async (_, reply) => {
    const health = await getHealth();
    return reply.code(health.healthy ? 200 : 503).send(health.body);
  });
}
