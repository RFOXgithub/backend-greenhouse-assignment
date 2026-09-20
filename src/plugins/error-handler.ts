import type { FastifyInstance } from "fastify";
import { DatabaseOperationError } from "../db/errors.js";
import { MqttUnavailableError } from "../mqtt/client.js";

function isValidationError(
  error: unknown,
): error is { validation: NonNullable<unknown> } {
  return (
    typeof error === "object" &&
    error !== null &&
    "validation" in error &&
    Boolean(error.validation)
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === statusCode
  );
}

export async function registerErrorHandler(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method}:${request.url} not found`,
      },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const isExpectedClientError =
      isValidationError(error) ||
      hasErrorCode(error, "FST_ERR_CTP_INVALID_JSON_BODY") ||
      hasErrorCode(error, "FST_ERR_CTP_BODY_TOO_LARGE") ||
      hasStatusCode(error, 429);

    if (isExpectedClientError) {
      request.log.warn({ err: error }, "Request rejected");
    } else {
      request.log.error({ err: error }, "Request failed");
    }

    if (isValidationError(error)) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.validation,
        },
      });
    }

    if (hasErrorCode(error, "FST_ERR_CTP_INVALID_JSON_BODY")) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "MALFORMED_JSON",
          message: "Request body must contain valid JSON",
        },
      });
    }

    if (hasErrorCode(error, "FST_ERR_CTP_BODY_TOO_LARGE")) {
      return reply.code(413).send({
        success: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body exceeds the 1 MiB limit",
        },
      });
    }

    if (error instanceof MqttUnavailableError) {
      return reply.code(503).send({
        success: false,
        error: {
          code: "MQTT_UNAVAILABLE",
          message: "MQTT broker is unavailable",
        },
      });
    }

    if (error instanceof DatabaseOperationError) {
      return reply.code(503).send({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database service is unavailable",
        },
      });
    }

    if (hasStatusCode(error, 429)) {
      return reply.code(429).send({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests; please retry later",
        },
      });
    }

    return reply.code(500).send({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    });
  });
}
