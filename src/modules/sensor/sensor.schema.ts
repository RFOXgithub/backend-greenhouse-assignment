import { Type } from "@sinclair/typebox";

export const SensorBodySchema = Type.Object(
  {
    device_id: Type.String({
      minLength: 1,
      maxLength: 128,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$",
    }),
    temperature: Type.Number({ minimum: -50, maximum: 100 }),
    humidity: Type.Number({ minimum: 0, maximum: 100 }),
    recorded_at: Type.Optional(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
