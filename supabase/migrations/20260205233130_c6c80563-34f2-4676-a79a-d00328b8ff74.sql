-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule if exists
SELECT cron.unschedule('automation-delay-processor') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'automation-delay-processor'
);

-- Schedule automation-delay-processor to run every minute
SELECT cron.schedule(
  'automation-delay-processor',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/automation-delay-processor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbWFsemxmbmJvdW9ieWp3bHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MjQ1ODYsImV4cCI6MjA4MzUwMDU4Nn0.81N4uCUaIFOm7DHMaHa9Rhh-OoY06j6Ig4AFibzXuQU'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);