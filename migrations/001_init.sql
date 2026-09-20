CREATE TABLE IF NOT EXISTS sensor_readings (
    id UUID PRIMARY KEY,
    device_id VARCHAR(128) NOT NULL,
    temperature DOUBLE PRECISION NOT NULL,
    humidity DOUBLE PRECISION NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT sensor_device_id_valid
      CHECK (device_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
    CONSTRAINT sensor_temperature_valid
      CHECK (temperature >= -50 AND temperature <= 100),
    CONSTRAINT sensor_humidity_valid
      CHECK (humidity >= 0 AND humidity <= 100)
);

CREATE INDEX IF NOT EXISTS idx_sensor_device_recorded_at
ON sensor_readings(device_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_recorded_at
ON sensor_readings(recorded_at DESC);

CREATE TABLE IF NOT EXISTS device_commands (
    id UUID PRIMARY KEY,
    request_id VARCHAR(128) NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    command VARCHAR(8) NOT NULL,
    mqtt_topic VARCHAR(255) NOT NULL,
    status VARCHAR(16) NOT NULL,
    error_message TEXT,
    issued_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT command_valid CHECK (command IN ('ON', 'OFF')),
    CONSTRAINT command_status_valid CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED'))
);