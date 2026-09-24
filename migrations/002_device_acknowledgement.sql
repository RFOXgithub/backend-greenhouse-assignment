ALTER TABLE device_commands
ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

ALTER TABLE device_commands
DROP CONSTRAINT IF EXISTS command_status_valid;

ALTER TABLE device_commands
ADD CONSTRAINT command_status_valid
CHECK (status IN ('PENDING', 'PUBLISHED', 'EXECUTED', 'FAILED'));
