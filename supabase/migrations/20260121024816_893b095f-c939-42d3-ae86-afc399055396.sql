-- Enable required extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule recurring entries generator to run daily at 6:00 AM UTC
SELECT cron.schedule(
  'generate-recurring-entries',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/recurring-entries-generator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbWFsemxmbmJvdW9ieWp3bHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2OTA2NzYsImV4cCI6MjA2MzI2NjY3Nn0.G1VT0sUX8Vk7gUkCfrxVq03tKALZpHPbP3Wgz5VhaG0"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);