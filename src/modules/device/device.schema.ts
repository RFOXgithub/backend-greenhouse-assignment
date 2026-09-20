import { Type } from "@sinclair/typebox";

export const DeviceControlBodySchema = Type.Object(
  {
    device_id: Type.String({
      minLength: 1,
      maxLength: 128,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$",
    }),
    command: Type.Union([Type.Literal("ON"), Type.Literal("OFF")]),
  },
  { additionalProperties: false },
);
